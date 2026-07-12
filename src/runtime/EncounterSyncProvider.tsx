import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  appendEncounterEvent,
  createServerEncounter,
  getServerEncounter,
  persistServerAssessment,
  type EncounterAttempt,
} from '../agents/accountApi';
import { store, type EncounterStoreEvent } from '../game/store';
import type { ActivePatient, EvidenceIntegrityStatus } from '../game/types';
import { useAuth } from './AuthProvider';
import { useRuntime } from './RuntimeProvider';

type SyncQueueItem =
  | {
      kind: 'start';
      encounterId: string;
      caseId: string;
      conversationMode: 'guided' | 'text_ai';
      draftSnapshot: Record<string, unknown>;
    }
  | {
      kind: 'event';
      encounterId: string;
      eventId: string;
      idempotencyKey: string;
      sequenceNumber: number;
      eventType: string;
      payload: Record<string, unknown>;
      draftSnapshot: Record<string, unknown>;
      integrityStatus: EvidenceIntegrityStatus;
    }
  | {
      kind: 'assessment';
      encounterId: string;
      completionSnapshot: Record<string, unknown>;
      integrityStatus: EvidenceIntegrityStatus;
      engine: 'ai' | 'rule_based' | 'saved' | 'unavailable';
      assessmentStatus: 'pending' | 'completed' | 'fallback_completed' | 'failed';
      evaluation: Record<string, unknown>;
      evidenceRefs: Array<Record<string, unknown>>;
      receipts: Array<Record<string, unknown>>;
    };

interface EncounterSyncContextValue {
  syncState: 'idle' | 'saving' | 'saved' | 'pending_sync';
  pendingCount: number;
  retrySync: () => Promise<void>;
  persistAssessment: (input: {
    patient: ActivePatient;
    engine: 'ai' | 'rule_based' | 'saved' | 'unavailable';
    assessmentStatus: 'pending' | 'completed' | 'fallback_completed' | 'failed';
    evaluation: Record<string, unknown>;
  }) => Promise<void>;
  hydrateFromServerAttempt: (attempt: EncounterAttempt) => void;
}

const EncounterSyncContext = createContext<EncounterSyncContextValue>({
  syncState: 'idle',
  pendingCount: 0,
  retrySync: async () => undefined,
  persistAssessment: async () => undefined,
  hydrateFromServerAttempt: () => undefined,
});

const PENDING_SYNC_KEY = 'medlife.pendingSync.v1';

type PendingSyncMap = Record<string, SyncQueueItem[]>;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readQueueMap(): PendingSyncMap {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(PENDING_SYNC_KEY);
    return raw ? (JSON.parse(raw) as PendingSyncMap) : {};
  } catch {
    return {};
  }
}

function readQueue(userId: string | null | undefined): SyncQueueItem[] {
  if (!userId) return [];
  const queueMap = readQueueMap();
  return Array.isArray(queueMap[userId]) ? queueMap[userId] : [];
}

function writeQueue(userId: string | null | undefined, items: SyncQueueItem[]) {
  if (!userId || !canUseStorage()) return;
  const queueMap = readQueueMap();
  if (items.length === 0) {
    delete queueMap[userId];
  } else {
    queueMap[userId] = items;
  }
  window.localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queueMap));
}

function writeQueueForCurrentUser(userId: string | null | undefined, items: SyncQueueItem[]) {
  if (!canUseStorage()) return;
  writeQueue(userId, items);
}

function stringifySnapshot(patient: ActivePatient): Record<string, unknown> {
  return JSON.parse(JSON.stringify(patient)) as Record<string, unknown>;
}

function buildEventRecord(event: EncounterStoreEvent, sequenceNumber: number): SyncQueueItem | null {
  switch (event.type) {
    case 'history_question':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-hx-${event.questionId}-${sequenceNumber}`,
        idempotencyKey: `${event.patient.encounterId}:hx:${event.questionId}`,
        sequenceNumber,
        eventType: 'history_question',
        payload: { question_id: event.questionId },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    case 'test_ordered':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-test-${event.testId}-${sequenceNumber}`,
        idempotencyKey: `${event.patient.encounterId}:test:${event.testId}`,
        sequenceNumber,
        eventType: 'test_ordered',
        payload: { test_id: event.testId },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    case 'result_viewed':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-result-${event.testId}-${sequenceNumber}`,
        idempotencyKey: `${event.patient.encounterId}:result:${event.testId}`,
        sequenceNumber,
        eventType: 'result_viewed',
        payload: { test_id: event.testId },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    case 'diagnosis_selected':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-dx-${sequenceNumber}`,
        idempotencyKey: `${event.patient.encounterId}:dx:${event.diagnosisId}`,
        sequenceNumber,
        eventType: 'diagnosis_selected',
        payload: { diagnosis_id: event.diagnosisId },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    case 'prescription_added':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-rx-${sequenceNumber}`,
        idempotencyKey: `${event.patient.encounterId}:rx:${event.prescription.medicationId}:${event.prescription.dose}:${event.prescription.duration}`,
        sequenceNumber,
        eventType: 'prescription_added',
        payload: { ...event.prescription },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    case 'conversation_mode_set':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-mode-${sequenceNumber}`,
        idempotencyKey: `${event.patient.encounterId}:mode:${event.mode}:${sequenceNumber}`,
        sequenceNumber,
        eventType: 'conversation_mode_set',
        payload: { mode: event.mode },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    case 'transcript_appended':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-turn-${event.turn.id}`,
        idempotencyKey: `${event.patient.encounterId}:turn:${event.turn.id}`,
        sequenceNumber,
        eventType: 'transcript_appended',
        payload: { turn: event.turn },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    case 'receipt_appended':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-receipt-${event.receipt.receiptId}`,
        idempotencyKey: `${event.patient.encounterId}:receipt:${event.receipt.receiptId}`,
        sequenceNumber,
        eventType: 'receipt_appended',
        payload: { receipt: event.receipt },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    case 'conversation_failure':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-failure-${event.messageId}`,
        idempotencyKey: `${event.patient.encounterId}:failure:${event.messageId}`,
        sequenceNumber,
        eventType: 'conversation_failure',
        payload: { message_id: event.messageId },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    case 'fallback_transition':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-fallback-${sequenceNumber}`,
        idempotencyKey: `${event.patient.encounterId}:fallback:${event.transition.timestamp}`,
        sequenceNumber,
        eventType: 'fallback_transition',
        payload: { ...event.transition },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    case 'end_confirm_toggled':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-wrap-${sequenceNumber}`,
        idempotencyKey: `${event.patient.encounterId}:wrap:${sequenceNumber}`,
        sequenceNumber,
        eventType: 'end_confirm_updated',
        payload: { ...event.endConfirm },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    case 'encounter_finished':
      return {
        kind: 'event',
        encounterId: event.patient.encounterId,
        eventId: `${event.patient.encounterId}-finished`,
        idempotencyKey: `${event.patient.encounterId}:finished`,
        sequenceNumber,
        eventType: 'encounter_finished',
        payload: { completed_at: event.patient.completedAt ?? Date.now() },
        draftSnapshot: stringifySnapshot(event.patient),
        integrityStatus: event.patient.evidenceIntegrityStatus,
      };
    default:
      return null;
  }
}

export function EncounterSyncProvider({ children }: { children: ReactNode }) {
  const { session, refresh } = useAuth();
  const { backendReachable } = useRuntime();
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'pending_sync'>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const queueRef = useRef<SyncQueueItem[]>([]);
  const nextSequenceRef = useRef<Record<string, number>>({});
  const flushingRef = useRef(false);

  const flushQueue = async () => {
    const userId = session?.user?.id ?? null;
    if (flushingRef.current) return;
    if (!session?.authenticated || !backendReachable) {
      setSyncState(queueRef.current.length > 0 ? 'pending_sync' : 'idle');
      return;
    }
    flushingRef.current = true;
    setSyncState(queueRef.current.length > 0 ? 'saving' : 'idle');
    try {
      while (queueRef.current.length > 0) {
        const next = queueRef.current[0];
        if (next.kind === 'start') {
          await createServerEncounter({
            encounter_id: next.encounterId,
            case_id: next.caseId,
            conversation_mode: next.conversationMode,
            draft_snapshot: next.draftSnapshot,
          });
        } else if (next.kind === 'event') {
          await appendEncounterEvent(next.encounterId, {
            event_id: next.eventId,
            idempotency_key: next.idempotencyKey,
            sequence_number: next.sequenceNumber,
            event_type: next.eventType,
            payload: next.payload,
            draft_snapshot: next.draftSnapshot,
            integrity_status: next.integrityStatus,
          });
        } else {
          await persistServerAssessment(next.encounterId, {
            completion_snapshot: next.completionSnapshot,
            integrity_status: next.integrityStatus,
            engine: next.engine,
            assessment_status: next.assessmentStatus,
            evaluation: next.evaluation,
            evidence_refs: next.evidenceRefs,
            receipts: next.receipts,
          });
        }
        queueRef.current = queueRef.current.slice(1);
        writeQueueForCurrentUser(userId, queueRef.current);
        setPendingCount(queueRef.current.length);
      }
      setSyncState('saved');
      await refresh();
    } catch {
      setSyncState('pending_sync');
    } finally {
      flushingRef.current = false;
    }
  };

  useEffect(() => {
    queueRef.current = readQueue(session?.user?.id ?? null);
    setPendingCount(queueRef.current.length);
    setSyncState(queueRef.current.length > 0 ? 'pending_sync' : 'idle');
    void flushQueue();
  }, [session?.authenticated, session?.user?.id, backendReachable]);

  useEffect(() => {
    return store.subscribeEncounterEvents((event) => {
      const userId = session?.user?.id ?? null;
      if (!session?.authenticated || !userId) return;
      if (event.type === 'encounter_started') {
        nextSequenceRef.current[event.patient.encounterId] = 1;
        queueRef.current = [
          ...queueRef.current,
          {
            kind: 'start',
            encounterId: event.patient.encounterId,
            caseId: event.patient.case.id,
            conversationMode: event.patient.conversationMode,
            draftSnapshot: stringifySnapshot(event.patient),
          },
        ];
      } else {
        const currentSeq = nextSequenceRef.current[event.patient.encounterId] ?? 1;
        const item = buildEventRecord(event, currentSeq);
        if (!item) return;
        queueRef.current = [...queueRef.current, item];
        nextSequenceRef.current[event.patient.encounterId] = currentSeq + 1;
      }
      writeQueueForCurrentUser(userId, queueRef.current);
      setPendingCount(queueRef.current.length);
      setSyncState('saving');
      void flushQueue();
    });
  }, [session?.authenticated, session?.user?.id, backendReachable]);

  const retrySync = async () => {
    await flushQueue();
  };

  const persistAssessment = async (input: {
    patient: ActivePatient;
    engine: 'ai' | 'rule_based' | 'saved' | 'unavailable';
    assessmentStatus: 'pending' | 'completed' | 'fallback_completed' | 'failed';
    evaluation: Record<string, unknown>;
  }) => {
    const userId = session?.user?.id ?? null;
    if (!session?.authenticated || !userId) return;
    queueRef.current = [
      ...queueRef.current,
      {
        kind: 'assessment',
        encounterId: input.patient.encounterId,
        completionSnapshot: stringifySnapshot(input.patient),
        integrityStatus: input.patient.evidenceIntegrityStatus,
        engine: input.engine,
        assessmentStatus: input.assessmentStatus,
        evaluation: input.evaluation,
        evidenceRefs: input.patient.disclosureReceipts.map((receipt) => ({
          receiptId: receipt.receiptId,
          learnerMessageId: receipt.learnerMessageId,
          patientMessageId: receipt.patientMessageId,
          verifiedFactIds: receipt.verifiedDisclosedFactIds,
        })),
        receipts: input.patient.disclosureReceipts.map((receipt) => ({ ...receipt })),
      },
    ];
    writeQueueForCurrentUser(userId, queueRef.current);
    setPendingCount(queueRef.current.length);
    await flushQueue();
  };

  const hydrateFromServerAttempt = (attempt: EncounterAttempt) => {
    const draft = (attempt.draft_snapshot ?? attempt.completion_snapshot) as ActivePatient | undefined;
    if (!draft) return;
    nextSequenceRef.current[draft.encounterId] = Number(attempt.optimistic_version ?? 0) + 1;
    store.hydrateEncounter(draft);
  };

  const value = useMemo(
    () => ({ syncState, pendingCount, retrySync, persistAssessment, hydrateFromServerAttempt }),
    [syncState, pendingCount, session?.authenticated, backendReachable],
  );

  return <EncounterSyncContext.Provider value={value}>{children}</EncounterSyncContext.Provider>;
}

export function useEncounterSync() {
  return useContext(EncounterSyncContext);
}
