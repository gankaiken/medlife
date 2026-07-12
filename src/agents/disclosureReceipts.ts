import type {
  ActivePatient,
  DisclosureReceipt,
  EncounterTranscriptTurn,
  EvidenceIntegrityStatus,
  PatientCase,
} from '../game/types.ts';

export function computeDiagnosisDigest(diagnosisId: string): string {
  let hash = 5381 >>> 0;
  for (const char of diagnosisId) {
    hash = (((hash << 5) + hash) + char.charCodeAt(0)) >>> 0;
  }
  return `medlife:v1:${hash >>> 0}`;
}

// This is a deterministic client-visible checksum, not a cryptographic
// signature. It helps detect accidental corruption and pairs with
// contextual validation, but a user who can edit local state can also
// recompute it.
export function buildReceiptDigest(receipt: Omit<DisclosureReceipt, 'integrityDigest'>): string {
  const source = [
    receipt.receiptId,
    receipt.encounterId,
    receipt.learnerMessageId,
    receipt.patientMessageId,
    receipt.caseId,
    receipt.caseVersion,
    receipt.eligibleFactIds.join(','),
    receipt.verifiedDisclosedFactIds.join(','),
    receipt.historyDomainIds.join(','),
    String(receipt.conversationTurn),
    receipt.engine,
    String(receipt.createdAt),
    receipt.integritySource,
    receipt.status,
  ].join('|');
  let hash = 2166136261 >>> 0;
  for (const char of source) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `receipt:v1:${hash >>> 0}`;
}

export function validateDisclosureReceipt(receipt: DisclosureReceipt): boolean {
  const {
    integrityDigest: _integrityDigest,
    ...unsignedReceipt
  } = receipt;
  const expected = buildReceiptDigest(unsignedReceipt);
  const eligibleSet = new Set(receipt.eligibleFactIds);
  return (
    receipt.integrityDigest === expected &&
    receipt.verifiedDisclosedFactIds.every((factId) => eligibleSet.has(factId))
  );
}

export interface DisclosureReceiptValidationContext {
  encounterId: string;
  caseId: string;
  caseVersion: string;
  allowedFactIds: string[];
  transcript: Array<Pick<EncounterTranscriptTurn, 'id' | 'role' | 'learnerMessageId'>>;
}

export function validateDisclosureReceiptAgainstContext(
  receipt: DisclosureReceipt,
  context: DisclosureReceiptValidationContext,
): boolean {
  if (!validateDisclosureReceipt(receipt)) return false;
  if (receipt.encounterId !== context.encounterId) return false;
  if (receipt.caseId !== context.caseId) return false;
  if (receipt.caseVersion !== context.caseVersion) return false;

  const allowedFactIds = new Set(context.allowedFactIds);
  if (receipt.eligibleFactIds.some((factId) => !allowedFactIds.has(factId))) return false;
  if (receipt.verifiedDisclosedFactIds.some((factId) => !allowedFactIds.has(factId))) return false;

  const learnerTurn = context.transcript.find((turn) => turn.id === receipt.learnerMessageId);
  const patientTurn = context.transcript.find((turn) => turn.id === receipt.patientMessageId);
  if (!learnerTurn || learnerTurn.role !== 'user') return false;
  if (!patientTurn || patientTurn.role !== 'assistant') return false;
  if ((patientTurn.learnerMessageId ?? null) !== receipt.learnerMessageId) return false;
  if (learnerTurn.learnerMessageId && learnerTurn.learnerMessageId !== receipt.learnerMessageId) return false;

  return true;
}

export function summarizeVerifiedFactIds(
  receipts: DisclosureReceipt[],
  context?: DisclosureReceiptValidationContext,
): string[] {
  return Array.from(
    new Set(
      receipts
        .filter((receipt) => context
          ? validateDisclosureReceiptAgainstContext(receipt, context)
          : validateDisclosureReceipt(receipt))
        .flatMap((receipt) => receipt.verifiedDisclosedFactIds),
    ),
  );
}

export function classifyEvidenceIntegrity(patient: ActivePatient | null | undefined): EvidenceIntegrityStatus {
  if (!patient) return 'legacy_unverified';
  if (!patient.disclosureReceipts || patient.disclosureReceipts.length === 0) {
    return patient.transcript.some((turn) => (turn.disclosedFactIds ?? []).length > 0)
      ? 'legacy_unverified'
      : 'locally_restored';
  }
  const allValid = patient.disclosureReceipts.every((receipt) =>
    validateDisclosureReceiptAgainstContext(receipt, {
      encounterId: patient.encounterId,
      caseId: patient.case.id,
      caseVersion: patient.case.caseVersion,
      allowedFactIds: patient.case.assessmentCompatibility.allowedHistoryFactIds,
      transcript: patient.transcript,
    }),
  );
  return allValid ? 'locally_restored' : 'modified_or_invalid';
}

export function buildGuidedDisclosureReceipt(args: {
  patient: ActivePatient;
  questionId: string;
  answerTurn: EncounterTranscriptTurn;
  questionTurn: EncounterTranscriptTurn;
  caseData: PatientCase;
}): DisclosureReceipt | null {
  const fact = args.caseData.anamnesis.find((item) => item.id === args.questionId);
  if (!fact) return null;
  const receiptBase = {
    receiptId: `guided-receipt-${args.questionTurn.id}`,
    encounterId: args.patient.encounterId,
    learnerMessageId: args.questionTurn.id,
    patientMessageId: args.answerTurn.id,
    caseId: args.caseData.id,
    caseVersion: args.caseData.caseVersion,
    eligibleFactIds: [fact.id],
    verifiedDisclosedFactIds: [fact.id],
    historyDomainIds: [fact.id],
    conversationTurn: args.patient.conversationTurnCount + 1,
    engine: 'guided' as const,
    createdAt: args.answerTurn.timestamp,
    integritySource: 'guided' as const,
    status: 'verified' as const,
  };
  return {
    ...receiptBase,
    integrityDigest: buildReceiptDigest(receiptBase),
  };
}
