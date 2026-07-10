import type { ActivePatient } from '../game/types';
import type { CaseEvaluationInput } from '../agents/customTools';

export type AssessmentEngine = 'ai' | 'rule_based' | 'saved' | 'unavailable';

export interface EvalHistoryEntry {
  id: string;
  encounterId: string;
  savedAt: string;
  caseId: string;
  caseName: string;
  caseAge: number;
  caseGender: 'M' | 'F';
  diagnosisLabel: string;
  patientName: string;
  verdict: string;
  engine: AssessmentEngine;
  evaluation: CaseEvaluationInput;
  patientSnapshot?: ActivePatient | null;
}

export interface EvalHistoryRepository {
  list(): EvalHistoryEntry[];
  get(id: string): EvalHistoryEntry | null;
  save(
    entry: Omit<EvalHistoryEntry, 'id' | 'savedAt' | 'patientName'> &
      Partial<Pick<EvalHistoryEntry, 'id' | 'savedAt' | 'patientName'>>,
  ): EvalHistoryEntry;
  remove(id: string): void;
  clearCorrupted(): void;
}

export interface EvalHistoryHealth {
  status: 'ok' | 'empty' | 'partially_recovered' | 'corrupted';
  message: string | null;
}

const STORAGE_KEY = 'medlife.evalHistory';
let lastHealth: EvalHistoryHealth = {
  status: 'empty',
  message: null,
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeEntry(raw: unknown): EvalHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = typeof item.id === 'string' && item.id ? item.id : `eval-${Date.now()}`;
  const encounterId =
    typeof item.encounterId === 'string' && item.encounterId
      ? item.encounterId
      : id;
  const savedAt =
    typeof item.savedAt === 'string' && item.savedAt
      ? item.savedAt
      : new Date().toISOString();
  const caseId = typeof item.caseId === 'string' ? item.caseId : null;
  const caseName = typeof item.caseName === 'string' ? item.caseName : null;
  const caseAge = typeof item.caseAge === 'number' ? item.caseAge : null;
  const caseGender = item.caseGender === 'M' || item.caseGender === 'F' ? item.caseGender : null;
  const diagnosisLabel = typeof item.diagnosisLabel === 'string' ? item.diagnosisLabel : null;
  const verdict = typeof item.verdict === 'string' ? item.verdict : null;
  const evaluation = item.evaluation as CaseEvaluationInput | undefined;
  if (!caseId || !caseName || caseAge === null || !caseGender || !diagnosisLabel || !verdict || !evaluation) {
    return null;
  }

  const legacyEngine = typeof item.engine === 'string' ? item.engine : null;
  const engine: AssessmentEngine =
    legacyEngine === 'ai' || legacyEngine === 'rule_based' || legacyEngine === 'saved' || legacyEngine === 'unavailable'
      ? legacyEngine
      : 'saved';

  const patientName =
    typeof item.patientName === 'string' && item.patientName
      ? item.patientName
      : caseName;

  return {
    id,
    encounterId,
    savedAt,
    caseId,
    caseName,
    caseAge,
    caseGender,
    diagnosisLabel,
    patientName,
    verdict,
    engine,
    evaluation,
    patientSnapshot: (item.patientSnapshot as ActivePatient | null | undefined) ?? null,
  };
}

function readAll(): EvalHistoryEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      lastHealth = { status: 'empty', message: null };
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      lastHealth = {
        status: 'corrupted',
        message: 'Saved history was corrupted and could not be read.',
      };
      return [];
    }
    const normalized = parsed
      .map((item) => normalizeEntry(item))
      .filter((item): item is EvalHistoryEntry => item !== null);
    if (normalized.length === 0 && parsed.length > 0) {
      lastHealth = {
        status: 'corrupted',
        message: 'Saved history was corrupted and no valid attempts could be recovered.',
      };
    } else if (normalized.length < parsed.length) {
      lastHealth = {
        status: 'partially_recovered',
        message: 'Some saved attempts were malformed and were skipped safely.',
      };
    } else {
      lastHealth = {
        status: normalized.length === 0 ? 'empty' : 'ok',
        message: null,
      };
    }
    return normalized;
  } catch {
    lastHealth = {
      status: 'corrupted',
      message: 'Saved history was corrupted and could not be read.',
    };
    return [];
  }
}

function writeAll(entries: EvalHistoryEntry[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export const localEvalHistoryRepository: EvalHistoryRepository = {
  list(): EvalHistoryEntry[] {
    return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },

  get(id: string): EvalHistoryEntry | null {
    return readAll().find((item) => item.id === id) ?? null;
  },

  save(entry) {
    const complete: EvalHistoryEntry = {
      ...entry,
      id: entry.id ?? entry.encounterId ?? `eval-${Date.now()}`,
      encounterId: entry.encounterId ?? entry.id ?? `enc-${Date.now()}`,
      savedAt: entry.savedAt ?? new Date().toISOString(),
      patientName: entry.patientName ?? entry.caseName,
    };
    const next = [complete, ...readAll().filter((item) => item.id !== complete.id)];
    writeAll(next);
    return complete;
  },

  remove(id: string): void {
    writeAll(readAll().filter((item) => item.id !== id));
  },

  clearCorrupted(): void {
    writeAll(readAll());
  },
};

export function listEvalHistory(): EvalHistoryEntry[] {
  return localEvalHistoryRepository.list();
}

export function getEvalHistory(id: string): EvalHistoryEntry | null {
  return localEvalHistoryRepository.get(id);
}

export function saveEvalHistory(
  entry: Omit<EvalHistoryEntry, 'id' | 'savedAt' | 'patientName'> &
    Partial<Pick<EvalHistoryEntry, 'id' | 'savedAt' | 'patientName'>>,
): EvalHistoryEntry {
  return localEvalHistoryRepository.save(entry);
}

export function deleteEvalHistory(id: string): void {
  localEvalHistoryRepository.remove(id);
}

export function getEvalHistoryHealth(): EvalHistoryHealth {
  return lastHealth;
}
