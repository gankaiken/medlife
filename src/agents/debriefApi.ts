import { z } from 'zod';
import { caseEvaluationInput } from './customTools.ts';
import type { DebriefRequest } from './debriefRequest';

export const assessmentEngineSchema = z.enum(['ai', 'rule_based', 'saved', 'unavailable']);
export type AssessmentEngine = z.infer<typeof assessmentEngineSchema>;

export const debriefResponseSchema = z.object({
  encounter_id: z.string(),
  engine: assessmentEngineSchema,
  evaluation: caseEvaluationInput,
  warnings: z.array(z.string()).default([]),
});

export type DebriefResponse = z.infer<typeof debriefResponseSchema>;

const runtimeCapabilitiesSchema = z.object({
  backend_available: z.boolean(),
  auth_available: z.boolean(),
  ai_debrief_available: z.boolean(),
  guided_mode_available: z.boolean(),
  text_ai_patient_available: z.boolean(),
  voice_backend_configured: z.boolean(),
  voice_frontend_supported: z.boolean(),
  live_voice_usable: z.boolean(),
  ehr_demo_available: z.boolean(),
  triage_available: z.boolean(),
  persistence_mode: z.enum(['local_storage', 'server_session_sqlite']),
});
export type RuntimeCapabilities = z.infer<typeof runtimeCapabilitiesSchema>;

export function resolveApiBaseFromEnv(rawBase: string | undefined): string {
  const trimmed = rawBase?.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

export function buildApiUrl(
  path: string,
  apiBase: string = resolveApiBaseFromEnv(import.meta.env.VITE_API_BASE_URL),
): string {
  if (!apiBase) return path;
  return `${apiBase}${path}`;
}

const AGENT_BASE = '/agent';

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(buildApiUrl(path));
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  return schema.parse(await res.json());
}

async function postJson<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }
  return schema.parse(await res.json());
}

export async function fetchRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  return getJson<RuntimeCapabilities>(`${AGENT_BASE}/capabilities`, runtimeCapabilitiesSchema);
}

export async function fetchHealth(): Promise<RuntimeCapabilities> {
  return getJson<RuntimeCapabilities>('/health', runtimeCapabilitiesSchema);
}

export async function generateDebrief(request: DebriefRequest): Promise<DebriefResponse> {
  return postJson(`${AGENT_BASE}/debrief`, request, debriefResponseSchema);
}
