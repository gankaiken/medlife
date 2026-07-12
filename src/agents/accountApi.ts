import { z } from 'zod';
import { buildApiUrl } from './debriefApi';
import type { ActivePatient, EvidenceIntegrityStatus } from '../game/types';
import type { EvalHistoryEntry } from '../data/evalHistory';
import type { CaseEvaluationInput } from './customTools';

const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  display_name: z.string(),
  status: z.string(),
  created_at: z.string(),
  last_login_at: z.string().nullable().optional(),
});

const authSessionSchema = z.object({
  authenticated: z.boolean(),
  user: authUserSchema.nullable(),
  session_expires_at: z.string().nullable().optional(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;

const encounterAttemptSchema = z.record(z.any());
export type EncounterAttempt = z.infer<typeof encounterAttemptSchema>;

const progressSchema = z.object({
  attempts_completed: z.number(),
  recent_scores: z.array(z.record(z.any())),
  domain_averages: z.record(z.number()),
  recent_trend: z.string(),
  frequently_missed_history_domains: z.array(z.record(z.any())),
  safety_critical_omissions: z.number(),
  specialty_coverage: z.record(z.number()),
  cases_attempted: z.number(),
});

export type LearnerProgress = z.infer<typeof progressSchema>;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const hit = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

async function requestJson<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const csrf = readCookie('medlife_csrf');
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (csrf && init.method && init.method !== 'GET') {
    headers.set('X-CSRF-Token', csrf);
  }
  const response = await fetch(buildApiUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let detail: string | null = null;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      detail = parsed.detail ?? null;
    } catch {}
    throw new Error(detail || text || `${init.method ?? 'GET'} ${path} failed`);
  }
  return schema.parse(await response.json());
}

async function requestBlob(path: string, init: RequestInit): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    credentials: 'include',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let detail: string | null = null;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      detail = parsed.detail ?? null;
    } catch {}
    throw new Error(detail || text || `${init.method ?? 'GET'} ${path} failed`);
  }
  const disposition = response.headers.get('Content-Disposition');
  const match = disposition?.match(/filename=\"([^\"]+)\"/i);
  return { blob: await response.blob(), filename: match?.[1] ?? null };
}

export function fetchCurrentSession(): Promise<AuthSession> {
  return requestJson('/auth/me', { method: 'GET' }, authSessionSchema);
}

export function registerAccount(input: { email: string; display_name: string; password: string }): Promise<AuthSession> {
  return requestJson('/auth/register', { method: 'POST', body: JSON.stringify(input) }, authSessionSchema);
}

export function loginAccount(input: { email: string; password: string }): Promise<AuthSession> {
  return requestJson('/auth/login', { method: 'POST', body: JSON.stringify(input) }, authSessionSchema);
}

export function logoutAccount(): Promise<AuthSession> {
  return requestJson('/auth/logout', { method: 'POST' }, authSessionSchema);
}

export function exportAccountData(): Promise<{ blob: Blob; filename: string | null }> {
  return requestBlob('/auth/export', { method: 'GET' });
}

export function createServerEncounter(input: {
  encounter_id: string;
  case_id: string;
  conversation_mode: 'guided' | 'text_ai';
  draft_snapshot: Record<string, unknown>;
}): Promise<EncounterAttempt> {
  return requestJson('/encounters', { method: 'POST', body: JSON.stringify(input) }, encounterAttemptSchema);
}

export function appendEncounterEvent(encounterId: string, input: {
  event_id: string;
  idempotency_key: string;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
  draft_snapshot: Record<string, unknown>;
  integrity_status: EvidenceIntegrityStatus;
}): Promise<Record<string, unknown>> {
  return requestJson(`/encounters/${encounterId}/events`, { method: 'POST', body: JSON.stringify(input) }, z.record(z.any()));
}

export function listServerEncounters(status?: string): Promise<EncounterAttempt[]> {
  const path = status ? `/encounters?status=${encodeURIComponent(status)}` : '/encounters';
  return requestJson(path, { method: 'GET' }, z.array(encounterAttemptSchema));
}

export function getServerEncounter(encounterId: string): Promise<EncounterAttempt> {
  return requestJson(`/encounters/${encounterId}`, { method: 'GET' }, encounterAttemptSchema);
}

export function persistServerAssessment(encounterId: string, input: {
  completion_snapshot: Record<string, unknown>;
  integrity_status: EvidenceIntegrityStatus;
  engine: 'ai' | 'rule_based' | 'saved' | 'unavailable';
  assessment_status: 'pending' | 'completed' | 'fallback_completed' | 'failed';
  evaluation: CaseEvaluationInput;
  evidence_refs: Array<Record<string, unknown>>;
  receipts: Array<Record<string, unknown>>;
}): Promise<EncounterAttempt> {
  return requestJson(`/encounters/${encounterId}/assessment`, { method: 'POST', body: JSON.stringify(input) }, encounterAttemptSchema);
}

export function deleteServerEncounter(encounterId: string): Promise<{ deleted: boolean }> {
  return requestJson(
    `/encounters/${encounterId}`,
    { method: 'DELETE' },
    z.object({ deleted: z.boolean() }),
  ) as Promise<{ deleted: boolean }>;
}

export function fetchLearnerProgress(): Promise<LearnerProgress> {
  return requestJson('/progress', { method: 'GET' }, progressSchema);
}

export function migrateLocalAttempts(entries: EvalHistoryEntry[]): Promise<EncounterAttempt[]> {
  return requestJson(
    '/auth/migrate-local',
    {
      method: 'POST',
      body: JSON.stringify({ entries }),
    },
    z.array(encounterAttemptSchema),
  );
}

export function mapServerAttemptToEvalHistoryEntry(input: EncounterAttempt): EvalHistoryEntry | null {
  const evaluation = input.evaluation as CaseEvaluationInput | undefined;
  const snapshot = (input.completion_snapshot ?? input.draft_snapshot) as ActivePatient | undefined;
  if (!evaluation || !snapshot?.case) return null;
  const verdict = typeof evaluation.global_rating === 'string' ? evaluation.global_rating : 'satisfactory';
  return {
    id: String(input.id),
    encounterId: String(input.id),
    savedAt: String(input.completed_at ?? input.last_activity_at ?? new Date().toISOString()),
    caseId: String(input.case_id ?? snapshot.case.id),
    caseName: String(input.case_name ?? snapshot.case.name),
    caseAge: Number(snapshot.case.age ?? 0),
    caseGender: snapshot.case.gender === 'M' ? 'M' : 'F',
    diagnosisLabel: String(snapshot.submittedDiagnosisId ?? input.case_id ?? 'Unknown'),
    patientName: String(snapshot.case.name ?? input.case_name ?? 'Patient'),
    verdict,
    engine: ((input.assessment_engine_value ?? input.assessment_engine ?? 'saved') as EvalHistoryEntry['engine']),
    evaluation,
    integrityStatus: (input.integrity_status as EvidenceIntegrityStatus) ?? 'server_verified',
    patientSnapshot: snapshot,
  };
}
