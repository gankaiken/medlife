import test from 'node:test';
import assert from 'node:assert/strict';
import { getPatientCase } from '../../src/data/patients.ts';
import { buildDebriefRequest } from '../../src/agents/debriefRequest.ts';
import { buildRuleBasedDebrief } from '../../src/agents/ruleBasedDebrief.ts';
import {
  deleteEvalHistory,
  getEvalHistory,
  listEvalHistory,
  saveEvalHistory,
} from '../../src/data/evalHistory.ts';
import { computeDiagnosisDigest } from '../../src/agents/disclosureReceipts.ts';
import {
  resetGameStateForTests,
  store,
} from '../../src/game/store.ts';

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }
}

function installWindow() {
  const storage = new MemoryStorage();
  Object.assign(globalThis, {
    window: {
      localStorage: storage,
    },
  });
}

test('guided local flow reaches saved rule-based debrief history end to end', () => {
  installWindow();
  resetGameStateForTests();

  const caseId = 'case-headache-001';
  const patientCase = getPatientCase(caseId);
  assert.ok(patientCase, 'expected seeded headache case');

  store.finishOnboarding();
  store.setScreen('mode');
  store.setPolyclinicClinic('all-specialties');
  store.selectCase(caseId);
  store.loadPolyclinicPatient(caseId);

  const historyQuestions = patientCase.anamnesis.slice(0, 2);
  const correctDiagnosisId =
    patientCase.diagnosisOptions.find(
      (diagnosisId) =>
        computeDiagnosisDigest(diagnosisId) === patientCase.assessmentCompatibility.correctDiagnosisDigest,
    ) ?? patientCase.diagnosisOptions[0];
  for (const question of historyQuestions) {
    store.askPolyclinicQuestion(question.id);
  }
  store.orderPolyclinicTest(patientCase.testResults[0]?.testId ?? 'ecg');
  store.markResultViewed(patientCase.testResults[0]?.testId ?? 'ecg');
  store.submitPolyclinicDiagnosis(correctDiagnosisId);
  store.addPolyclinicPrescription({
    medicationId: 'paracetamol',
    dose: '1 g',
    duration: '5 days',
  });
  store.setPatientTranscript([
    { role: 'user', content: historyQuestions[0]?.question ?? 'Tell me about the pain.', source: 'guided' },
    { role: 'assistant', content: historyQuestions[0]?.answer ?? 'It has been there for days.', source: 'guided' },
  ]);
  store.toggleEndConfirm('sum');
  store.toggleEndConfirm('safe');
  store.toggleEndConfirm('ice');
  store.finishPolyclinicCase();

  const snapshot = store.getState().lastEncounter;
  assert.ok(snapshot, 'expected immutable encounter snapshot');
  assert.equal(snapshot.submittedDiagnosisId, correctDiagnosisId);
  assert.equal(snapshot.viewedResultIds.length, 1);
  assert.equal(snapshot.transcript.length, 2);

  const request = buildDebriefRequest(patientCase, snapshot);
  const evaluation = buildRuleBasedDebrief(request);
  const saved = saveEvalHistory({
    caseId: patientCase.id,
    caseName: patientCase.name,
    caseAge: patientCase.age,
    caseGender: patientCase.gender,
    diagnosisLabel: correctDiagnosisId,
    verdict: evaluation.global_rating,
    engine: 'rule_based',
    evaluation,
    patientSnapshot: snapshot,
  });

  assert.equal(listEvalHistory().length, 1);
  assert.equal(getEvalHistory(saved.id)?.engine, 'rule_based');
  assert.equal(getEvalHistory(saved.id)?.patientSnapshot?.submittedDiagnosisId, correctDiagnosisId);

  deleteEvalHistory(saved.id);
  assert.equal(listEvalHistory().length, 0);
});
