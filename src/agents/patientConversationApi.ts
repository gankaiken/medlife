import { z } from 'zod';
import { buildApiUrl } from './debriefApi.ts';
import type { ConversationMode, EncounterTranscriptTurn } from '../game/types.ts';

export const conversationModeSchema = z.enum(['guided', 'text_ai']);
export const patientReplyEngineSchema = z.enum(['ai_text']);

const transcriptTurnSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['assistant', 'user', 'system']),
  content: z.string().min(1).max(700),
  source: z.enum(['guided', 'voice', 'manual', 'text_ai']).optional(),
  timestamp: z.number(),
  learnerMessageId: z.string().nullable().optional(),
  engine: z.enum(['guided', 'ai_text', 'fallback_guided']).nullable().optional(),
  disclosedFactIds: z.array(z.string()).default([]),
  verifiedDisclosedFactIds: z.array(z.string()).default([]),
  disclosureReceiptId: z.string().nullable().optional(),
});

const disclosureReceiptSchema = z.object({
  receiptId: z.string().min(1),
  encounterId: z.string().min(1),
  learnerMessageId: z.string().min(1),
  patientMessageId: z.string().min(1),
  caseId: z.string().min(1),
  caseVersion: z.string().min(1),
  eligibleFactIds: z.array(z.string()).default([]),
  verifiedDisclosedFactIds: z.array(z.string()).default([]),
  historyDomainIds: z.array(z.string()).default([]),
  conversationTurn: z.number().int().min(1),
  engine: z.enum(['guided', 'ai_text', 'fallback_guided']),
  createdAt: z.number(),
  integrityDigest: z.string().min(1),
  integritySource: z.enum(['backend', 'guided']),
  status: z.enum(['verified', 'fallback', 'invalid']),
});

export const patientRespondRequestSchema = z.object({
  encounter_id: z.string().min(1),
  case_id: z.string().min(1),
  learner_message_id: z.string().min(1),
  learner_message: z.string().min(1).max(500),
  conversation_turn_number: z.number().int().min(1).max(16),
  conversation_history: z.array(transcriptTurnSchema).max(24),
  language: z.string().optional(),
  communication_style: z.string().optional(),
});

export const patientRespondResponseSchema = z.object({
  message_id: z.string().min(1),
  encounter_id: z.string().min(1),
  case_id: z.string().min(1),
  patient_reply: z.string().min(1).max(700),
  engine: patientReplyEngineSchema,
  timestamp: z.number(),
  eligible_fact_ids: z.array(z.string()).default([]),
  verified_disclosed_fact_ids: z.array(z.string()).default([]),
  disclosure_receipt: disclosureReceiptSchema,
  refused_hidden_request: z.boolean().default(false),
  conversation_status: z.enum(['answered', 'needs_clarification', 'refused_hidden']).default('answered'),
  safety_status: z.enum(['ok', 'fallback_required']).default('ok'),
});

export type PatientRespondRequest = z.infer<typeof patientRespondRequestSchema>;
export type PatientRespondResponse = z.infer<typeof patientRespondResponseSchema>;
export type PatientConversationMode = z.infer<typeof conversationModeSchema>;

export const MAX_LEARNER_MESSAGE_CHARS = 500;
export const MAX_PATIENT_TRANSCRIPT_TURNS = 24;

export function createLearnerMessageId(encounterId: string, turnNumber: number): string {
  return `${encounterId}-learner-${turnNumber}`;
}

export function sanitizeConversationHistoryForRequest(
  transcript: EncounterTranscriptTurn[],
): PatientRespondRequest['conversation_history'] {
  return transcript
    .slice(-MAX_PATIENT_TRANSCRIPT_TURNS)
    .map((turn) => ({
      id: turn.id,
      role: turn.role,
      content: turn.content,
      source: turn.source,
      timestamp: turn.timestamp,
      learnerMessageId: turn.learnerMessageId ?? null,
      engine: turn.engine ?? null,
      disclosedFactIds: turn.disclosedFactIds ?? [],
      verifiedDisclosedFactIds: turn.verifiedDisclosedFactIds ?? [],
      disclosureReceiptId: turn.disclosureReceiptId ?? null,
    }));
}

export function buildPatientRespondRequest(args: {
  encounterId: string;
  caseId: string;
  learnerMessageId: string;
  learnerMessage: string;
  transcript: EncounterTranscriptTurn[];
  turnNumber: number;
}): PatientRespondRequest {
  return patientRespondRequestSchema.parse({
    encounter_id: args.encounterId,
    case_id: args.caseId,
    learner_message_id: args.learnerMessageId,
    learner_message: args.learnerMessage.trim(),
    conversation_turn_number: args.turnNumber,
    conversation_history: sanitizeConversationHistoryForRequest(args.transcript),
  });
}

export function shouldAcceptPatientResponse(args: {
  expectedEncounterId: string;
  expectedLearnerMessageId: string;
  currentEncounterId: string | null | undefined;
  response: PatientRespondResponse;
}): boolean {
  return (
    args.currentEncounterId === args.expectedEncounterId &&
    args.response.encounter_id === args.expectedEncounterId &&
    args.response.message_id === `patient-${args.expectedLearnerMessageId}`
  );
}

export async function requestPatientReply(
  request: PatientRespondRequest,
  signal?: AbortSignal,
): Promise<PatientRespondResponse> {
  const res = await fetch(buildApiUrl('/agent/patient/respond'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok) {
    throw new Error(`POST /agent/patient/respond failed: ${res.status}`);
  }
  return patientRespondResponseSchema.parse(await res.json());
}

export function getConversationModeLabel(mode: ConversationMode): string {
  return mode === 'text_ai' ? 'AI patient — text' : 'Guided consultation';
}
