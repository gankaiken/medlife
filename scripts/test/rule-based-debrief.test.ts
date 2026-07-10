import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuleBasedDebrief } from '../../src/agents/ruleBasedDebrief.ts';
import type { DebriefRequest } from '../../src/agents/debriefRequest.ts';

function sampleRequest(): DebriefRequest {
  return {
    case_id: 'case-headache-001',
    case_summary: {
      chief_complaint: 'Forehead headache for two days.',
      correct_diagnosis_id: 'tension_headache',
      diagnosis_options: ['tension_headache', 'migraine'],
      severity: 'stable',
      age: 28,
      gender: 'F',
    },
    case_expectations: {
      relevant_history_question_ids: ['ha-onset', 'ha-redflags'],
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
      transcript: [],
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
