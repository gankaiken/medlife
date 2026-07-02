import type { ActivePatient } from '../game/types';
import type { CaseEvaluationInput } from '../agents/customTools';

export interface EvalHistoryEntry {
  id: string;
  savedAt: string;
  caseId: string;
  caseName: string;
  caseAge: number;
  caseGender: 'M' | 'F';
  diagnosisLabel: string;
  patientName: string;
  verdict: string;
  evaluation: CaseEvaluationInput;
  patientSnapshot?: ActivePatient | null;
}

const STORAGE_KEY = 'medlife.evalHistory';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readAll(): EvalHistoryEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: EvalHistoryEntry[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function listEvalHistory(): EvalHistoryEntry[] {
  return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function getEvalHistory(id: string): EvalHistoryEntry | null {
  return readAll().find((item) => item.id === id) ?? null;
}

export function saveEvalHistory(
  entry: Omit<EvalHistoryEntry, 'id' | 'savedAt' | 'patientName'> & Partial<Pick<EvalHistoryEntry, 'id' | 'savedAt' | 'patientName'>>,
): void {
  const complete: EvalHistoryEntry = {
    ...entry,
    id: entry.id ?? `eval-${Date.now()}`,
    savedAt: entry.savedAt ?? new Date().toISOString(),
    patientName: entry.patientName ?? entry.caseName,
  };
  const next = [complete, ...readAll().filter((item) => item.id !== complete.id)];
  writeAll(next);
}

export function deleteEvalHistory(id: string): void {
  writeAll(readAll().filter((item) => item.id !== id));
}
