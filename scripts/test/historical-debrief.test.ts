import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHistoricalPatientSnapshot } from '../../src/data/historicalDebrief.ts';

test('partial historical snapshots are normalized onto the canonical learner case contract', () => {
  const snapshot = normalizeHistoricalPatientSnapshot({
    encounterId: 'enc-history-001',
    arrivedAt: 1720603200000,
    bedIndex: 0,
    case: {
      id: 'case-headache-001',
      caseVersion: '1.0.0',
      status: 'development_only',
      approvalStatus: 'clinical_review_required',
      reviewBanner: 'Development case - clinical review required',
      name: 'Aisha Rahman',
      age: 28,
      gender: 'F',
      diagnosisOptions: ['tension_headache'],
    },
    askedQuestionIds: [],
    orderedTestIds: ['bp-check'],
    completedTestIds: ['bp-check'],
    viewedResultIds: ['bp-check'],
    testOrderedAt: {},
    givenTreatmentIds: [],
    prescriptions: [],
    submittedDiagnosisId: 'tension_headache',
    conversationMode: 'guided',
    conversationTurnCount: 0,
    failedConversationTurnIds: [],
    fallbackTransitions: [],
    transcript: [],
    disclosureReceipts: [],
    evidenceIntegrityStatus: 'server_verified',
    completedAt: 1720603260000,
    endConfirm: { sum: true, safe: true, ice: false },
  } as any);

  assert.ok(snapshot);
  assert.equal(snapshot?.case.assessmentBlueprint.formativeLabels.length > 0, true);
  assert.equal(snapshot?.case.learningDesign.debrief.suggestedResources.length > 0, true);
  assert.equal(snapshot?.case.caseVersion, '1.0.0');
});
