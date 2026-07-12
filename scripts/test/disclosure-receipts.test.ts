import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceiptDigest,
  classifyEvidenceIntegrity,
  validateDisclosureReceipt,
  validateDisclosureReceiptAgainstContext,
} from '../../src/agents/disclosureReceipts.ts';
import { getPatientCase } from '../../src/data/patients.ts';
import type { ActivePatient, DisclosureReceipt } from '../../src/game/types.ts';

function buildReceipt(overrides: Partial<DisclosureReceipt> = {}): DisclosureReceipt {
  const base = {
    receiptId: 'receipt-1',
    encounterId: 'enc-1',
    learnerMessageId: 'learner-1',
    patientMessageId: 'patient-1',
    caseId: 'case-headache-001',
    caseVersion: '1.0.0',
    eligibleFactIds: ['ha-onset'],
    verifiedDisclosedFactIds: ['ha-onset'],
    historyDomainIds: ['history_presenting_complaint'],
    conversationTurn: 1,
    engine: 'ai_text' as const,
    createdAt: 1720603201000,
    integritySource: 'backend' as const,
    status: 'verified' as const,
    ...overrides,
  };
  return {
    ...base,
    integrityDigest: buildReceiptDigest(base),
  };
}

function buildPatient(receipts: DisclosureReceipt[]): ActivePatient {
  const patientCase = getPatientCase('case-headache-001');
  assert.ok(patientCase);
  return {
    encounterId: 'enc-1',
    bedIndex: 0,
    arrivedAt: 1720603200000,
    case: patientCase,
    askedQuestionIds: [],
    orderedTestIds: [],
    completedTestIds: [],
    viewedResultIds: [],
    testOrderedAt: {},
    givenTreatmentIds: [],
    prescriptions: [],
    submittedDiagnosisId: null,
    conversationMode: 'text_ai',
    conversationTurnCount: 1,
    failedConversationTurnIds: [],
    fallbackTransitions: [],
    transcript: [
      {
        id: 'learner-1',
        role: 'user',
        content: 'When did the headache start?',
        source: 'manual',
        timestamp: 1720603200000,
        learnerMessageId: 'learner-1',
        engine: 'ai_text',
      },
      {
        id: 'patient-1',
        role: 'assistant',
        content: 'It started two days ago.',
        source: 'text_ai',
        timestamp: 1720603201000,
        learnerMessageId: 'learner-1',
        engine: 'ai_text',
        disclosedFactIds: ['ha-onset'],
        verifiedDisclosedFactIds: ['ha-onset'],
        disclosureReceiptId: 'receipt-1',
      },
    ],
    disclosureReceipts: receipts,
    evidenceIntegrityStatus: 'live_verified',
    completedAt: null,
    endConfirm: null,
  };
}

test('validateDisclosureReceipt accepts a digest-valid receipt', () => {
  assert.equal(validateDisclosureReceipt(buildReceipt()), true);
});

test('receipt digests are checksums, so edited receipts can be recomputed without a secret', () => {
  const edited = buildReceipt({
    caseVersion: '9.9.9',
    verifiedDisclosedFactIds: ['ha-onset'],
  });

  assert.equal(validateDisclosureReceipt(edited), true);
  assert.equal(edited.integrityDigest, buildReceiptDigest({
    receiptId: edited.receiptId,
    encounterId: edited.encounterId,
    learnerMessageId: edited.learnerMessageId,
    patientMessageId: edited.patientMessageId,
    caseId: edited.caseId,
    caseVersion: edited.caseVersion,
    eligibleFactIds: edited.eligibleFactIds,
    verifiedDisclosedFactIds: edited.verifiedDisclosedFactIds,
    historyDomainIds: edited.historyDomainIds,
    conversationTurn: edited.conversationTurn,
    engine: edited.engine,
    createdAt: edited.createdAt,
    integritySource: edited.integritySource,
    status: edited.status,
  }));
});

test('validateDisclosureReceiptAgainstContext rejects mismatched case version even with a valid digest', () => {
  const patient = buildPatient([
    buildReceipt({
      caseVersion: '9.9.9',
    }),
  ]);

  const [receipt] = patient.disclosureReceipts;
  assert.ok(receipt);
  assert.equal(validateDisclosureReceipt(receipt), true);
  assert.equal(
    validateDisclosureReceiptAgainstContext(receipt, {
      encounterId: patient.encounterId,
      caseId: patient.case.id,
      caseVersion: patient.case.caseVersion,
      allowedFactIds: patient.case.assessmentCompatibility.allowedHistoryFactIds,
      transcript: patient.transcript,
    }),
    false,
  );
  assert.equal(classifyEvidenceIntegrity(patient), 'modified_or_invalid');
});

test('validateDisclosureReceiptAgainstContext rejects unsupported and clinician-only fact ids', () => {
  const patient = buildPatient([
    buildReceipt({
      eligibleFactIds: ['ha-onset', 'microcytosis'],
      verifiedDisclosedFactIds: ['microcytosis'],
    }),
  ]);

  const [receipt] = patient.disclosureReceipts;
  assert.ok(receipt);
  assert.equal(
    validateDisclosureReceiptAgainstContext(receipt, {
      encounterId: patient.encounterId,
      caseId: patient.case.id,
      caseVersion: patient.case.caseVersion,
      allowedFactIds: patient.case.assessmentCompatibility.allowedHistoryFactIds,
      transcript: patient.transcript,
    }),
    false,
  );
  assert.equal(classifyEvidenceIntegrity(patient), 'modified_or_invalid');
});

test('validateDisclosureReceiptAgainstContext rejects mismatched learner and patient links', () => {
  const patient = buildPatient([
    buildReceipt({
      learnerMessageId: 'learner-404',
    }),
  ]);

  const [receipt] = patient.disclosureReceipts;
  assert.ok(receipt);
  assert.equal(
    validateDisclosureReceiptAgainstContext(receipt, {
      encounterId: patient.encounterId,
      caseId: patient.case.id,
      caseVersion: patient.case.caseVersion,
      allowedFactIds: patient.case.assessmentCompatibility.allowedHistoryFactIds,
      transcript: patient.transcript,
    }),
    false,
  );
  assert.equal(classifyEvidenceIntegrity(patient), 'modified_or_invalid');
});

test('classifyEvidenceIntegrity keeps valid receipt-backed evidence restorable', () => {
  const patient = buildPatient([buildReceipt()]);
  assert.equal(classifyEvidenceIntegrity(patient), 'locally_restored');
});
