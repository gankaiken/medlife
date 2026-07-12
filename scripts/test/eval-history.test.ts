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

test('tampered disclosure receipt history stays viewable but is marked modified_or_invalid', () => {
  fakeWindow.localStorage.setItem(
    'medlife.evalHistory',
    JSON.stringify([
      {
        id: 'enc-tampered',
        encounterId: 'enc-tampered',
        savedAt: '2026-07-11T12:00:00.000Z',
        caseId: 'case-headache-001',
        caseName: 'Aisha Rahman',
        caseAge: 28,
        caseGender: 'F',
        diagnosisLabel: 'Tension headache',
        patientName: 'Aisha Rahman',
        verdict: 'good',
        engine: 'rule_based',
        evaluation: evalStub,
        patientSnapshot: {
          encounterId: 'enc-tampered',
          bedIndex: 0,
          arrivedAt: 1720603200000,
          case: {
            id: 'case-headache-001',
            caseVersion: '1.0.0',
            status: 'development_only',
            approvalStatus: 'clinical_review_required',
            reviewBanner: 'Development case - clinical review required',
            clinic: 'all-specialties',
            name: 'Aisha Rahman',
            age: 28,
            gender: 'F',
            sex: 'F',
            cond: 'Headache',
            complaint: 'Headache',
            chiefComplaint: 'Forehead headache for two days.',
            arrivalBlurb: 'Stable.',
            severity: 'stable',
            skin: '#E7BE9A',
            hair: '#2E221C',
            mood: 'worried',
            tags: [],
            guideline: 'NICE headache',
            anamnesis: [
              { id: 'ha-onset', question: 'When did the headache start?', answer: 'Two days ago.', relevant: true },
            ],
            vitals: { hr: 84, bp: '118/74', spo2: 99, temp: 36.8, rr: 14 },
            testResults: [],
            diagnosisOptions: ['tension_headache'],
            assessmentCompatibility: {
              correctDiagnosisDigest: 'medlife:v1:4011490407',
              relevantHistoryQuestionIds: ['ha-onset'],
              allowedHistoryFactIds: ['ha-onset'],
              acceptableTreatmentIds: ['advice-rest'],
              criticalTreatmentIds: ['safety-net-advice'],
            },
          },
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
              content: 'When did it start?',
              source: 'manual',
              timestamp: 1720603200000,
              learnerMessageId: 'learner-1',
              engine: 'ai_text',
            },
            {
              id: 'patient-1',
              role: 'assistant',
              content: 'Two days ago.',
              source: 'text_ai',
              timestamp: 1720603201000,
              learnerMessageId: 'learner-1',
              engine: 'ai_text',
            },
          ],
          disclosureReceipts: [
            {
              receiptId: 'receipt-1',
              encounterId: 'enc-tampered',
              learnerMessageId: 'learner-1',
              patientMessageId: 'patient-1',
              caseId: 'case-headache-001',
              caseVersion: '9.9.9',
              eligibleFactIds: ['ha-onset'],
              verifiedDisclosedFactIds: ['ha-onset'],
              historyDomainIds: ['history_presenting_complaint'],
              conversationTurn: 1,
              engine: 'ai_text',
              createdAt: 1720603201000,
              integrityDigest: 'receipt:v1:tampered',
              integritySource: 'backend',
              status: 'verified',
            },
          ],
          evidenceIntegrityStatus: 'live_verified',
          completedAt: 1720603210000,
          endConfirm: { sum: true, safe: true, ice: false },
        },
      },
    ]),
  );

  const items = listEvalHistory();
  assert.equal(items.length, 1);
  assert.equal(items[0]?.patientName, 'Aisha Rahman');
  assert.equal(items[0]?.integrityStatus, 'modified_or_invalid');
});
