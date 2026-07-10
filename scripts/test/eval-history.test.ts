import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listEvalHistory,
  saveEvalHistory,
  getEvalHistoryHealth,
} from '../../src/data/evalHistory.ts';
import type { CaseEvaluationInput } from '../../src/agents/customTools.ts';

const localStorageState = new Map<string, string>();

const fakeWindow = {
  localStorage: {
    getItem(key: string) {
      return localStorageState.has(key) ? localStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStorageState.set(key, value);
    },
    removeItem(key: string) {
      localStorageState.delete(key);
    },
    clear() {
      localStorageState.clear();
    },
  },
};

Object.defineProperty(globalThis, 'window', {
  value: fakeWindow,
  configurable: true,
});

const evalStub: CaseEvaluationInput = {
  case_id: 'case-headache-001',
  global_rating: 'good',
  domain_scores: {
    data_gathering: { raw: 2, max: 3, verdict: 'good' },
    clinical_management: { raw: 2, max: 3, verdict: 'good' },
    interpersonal: { raw: 2, max: 3, verdict: 'good' },
  },
  criteria: [],
  safety_breach: null,
  highlights: ['Asked relevant questions.'],
  improvements: ['Tighten management plan.'],
  narrative: 'Solid attempt.',
};

test.beforeEach(() => {
  fakeWindow.localStorage.clear();
});

test('saving the same encounter twice updates in place instead of duplicating history', () => {
  saveEvalHistory({
    id: 'enc-123',
    encounterId: 'enc-123',
    caseId: 'case-headache-001',
    caseName: 'Aisha Rahman',
    caseAge: 28,
    caseGender: 'F',
    diagnosisLabel: 'Tension headache',
    verdict: 'good',
    engine: 'rule_based',
    evaluation: evalStub,
  });

  saveEvalHistory({
    id: 'enc-123',
    encounterId: 'enc-123',
    caseId: 'case-headache-001',
    caseName: 'Aisha Rahman',
    caseAge: 28,
    caseGender: 'F',
    diagnosisLabel: 'Tension headache',
    verdict: 'excellent',
    engine: 'rule_based',
    evaluation: { ...evalStub, global_rating: 'excellent' },
  });

  const items = listEvalHistory();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'enc-123');
  assert.equal(items[0].encounterId, 'enc-123');
  assert.equal(items[0].verdict, 'excellent');
});

test('partially malformed history keeps valid records and exposes a recovery message', () => {
  fakeWindow.localStorage.setItem(
    'medlife.evalHistory',
    JSON.stringify([
      {
        id: 'enc-123',
        encounterId: 'enc-123',
        savedAt: '2026-07-09T12:00:00.000Z',
        caseId: 'case-headache-001',
        caseName: 'Aisha Rahman',
        caseAge: 28,
        caseGender: 'F',
        diagnosisLabel: 'Tension headache',
        patientName: 'Aisha Rahman',
        verdict: 'good',
        engine: 'rule_based',
        evaluation: evalStub,
      },
      { broken: true },
    ]),
  );

  const items = listEvalHistory();
  const health = getEvalHistoryHealth();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'enc-123');
  assert.equal(health.status, 'partially_recovered');
  assert.match(health.message ?? '', /skipped safely/i);
});
