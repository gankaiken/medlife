import { z } from 'zod';
import { buildApiUrl } from './debriefApi';
import type { ActivePatient, EvidenceIntegrityStatus } from '../game/types';
import type { EvalHistoryEntry } from '../data/evalHistory';
import type { CaseEvaluationInput } from './customTools';
import { normalizeHistoricalPatientSnapshot } from '../data/historicalDebrief.ts';

const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  display_name: z.string(),
  role: z.enum(['learner', 'educator_reviewer', 'clinical_reviewer', 'curriculum_reviewer', 'pilot_admin']),
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

const userPreferencesSchema = z.object({
  learner_stage: z.enum([
    'pre_clinical_foundation',
    'transition_to_clinical_learning',
    'early_clinical',
    'core_clinical_rotation',
    'pre_intern_preparation',
  ]),
  non_3d_mode: z.boolean(),
  low_bandwidth_mode: z.boolean(),
  reduced_motion_mode: z.boolean(),
  background_audio_enabled: z.boolean(),
  educational_notice_acknowledged_at: z.string().nullable().optional(),
  research_participation_status: z.enum(['not_answered', 'consented', 'declined', 'withdrawn']),
  research_consent_version: z.string().nullable().optional(),
  research_consented_at: z.string().nullable().optional(),
  research_withdrawn_at: z.string().nullable().optional(),
  deidentified_research_id: z.string().nullable().optional(),
  updated_at: z.string(),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

const pilotAttemptSchema = z.record(z.any());
const pilotReviewSchema = z.record(z.any());
const pilotAnalyticsSchema = z.record(z.any());
const consentEventSchema = z.record(z.any());
const researchExportSchema = z.record(z.any());

export type PilotAttempt = z.infer<typeof pilotAttemptSchema>;
export type PilotReview = z.infer<typeof pilotReviewSchema>;
export type PilotAnalytics = z.infer<typeof pilotAnalyticsSchema>;
export type ResearchConsentEvent = z.infer<typeof consentEventSchema>;
export type ResearchExportPayload = z.infer<typeof researchExportSchema>;

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

export function fetchAccountPreferences(): Promise<UserPreferences> {
  return requestJson('/auth/preferences', { method: 'GET' }, userPreferencesSchema);
}

export function updateAccountPreferences(input: {
  learner_stage: UserPreferences['learner_stage'];
  non_3d_mode: boolean;
  low_bandwidth_mode: boolean;
  reduced_motion_mode: boolean;
  background_audio_enabled: boolean;
  educational_notice_acknowledged_at: string | null;
  research_participation_status: UserPreferences['research_participation_status'];
}): Promise<UserPreferences> {
  return requestJson('/auth/preferences', { method: 'PUT', body: JSON.stringify(input) }, userPreferencesSchema);
}

export function listResearchConsentEvents(): Promise<ResearchConsentEvent[]> {
  return requestJson('/auth/research-consent-events', { method: 'GET' }, z.array(consentEventSchema));
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

export function listPilotAttempts(): Promise<PilotAttempt[]> {
  return requestJson('/pilot/attempts', { method: 'GET' }, z.array(pilotAttemptSchema));
}

export function createPilotAttemptReview(
  encounterId: string,
  input: {
    educator_comment: string;
    agreement_label: 'agree' | 'partially_agree' | 'disagree';
    safety_concern_level: 'none' | 'minor_omission' | 'important_omission' | 'safety_critical_omission' | 'potentially_harmful_action';
    reviewed_status: 'educator_reviewed' | 'review_logged';
  },
): Promise<PilotReview> {
  return requestJson(
    `/pilot/attempts/${encounterId}/review`,
    { method: 'POST', body: JSON.stringify(input) },
    pilotReviewSchema,
  );
}

export function createPilotAttemptScore(
  encounterId: string,
  input: {
    rubric_version: string;
    review_mode: 'independent' | 'assisted';
    overall_score: number | null;
    overall_category: string;
    domain_scores: Record<string, Record<string, unknown>>;
    safety_findings: string[];
    missed_history_concepts: string[];
    investigation_evaluation: string;
    diagnosis_evaluation: string;
    communication_evaluation: string;
    educator_comment: string;
    confidence_label: 'low' | 'medium' | 'high';
    review_minutes: number;
    submit_status: 'draft' | 'submitted';
    amended_from_score_id?: string | null;
  },
): Promise<PilotReview> {
  return requestJson(
    `/pilot/attempts/${encounterId}/scores`,
    { method: 'POST', body: JSON.stringify(input) },
    pilotReviewSchema,
  );
}

export function listPilotAttemptScores(encounterId: string): Promise<PilotReview[]> {
  return requestJson(`/pilot/attempts/${encounterId}/scores`, { method: 'GET' }, z.array(pilotReviewSchema));
}

export function listPilotAttemptReviews(encounterId: string): Promise<PilotReview[]> {
  return requestJson(`/pilot/attempts/${encounterId}/reviews`, { method: 'GET' }, z.array(pilotReviewSchema));
}

export function listPilotCaseReviews(caseId?: string): Promise<PilotReview[]> {
  const path = caseId ? `/pilot/case-reviews?case_id=${encodeURIComponent(caseId)}` : '/pilot/case-reviews';
  return requestJson(path, { method: 'GET' }, z.array(pilotReviewSchema));
}

export function createPilotCaseReview(
  caseId: string,
  input: {
    review_type: 'clinical' | 'curriculum' | 'simulation' | 'ai';
    decision: 'request_revision' | 'candidate_public_source_mapping' | 'academic_review_required' | 'academically_reviewed' | 'curriculum_approved' | 'clinically_reviewed' | 'pilot_ready_pending_other_reviews';
    comments: string;
    mapping_version?: string | null;
    next_review_date?: string | null;
    fixture_label?: string | null;
  },
): Promise<PilotReview> {
  return requestJson(
    `/pilot/cases/${caseId}/review`,
    { method: 'POST', body: JSON.stringify(input) },
    pilotReviewSchema,
  );
}

export function fetchPilotAnalytics(): Promise<PilotAnalytics> {
  return requestJson('/pilot/analytics', { method: 'GET' }, pilotAnalyticsSchema);
}

export function exportPilotResearchData(input?: { pilot_id?: string; consent_version?: string | null }): Promise<{ blob: Blob; filename: string | null }> {
  const params = new URLSearchParams();
  if (input?.pilot_id) params.set('pilot_id', input.pilot_id);
  if (input?.consent_version) params.set('consent_version', input.consent_version);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return requestBlob(`/pilot/research/export${suffix}`, { method: 'GET' });
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
  const snapshot = normalizeHistoricalPatientSnapshot(
    (input.completion_snapshot ?? input.draft_snapshot) as ActivePatient | undefined,
  );
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
