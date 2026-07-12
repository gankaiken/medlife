import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPatientRespondRequest,
  createLearnerMessageId,
  getConversationModeLabel,
  sanitizeConversationHistoryForRequest,
  shouldAcceptPatientResponse,
} from '../../src/agents/patientConversationApi.ts';
import type { EncounterTranscriptTurn } from '../../src/game/types.ts';

function makeTurn(index: number): EncounterTranscriptTurn {
  return {
    id: `turn-${index}`,
    role: index % 2 === 0 ? 'assistant' : 'user',
    content: `message ${index}`,
    source: index % 2 === 0 ? 'guided' : 'manual',
    timestamp: 1720603200000 + index,
    learnerMessageId: index % 2 === 0 ? null : `learner-${index}`,
    engine: index % 2 === 0 ? 'guided' : 'ai_text',
    disclosedFactIds: index % 2 === 0 ? [`fact-${index}`] : [],
  };
}

test('createLearnerMessageId stays stable for an encounter turn', () => {
  assert.equal(
    createLearnerMessageId('enc-case-headache-001', 3),
    'enc-case-headache-001-learner-3',
  );
});

test('sanitizeConversationHistoryForRequest keeps only the most recent turns', () => {
  const transcript = Array.from({ length: 30 }, (_, index) => makeTurn(index + 1));
  const sanitized = sanitizeConversationHistoryForRequest(transcript);
  assert.equal(sanitized.length, 24);
  assert.equal(sanitized[0]?.id, 'turn-7');
  assert.equal(sanitized.at(-1)?.id, 'turn-30');
});

test('buildPatientRespondRequest trims the learner message and serializes transcript metadata', () => {
  const request = buildPatientRespondRequest({
    encounterId: 'enc-case-headache-001',
    caseId: 'case-headache-001',
    learnerMessageId: 'enc-case-headache-001-learner-1',
    learnerMessage: '  How long has this been happening?  ',
    transcript: [makeTurn(1), makeTurn(2)],
    turnNumber: 1,
  });

  assert.equal(request.learner_message, 'How long has this been happening?');
  assert.equal(request.conversation_history.length, 2);
  assert.deepEqual(request.conversation_history[1]?.disclosedFactIds, ['fact-2']);
});

test('shouldAcceptPatientResponse rejects wrong encounter or late mismatched reply ids', () => {
  const accepted = shouldAcceptPatientResponse({
    expectedEncounterId: 'enc-1',
    expectedLearnerMessageId: 'enc-1-learner-1',
    currentEncounterId: 'enc-1',
    response: {
      message_id: 'patient-enc-1-learner-1',
      encounter_id: 'enc-1',
      case_id: 'case-headache-001',
      patient_reply: 'It started two days ago.',
      engine: 'ai_text',
      timestamp: 1720603200100,
      disclosed_fact_ids: ['ha-onset'],
      refused_hidden_request: false,
      conversation_status: 'answered',
      safety_status: 'ok',
    },
  });
  const rejected = shouldAcceptPatientResponse({
    expectedEncounterId: 'enc-1',
    expectedLearnerMessageId: 'enc-1-learner-1',
    currentEncounterId: 'enc-2',
    response: {
      message_id: 'patient-enc-1-learner-99',
      encounter_id: 'enc-1',
      case_id: 'case-headache-001',
      patient_reply: 'Wrong turn.',
      engine: 'ai_text',
      timestamp: 1720603200100,
      disclosed_fact_ids: [],
      refused_hidden_request: false,
      conversation_status: 'answered',
      safety_status: 'ok',
    },
  });

  assert.equal(accepted, true);
  assert.equal(rejected, false);
});

test('conversation mode labels distinguish guided and text AI clearly', () => {
  assert.equal(getConversationModeLabel('guided'), 'Guided consultation');
  assert.match(getConversationModeLabel('text_ai'), /AI patient/i);
});
