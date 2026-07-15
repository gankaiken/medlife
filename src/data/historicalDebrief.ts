import { getPatientCase } from './cases.ts';
import type { ActivePatient, PatientCase } from '../game/types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function mergeCaseWithCanonical(rawCase: unknown): PatientCase | null {
  if (!isRecord(rawCase)) return null;
  const caseId = typeof rawCase.id === 'string' ? rawCase.id : null;
  const canonical = getPatientCase(caseId);
  if (!canonical) return rawCase as unknown as PatientCase;
  const partial = rawCase as Partial<PatientCase>;
  return {
    ...canonical,
    ...partial,
    anamnesis: partial.anamnesis ?? canonical.anamnesis,
    vitals: partial.vitals ?? canonical.vitals,
    testResults: partial.testResults ?? canonical.testResults,
    diagnosisOptions: partial.diagnosisOptions ?? canonical.diagnosisOptions,
    assessmentCompatibility: partial.assessmentCompatibility ?? canonical.assessmentCompatibility,
    rubric: partial.rubric ?? canonical.rubric,
    curriculumAlignment: partial.curriculumAlignment ?? canonical.curriculumAlignment,
    learningDesign: partial.learningDesign ?? canonical.learningDesign,
    assessmentBlueprint: partial.assessmentBlueprint ?? canonical.assessmentBlueprint,
    patientSafety: partial.patientSafety ?? canonical.patientSafety,
    malaysianContext: partial.malaysianContext ?? canonical.malaysianContext,
    pilotReadiness: partial.pilotReadiness ?? canonical.pilotReadiness,
  };
}

export function normalizeHistoricalPatientSnapshot(snapshot: ActivePatient | null | undefined): ActivePatient | null {
  if (!snapshot) return null;
  const mergedCase = mergeCaseWithCanonical(snapshot.case);
  if (!mergedCase) return snapshot;
  return {
    ...snapshot,
    case: mergedCase,
    askedQuestionIds: snapshot.askedQuestionIds ?? [],
    orderedTestIds: snapshot.orderedTestIds ?? [],
    completedTestIds: snapshot.completedTestIds ?? [],
    viewedResultIds: snapshot.viewedResultIds ?? [],
    testOrderedAt: snapshot.testOrderedAt ?? {},
    givenTreatmentIds: snapshot.givenTreatmentIds ?? [],
    prescriptions: snapshot.prescriptions ?? [],
    failedConversationTurnIds: snapshot.failedConversationTurnIds ?? [],
    fallbackTransitions: snapshot.fallbackTransitions ?? [],
    transcript: snapshot.transcript ?? [],
    disclosureReceipts: snapshot.disclosureReceipts ?? [],
  };
}
