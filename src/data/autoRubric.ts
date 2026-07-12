import type { CaseRubric, PatientCase } from '../game/types';

function makeCriterion(
  criterionId: string,
  label: string,
  description: string,
  guidelineRef?: string,
) {
  return {
    criterion_id: criterionId,
    label,
    description,
    weight: 1,
    guideline_ref: guidelineRef ?? null,
  };
}

export function getRubricFor(c: PatientCase): CaseRubric {
  if (c.rubric) return c.rubric;

  const firstRelevantQuestion = c.anamnesis.find((item) => item.relevant);
  const firstCriticalTreatment = c.assessmentCompatibility.criticalTreatmentIds[0];

  return {
    data_gathering: [
      makeCriterion(
        'hx-focused',
        'Focused history',
        firstRelevantQuestion
          ? `Elicits the key history point: ${firstRelevantQuestion.question}`
          : 'Elicits a focused and relevant history.',
      ),
    ],
    clinical_management: [
      makeCriterion(
        'mgmt-core',
        'Core management',
        firstCriticalTreatment
          ? `Addresses the key management step: ${firstCriticalTreatment}.`
          : 'Offers an appropriate management plan.',
      ),
    ],
    interpersonal: [
      makeCriterion('rapport', 'Rapport and clarity', 'Explains the plan clearly and shows empathy.'),
    ],
    safety_netting: makeCriterion('safety-net', 'Safety netting', 'Explains when to seek urgent help.'),
  };
}

export function deriveAutoRubric(c: PatientCase): CaseRubric {
  return getRubricFor({ ...c, rubric: undefined });
}
