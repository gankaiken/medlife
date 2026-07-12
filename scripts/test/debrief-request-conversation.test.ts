import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDebriefRequest } from '../../src/agents/debriefRequest.ts';
import { buildReceiptDigest } from '../../src/agents/disclosureReceipts.ts';
import { getPatientCase } from '../../src/data/patients.ts';
import type { ActivePatient } from '../../src/game/types.ts';

test('buildDebriefRequest carries conversation evidence into the encounter log', () => {
  const patientCase = getPatientCase('case-headache-001');
  assert.ok(patientCase);

  const patient: ActivePatient = {
    encounterId: 'enc-case-headache-001-test',
    bedIndex: 0,
    arrivedAt: 1720603200000,
    case: patientCase!,
    askedQuestionIds: ['ha-onset'],
    orderedTestIds: ['bp-check'],
    completedTestIds: ['bp-check'],
    viewedResultIds: ['bp-check'],
    testOrderedAt: { 'bp-check': 1720603205000 },
    givenTreatmentIds: [],
    prescriptions: [],
    submittedDiagnosisId: 'tension_headache',
    conversationMode: 'text_ai',
    conversationTurnCount: 2,
    failedConversationTurnIds: ['enc-case-headache-001-test-learner-2'],
    fallbackTransitions: [
      { from: 'text_ai', to: 'guided', reason: 'manual_switch', timestamp: 1720603210000 },
    ],
    transcript: [
      {
        id: 'enc-case-headache-001-test-learner-1',
        role: 'user',
        content: 'How long have you had this headache?',
        source: 'manual',
        timestamp: 1720603201000,
        learnerMessageId: 'enc-case-headache-001-test-learner-1',
        engine: 'ai_text',
        disclosedFactIds: [],
      },
      {
        id: 'patient-enc-case-headache-001-test-learner-1',
        role: 'assistant',
        content: 'It started two days ago.',
        source: 'text_ai',
        timestamp: 1720603202000,
        learnerMessageId: 'enc-case-headache-001-test-learner-1',
        engine: 'ai_text',
        disclosedFactIds: ['ha-onset'],
        verifiedDisclosedFactIds: ['ha-onset'],
        disclosureReceiptId: 'receipt-enc-case-headache-001-test-learner-1',
      },
    ],
    disclosureReceipts: [
      (() => {
        const base = {
          receiptId: 'receipt-enc-case-headache-001-test-learner-1',
          encounterId: 'enc-case-headache-001-test',
          learnerMessageId: 'enc-case-headache-001-test-learner-1',
          patientMessageId: 'patient-enc-case-headache-001-test-learner-1',
          caseId: 'case-headache-001',
          caseVersion: patientCase!.caseVersion,
          eligibleFactIds: ['ha-onset'],
          verifiedDisclosedFactIds: ['ha-onset'],
          historyDomainIds: ['history_presenting_complaint'],
          conversationTurn: 1,
          engine: 'ai_text' as const,
          createdAt: 1720603202000,
          integritySource: 'backend' as const,
          status: 'verified' as const,
        };
        return { ...base, integrityDigest: buildReceiptDigest(base) };
      })(),
    ],
    evidenceIntegrityStatus: 'live_verified',
    completedAt: null,
    endConfirm: { sum: true, safe: true, ice: false },
  };

  const request = buildDebriefRequest(patientCase!, patient, 1720603260000);
  assert.equal(request.encounter_log.conversation_mode, 'text_ai');
  assert.equal(request.encounter_log.disclosure_receipts.length, 1);
  assert.deepEqual(request.case_expectations.allowed_history_fact_ids, [
    'ha-onset',
    'ha-redflags',
    'ha-stress',
    'ha-location',
    'ha-relief',
    'ha-worry',
  ]);
  assert.deepEqual(request.encounter_log.failed_conversation_turn_ids, ['enc-case-headache-001-test-learner-2']);
  assert.equal(request.encounter_log.transcript.length, 2);
  assert.equal(request.encounter_log.transcript[1]?.engine, 'ai_text');
  assert.equal(request.encounter_log.transcript[1]?.disclosedFactIds?.[0], 'ha-onset');
  assert.equal(request.encounter_log.evidence_integrity_status, 'live_verified');
});
