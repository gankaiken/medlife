import { useSyncExternalStore } from 'react';
import { CASES } from '../data/cases.ts';
import { getPatientCase } from '../data/patients.ts';
import { buildGuidedDisclosureReceipt } from '../agents/disclosureReceipts.ts';
import { CLINIC_IDS, type ClinicId } from './clinic.ts';
import type {
  ActivePatient,
  ConversationMode,
  DisclosureReceipt,
  EncounterTranscriptTurn,
  EndConfirmChecks,
  FallbackTransition,
  GameState,
  LearnerReflection,
  Prescription,
  Screen,
  Tweaks,
} from './types.ts';

export type EncounterStoreEvent =
  | { type: 'encounter_started'; patient: ActivePatient }
  | { type: 'history_question'; patient: ActivePatient; questionId: string }
  | { type: 'test_ordered'; patient: ActivePatient; testId: string }
  | { type: 'result_viewed'; patient: ActivePatient; testId: string }
  | { type: 'diagnosis_selected'; patient: ActivePatient; diagnosisId: string }
  | { type: 'prescription_added'; patient: ActivePatient; prescription: Prescription }
  | { type: 'conversation_mode_set'; patient: ActivePatient; mode: ConversationMode }
  | { type: 'transcript_appended'; patient: ActivePatient; turn: EncounterTranscriptTurn }
  | { type: 'receipt_appended'; patient: ActivePatient; receipt: DisclosureReceipt }
  | { type: 'conversation_failure'; patient: ActivePatient; messageId: string }
  | { type: 'fallback_transition'; patient: ActivePatient; transition: FallbackTransition }
  | { type: 'end_confirm_toggled'; patient: ActivePatient; endConfirm: EndConfirmChecks }
  | { type: 'encounter_finished'; patient: ActivePatient };

export const POLYCLINIC_BED_INDEX = 0;

const DEFAULT_TWEAKS: Tweaks = {
  avatarStyle: 'cute',
  palette: 'medlife',
  intensity: 'cozy',
};

const DEFAULT_END_CONFIRM: EndConfirmChecks = {
  sum: false,
  safe: false,
  ice: false,
};

const initialCaseId = CASES[0]?.id ?? 'case-headache-001';

function createEncounterId(caseId: string): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return `enc-${caseId}-${cryptoRef.randomUUID()}`;
  }
  return `enc-${caseId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildInitialState(): GameState {
  return {
    screen: 'splash',
    onboardingStep: 0,
    selectedCaseId: initialCaseId,
    viewedEvalHistoryId: null,
    endConfirm: DEFAULT_END_CONFIRM,
    tweaks: DEFAULT_TWEAKS,
    lastEncounter: null,
    polyclinic: {
      clinic: 'all-specialties',
      patient: null,
    },
  };
}

let state: GameState = buildInitialState();

export function resetGameStateForTests(): void {
  state = buildInitialState();
  emit();
}

const listeners = new Set<() => void>();
const encounterEventListeners = new Set<(event: EncounterStoreEvent) => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

function emitEncounterEvent(event: EncounterStoreEvent): void {
  for (const cb of encounterEventListeners) cb(event);
}

function setState(updater: (prev: GameState) => GameState): void {
  state = updater(state);
  emit();
}

function buildActivePatient(caseId: string): ActivePatient | null {
  const c = getPatientCase(caseId);
  if (!c) return null;
  return {
    encounterId: createEncounterId(caseId),
    bedIndex: POLYCLINIC_BED_INDEX,
    arrivedAt: Date.now(),
    case: c,
    askedQuestionIds: [],
    orderedTestIds: [],
    completedTestIds: [],
    viewedResultIds: [],
    testOrderedAt: {},
    givenTreatmentIds: [],
    prescriptions: [],
    submittedDiagnosisId: null,
    conversationMode: 'guided',
    conversationTurnCount: 0,
    failedConversationTurnIds: [],
    fallbackTransitions: [],
    transcript: [],
    disclosureReceipts: [],
    evidenceIntegrityStatus: 'live_verified',
    learnerReflection: null,
    completedAt: null,
    endConfirm: null,
  };
}

function nextCaseIdForClinic(clinic: ClinicId, currentCaseId?: string): string | null {
  const pool = clinic === 'all-specialties'
    ? CASES
    : CASES.filter((item) => item.clinic === clinic);
  if (pool.length === 0) return null;
  if (!currentCaseId) return pool[0].id;
  const idx = pool.findIndex((item) => item.id === currentCaseId);
  return pool[(idx + 1 + pool.length) % pool.length]?.id ?? pool[0].id;
}

export const store = {
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  subscribeEncounterEvents(cb: (event: EncounterStoreEvent) => void): () => void {
    encounterEventListeners.add(cb);
    return () => encounterEventListeners.delete(cb);
  },

  getState(): GameState {
    return state;
  },

  setScreen(screen: Screen): void {
    setState((prev) => ({ ...prev, screen }));
  },

  beginFromSplash(): void {
    setState((prev) => ({ ...prev, screen: 'onboarding' }));
  },

  setOnboardingStep(step: number): void {
    setState((prev) => ({ ...prev, onboardingStep: Math.max(0, step) }));
  },

  finishOnboarding(): void {
    setState((prev) => ({ ...prev, screen: 'home' }));
  },

  setPolyclinicClinic(clinic: ClinicId): void {
    const fallbackCaseId = nextCaseIdForClinic(clinic) ?? prevSelectedCaseId();
    setState((prev) => ({
      ...prev,
      selectedCaseId: fallbackCaseId,
      polyclinic: { ...prev.polyclinic, clinic },
    }));
  },

  selectCase(caseId: string): void {
    setState((prev) => ({
      ...prev,
      selectedCaseId: caseId,
      screen: 'brief',
      viewedEvalHistoryId: null,
    }));
  },

  pickNextCaseId(): string | null {
    return nextCaseIdForClinic(state.polyclinic.clinic, state.selectedCaseId);
  },

  acceptNextPatient(caseId?: string): void {
    const nextId = caseId ?? this.pickNextCaseId() ?? state.selectedCaseId;
    const patient = buildActivePatient(nextId);
    setState((prev) => ({
      ...prev,
      selectedCaseId: nextId,
      polyclinic: { ...prev.polyclinic, patient },
      endConfirm: DEFAULT_END_CONFIRM,
      viewedEvalHistoryId: null,
      screen: 'brief',
    }));
    if (patient) emitEncounterEvent({ type: 'encounter_started', patient });
  },

  loadPolyclinicPatient(caseId?: string | null): void {
    const nextId = caseId ?? state.selectedCaseId;
    const patient = buildActivePatient(nextId);
    if (!patient) return;
    setState((prev) => ({
      ...prev,
      selectedCaseId: nextId,
      polyclinic: { ...prev.polyclinic, patient },
    }));
    emitEncounterEvent({ type: 'encounter_started', patient });
  },

  hydrateEncounter(patient: ActivePatient): void {
    setState((prev) => ({
      ...prev,
      selectedCaseId: patient.case.id,
      polyclinic: { ...prev.polyclinic, patient },
      endConfirm: patient.endConfirm ?? DEFAULT_END_CONFIRM,
      viewedEvalHistoryId: null,
      screen: 'encounter',
    }));
  },

  askPolyclinicQuestion(questionId: string): void {
    mutatePatient((patient) => {
      if (!patient.askedQuestionIds.includes(questionId)) {
        patient.askedQuestionIds = [...patient.askedQuestionIds, questionId];
      }
      const qa = patient.case.anamnesis.find((item) => item.id === questionId);
      if (qa) {
        const now = Date.now();
        const learnerId = `guided-${questionId}-${now}`;
        const learnerTurn: EncounterTranscriptTurn = {
          id: learnerId,
          role: 'user',
          content: qa.question,
          source: 'guided',
          timestamp: now,
          learnerMessageId: learnerId,
          engine: 'guided',
        };
        const answerTurn: EncounterTranscriptTurn = {
          id: `guided-reply-${questionId}-${now}`,
          role: 'assistant',
          content: qa.answer,
          source: 'guided',
          timestamp: now + 1,
          learnerMessageId: learnerId,
          engine: 'guided',
          disclosedFactIds: [qa.id],
          verifiedDisclosedFactIds: [qa.id],
        };
        patient.transcript = [
          ...patient.transcript,
          learnerTurn,
          answerTurn,
        ];
        const receipt = buildGuidedDisclosureReceipt({
          patient,
          questionId,
          questionTurn: learnerTurn,
          answerTurn,
          caseData: patient.case,
        });
        if (receipt) {
          answerTurn.disclosureReceiptId = receipt.receiptId;
          patient.disclosureReceipts = [...patient.disclosureReceipts, receipt];
        }
        patient.conversationTurnCount += 1;
      }
    });
    const nextPatient = state.polyclinic.patient;
    if (nextPatient) emitEncounterEvent({ type: 'history_question', patient: nextPatient, questionId });
  },

  orderPolyclinicTest(testId: string): void {
    mutatePatient((patient) => {
      if (!patient.orderedTestIds.includes(testId)) {
        patient.orderedTestIds = [...patient.orderedTestIds, testId];
      }
      if (!patient.completedTestIds.includes(testId)) {
        patient.completedTestIds = [...patient.completedTestIds, testId];
      }
      patient.testOrderedAt = { ...patient.testOrderedAt, [testId]: Date.now() };
    });
    const nextPatient = state.polyclinic.patient;
    if (nextPatient) emitEncounterEvent({ type: 'test_ordered', patient: nextPatient, testId });
  },

  submitPolyclinicDiagnosis(diagnosisId: string): void {
    mutatePatient((patient) => {
      patient.submittedDiagnosisId = diagnosisId;
    });
    const nextPatient = state.polyclinic.patient;
    if (nextPatient) emitEncounterEvent({ type: 'diagnosis_selected', patient: nextPatient, diagnosisId });
  },

  addPolyclinicPrescription(prescription: Prescription): void {
    mutatePatient((patient) => {
      patient.prescriptions = [...patient.prescriptions, prescription];
    });
    const nextPatient = state.polyclinic.patient;
    if (nextPatient) emitEncounterEvent({ type: 'prescription_added', patient: nextPatient, prescription });
  },

  markResultViewed(testId: string): void {
    mutatePatient((patient) => {
      if (!patient.viewedResultIds.includes(testId)) {
        patient.viewedResultIds = [...patient.viewedResultIds, testId];
      }
    });
    const nextPatient = state.polyclinic.patient;
    if (nextPatient) emitEncounterEvent({ type: 'result_viewed', patient: nextPatient, testId });
  },

  setPatientTranscript(transcript: EncounterTranscriptTurn[]): void {
    mutatePatient((patient) => {
      patient.transcript = transcript.slice();
    });
  },

  setConversationMode(mode: ConversationMode): void {
    mutatePatient((patient) => {
      patient.conversationMode = mode;
    });
    const nextPatient = state.polyclinic.patient;
    if (nextPatient) emitEncounterEvent({ type: 'conversation_mode_set', patient: nextPatient, mode });
  },

  appendTranscriptTurn(turn: EncounterTranscriptTurn): void {
    mutatePatient((patient) => {
      patient.transcript = [...patient.transcript, turn];
    });
    const nextPatient = state.polyclinic.patient;
    if (nextPatient) emitEncounterEvent({ type: 'transcript_appended', patient: nextPatient, turn });
  },

  appendDisclosureReceipt(receipt: DisclosureReceipt): void {
    mutatePatient((patient) => {
      patient.disclosureReceipts = [...patient.disclosureReceipts, receipt];
    });
    const nextPatient = state.polyclinic.patient;
    if (nextPatient) emitEncounterEvent({ type: 'receipt_appended', patient: nextPatient, receipt });
  },

  recordConversationFailure(messageId: string): void {
    mutatePatient((patient) => {
      if (!patient.failedConversationTurnIds.includes(messageId)) {
        patient.failedConversationTurnIds = [...patient.failedConversationTurnIds, messageId];
      }
    });
    const nextPatient = state.polyclinic.patient;
    if (nextPatient) emitEncounterEvent({ type: 'conversation_failure', patient: nextPatient, messageId });
  },

  recordFallbackTransition(transition: FallbackTransition): void {
    mutatePatient((patient) => {
      patient.fallbackTransitions = [...patient.fallbackTransitions, transition];
      patient.conversationMode = transition.to;
    });
    const nextPatient = state.polyclinic.patient;
    if (nextPatient) emitEncounterEvent({ type: 'fallback_transition', patient: nextPatient, transition });
  },

  incrementConversationTurn(): void {
    mutatePatient((patient) => {
      patient.conversationTurnCount += 1;
    });
  },

  updateLearnerReflection(reflection: Partial<LearnerReflection>): void {
    mutatePatient((patient) => {
      patient.learnerReflection = {
        whatWentWell: patient.learnerReflection?.whatWentWell ?? '',
        missedInformation: patient.learnerReflection?.missedInformation ?? '',
        whatDoDifferently: patient.learnerReflection?.whatDoDifferently ?? '',
        weakestReasoningPart: patient.learnerReflection?.weakestReasoningPart ?? '',
        nextPracticeFocus: patient.learnerReflection?.nextPracticeFocus ?? '',
        ...reflection,
      };
    });
  },

  finishPolyclinicCase(): void {
    const completedAt = Date.now();
    const currentPatient = state.polyclinic.patient
      ? {
          ...state.polyclinic.patient,
          viewedResultIds: [...state.polyclinic.patient.viewedResultIds],
          transcript: state.polyclinic.patient.transcript.slice(),
          prescriptions: [...state.polyclinic.patient.prescriptions],
          conversationMode: state.polyclinic.patient.conversationMode,
          conversationTurnCount: state.polyclinic.patient.conversationTurnCount,
          failedConversationTurnIds: [...state.polyclinic.patient.failedConversationTurnIds],
          fallbackTransitions: state.polyclinic.patient.fallbackTransitions.map((item) => ({ ...item })),
          askedQuestionIds: [...state.polyclinic.patient.askedQuestionIds],
          orderedTestIds: [...state.polyclinic.patient.orderedTestIds],
          completedTestIds: [...state.polyclinic.patient.completedTestIds],
          givenTreatmentIds: [...state.polyclinic.patient.givenTreatmentIds],
          testOrderedAt: { ...state.polyclinic.patient.testOrderedAt },
          disclosureReceipts: state.polyclinic.patient.disclosureReceipts.map((item) => ({ ...item })),
          evidenceIntegrityStatus: state.polyclinic.patient.evidenceIntegrityStatus,
          learnerReflection: state.polyclinic.patient.learnerReflection
            ? { ...state.polyclinic.patient.learnerReflection }
            : null,
          completedAt,
          endConfirm: { ...state.endConfirm },
        }
      : null;
    setState((prev) => ({
      ...prev,
      lastEncounter: currentPatient,
      polyclinic: { ...prev.polyclinic, patient: null },
    }));
    if (currentPatient) emitEncounterEvent({ type: 'encounter_finished', patient: currentPatient });
  },

  toggleEndConfirm(id: keyof EndConfirmChecks): void {
    setState((prev) => ({
      ...prev,
      endConfirm: { ...prev.endConfirm, [id]: !prev.endConfirm[id] },
    }));
    const nextPatient = state.polyclinic.patient;
    if (nextPatient) {
      emitEncounterEvent({
        type: 'end_confirm_toggled',
        patient: { ...nextPatient, endConfirm: { ...state.endConfirm } },
        endConfirm: { ...state.endConfirm },
      });
    }
  },

  viewEvalHistory(id: string): void {
    setState((prev) => ({
      ...prev,
      viewedEvalHistoryId: id,
      screen: 'debrief',
    }));
  },

  clearViewedEval(): void {
    setState((prev) => ({ ...prev, viewedEvalHistoryId: null }));
  },
};

function prevSelectedCaseId(): string {
  return CASES.find((item) => CLINIC_IDS.includes(item.clinic))?.id ?? initialCaseId;
}

function mutatePatient(mutator: (patient: ActivePatient) => void): void {
  const current = state.polyclinic.patient;
  if (!current) return;
  const draft: ActivePatient = {
    ...current,
    askedQuestionIds: [...current.askedQuestionIds],
    orderedTestIds: [...current.orderedTestIds],
    completedTestIds: [...current.completedTestIds],
    viewedResultIds: [...current.viewedResultIds],
    testOrderedAt: { ...current.testOrderedAt },
    givenTreatmentIds: [...current.givenTreatmentIds],
    prescriptions: [...current.prescriptions],
    conversationMode: current.conversationMode,
    conversationTurnCount: current.conversationTurnCount,
    failedConversationTurnIds: [...current.failedConversationTurnIds],
    fallbackTransitions: current.fallbackTransitions.map((item) => ({ ...item })),
    transcript: current.transcript.slice(),
    disclosureReceipts: current.disclosureReceipts.map((item) => ({ ...item })),
    evidenceIntegrityStatus: current.evidenceIntegrityStatus,
    learnerReflection: current.learnerReflection ? { ...current.learnerReflection } : null,
    completedAt: current.completedAt ?? null,
    endConfirm: current.endConfirm ? { ...current.endConfirm } : null,
  };
  mutator(draft);
  setState((prev) => ({
    ...prev,
    polyclinic: { ...prev.polyclinic, patient: draft },
  }));
}

export function useStore<T>(selector: (snapshot: GameState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

export function useGameState(): GameState {
  return useStore((snapshot) => snapshot);
}

export function useScreen(): Screen {
  return useStore((snapshot) => snapshot.screen);
}

export function useTweaks(): Tweaks {
  return useStore((snapshot) => snapshot.tweaks);
}
