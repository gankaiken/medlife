import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuleBasedDebrief } from '../../src/agents/ruleBasedDebrief.ts';
import type { DebriefRequest } from '../../src/agents/debriefRequest.ts';
import { buildReceiptDigest } from '../../src/agents/disclosureReceipts.ts';

function sampleRequest(): DebriefRequest {
  return {
    case_id: 'case-headache-001',
    case_summary: {
      chief_complaint: 'Forehead headache for two days.',
      case_version: '1.0.0',
      correct_diagnosis_digest: 'medlife:v1:4011490407',
      diagnosis_options: ['tension_headache', 'migraine'],
      severity: 'stable',
      age: 28,
      gender: 'F',
    },
    case_expectations: {
      relevant_history_question_ids: ['ha-onset', 'ha-redflags'],
      allowed_history_fact_ids: ['ha-onset', 'ha-redflags', 'ha-stress', 'ha-location', 'ha-relief', 'ha-worry'],
      acceptable_treatment_ids: ['advice-rest', 'paracetamol', 'safety-net-advice'],
      critical_treatment_ids: ['safety-net-advice'],
    },
    rubric: {
      data_gathering: [],
      clinical_management: [],
      interpersonal: [],
      safety_netting: null,
    },
    registry_slice: [],
    encounter_log: {
      arrived_at_iso: '2026-07-09T12:00:00Z',
      ended_at_iso: '2026-07-09T12:07:00Z',
      elapsed_seconds: 420,
      history_questions_asked: [
        {
          id: 'ha-onset',
          question: 'When did the headache start?',
          answer_shown_to_trainee: 'Two days ago.',
          relevant_per_case: true,
        },
      ],
      tests_ordered: [
        {
          test_id: 'bp-check',
          test_name: 'Blood pressure check',
          ordered_at_seconds_from_arrival: 60,
          result_shown_to_trainee: 'Blood pressure normal.',
          abnormal: false,
        },
      ],
      treatments_given: [],
      prescriptions: [],
      disclosed_fact_ids: [],
      disclosure_receipts: [],
      transcript: [],
      evidence_integrity_status: 'legacy_unverified',
      results_opened: ['bp-check'],
      end_confirm: { sum: true, safe: false, ice: false },
      submitted_diagnosis_id: 'migraine',
      diagnosis_was_correct: false,
    },
  };
}

test('rule-based debrief flags missing safety-netting and wrong diagnosis', () => {
  const evaluation = buildRuleBasedDebrief(sampleRequest());
  assert.equal(evaluation.case_id, 'case-headache-001');
  assert.equal(evaluation.global_rating, 'clear-fail');
  assert.ok(evaluation.safety_breach);
  assert.match(evaluation.narrative, /did not match the case answer/i);
});

test('rule-based debrief records missed relevant history questions', () => {
  const evaluation = buildRuleBasedDebrief(sampleRequest());
  const missed = evaluation.criteria.find((item) => item.criterion_id === 'hx:ha-redflags');
  assert.ok(missed);
  assert.equal(missed?.verdict, 'missed');
});

test('rule-based debrief gives history credit when free-text disclosure ids cover a concept', () => {
  const request = sampleRequest();
  request.encounter_log.history_questions_asked = [];
  request.encounter_log.disclosed_fact_ids = ['ha-redflags'];

  const evaluation = buildRuleBasedDebrief(request);
  assert.match(evaluation.highlights.join(' '), /Covered 1 relevant history concept/i);
  assert.equal(
    evaluation.criteria.some((item) => item.criterion_id === 'hx:ha-redflags' && item.verdict === 'missed'),
    false,
  );
});

test('rule-based debrief ignores tampered disclosure receipts and marks the history concept missed', () => {
  const request = sampleRequest();
  request.encounter_log.history_questions_asked = [];
  request.encounter_log.transcript = [
    {
      id: 'learner-1',
      role: 'user',
      content: 'Any red flags?',
      source: 'manual',
      timestamp: 1720603200000,
      learnerMessageId: 'learner-1',
      engine: 'ai_text',
    },
    {
      id: 'patient-1',
      role: 'assistant',
      content: 'No, none of those.',
      source: 'text_ai',
      timestamp: 1720603201000,
      learnerMessageId: 'learner-1',
      engine: 'ai_text',
    },
  ];
  request.encounter_log.disclosure_receipts = [
    (() => {
      const base = {
      receiptId: 'receipt-1',
      encounterId: request.encounter_id,
      learnerMessageId: 'learner-1',
      patientMessageId: 'patient-1',
      caseId: request.case_id,
      caseVersion: '9.9.9',
      eligibleFactIds: ['ha-redflags'],
      verifiedDisclosedFactIds: ['ha-redflags'],
      historyDomainIds: ['history_red_flags'],
      conversationTurn: 1,
      engine: 'ai_text',
      createdAt: 1720603201000,
      integritySource: 'backend',
      status: 'verified',
      };
      return { ...base, integrityDigest: buildReceiptDigest(base) };
    })(),
  ];

  const evaluation = buildRuleBasedDebrief(request);
  assert.equal(
    evaluation.criteria.some((item) => item.criterion_id === 'hx:ha-redflags' && item.verdict === 'missed'),
    true,
  );
});
