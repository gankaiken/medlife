import type { CaseEvaluationInput, CriterionResult, DomainScore, VerdictBand } from './customTools';
import type { DebriefRequest } from './debriefRequest';
import { validateDisclosureReceiptAgainstContext } from './disclosureReceipts.ts';

function verdictFromRatio(ratio: number): VerdictBand {
  if (ratio >= 0.85) return 'excellent';
  if (ratio >= 0.7) return 'good';
  if (ratio >= 0.55) return 'satisfactory';
  if (ratio >= 0.4) return 'borderline';
  return 'clear-fail';
}

function makeDomainScore(raw: number, max: number): DomainScore {
  const safeMax = Math.max(max, 1);
  return {
    raw: Number(raw.toFixed(1)),
    max: safeMax,
    verdict: verdictFromRatio(raw / safeMax),
  };
}

export function buildRuleBasedDebrief(request: DebriefRequest): CaseEvaluationInput {
  const askedIds = new Set(request.encounter_log.history_questions_asked.map((item) => item.id));
  const legacyDisclosedIds = request.encounter_log.disclosed_fact_ids ?? [];
  const receiptContext = request.case_summary.case_version
    ? {
        encounterId: request.encounter_id,
        caseId: request.case_id,
        caseVersion: request.case_summary.case_version,
        allowedFactIds: request.case_expectations.allowed_history_fact_ids,
        transcript: request.encounter_log.transcript ?? [],
      }
    : null;
  const disclosedIds = new Set(
    (request.encounter_log.disclosure_receipts ?? []).length > 0
      ? (request.encounter_log.disclosure_receipts ?? [])
          .filter((receipt) => (receiptContext ? validateDisclosureReceiptAgainstContext(receipt, receiptContext) : false))
          .flatMap((receipt) => receipt.verifiedDisclosedFactIds)
      : legacyDisclosedIds,
  );
  const orderedIds = new Set(request.encounter_log.tests_ordered.map((item) => item.test_id));
  const openedIds = new Set(request.encounter_log.results_opened);
  const relevantIds = request.case_expectations.relevant_history_question_ids;
  const coveredRelevant = relevantIds.filter((id) => askedIds.has(id) || disclosedIds.has(id));
  const missingRelevant = relevantIds.filter((id) => !coveredRelevant.includes(id));
  const totalRelevant = Math.max(relevantIds.length, 1);

  const diagnosisSubmitted = request.encounter_log.submitted_diagnosis_id !== null;
  const diagnosisCorrect = request.encounter_log.diagnosis_was_correct === true;
  const expectedTests = request.encounter_log.tests_ordered.filter((item) => item.result_shown_to_trainee !== null);
  const abnormalTests = expectedTests.filter((item) => item.abnormal);
  const relevantTestsOrdered = expectedTests.filter((item) => orderedIds.has(item.test_id)).length;
  const unnecessaryInvestigations = request.encounter_log.tests_ordered.filter(
    (item) => item.result_shown_to_trainee === null,
  );

  const prescriptions = request.encounter_log.prescriptions;
  const likelyTreated = prescriptions.length > 0;
  const wrap = request.encounter_log.end_confirm;
  const wrapCount = [wrap?.sum, wrap?.safe, wrap?.ice].filter(Boolean).length;

  const criteria: CriterionResult[] = [];

  for (const item of request.encounter_log.history_questions_asked) {
    if (!item.relevant_per_case) continue;
    criteria.push({
      criterion_id: `hx:${item.id}`,
      domain: 'data_gathering',
      verdict: 'met',
      evidence: `Asked "${item.question}" and captured "${item.answer_shown_to_trainee}".`,
    });
  }
  for (const id of missingRelevant) {
    criteria.push({
      criterion_id: `hx:${id}`,
      domain: 'data_gathering',
      verdict: 'missed',
      evidence: 'A relevant case-defining history question was not asked.',
    });
  }

  criteria.push({
    criterion_id: 'dx-submission',
    domain: 'clinical_management',
    verdict: diagnosisCorrect ? 'met' : diagnosisSubmitted ? 'partially-met' : 'missed',
    evidence: diagnosisCorrect
      ? 'Submitted the correct working diagnosis before ending the encounter.'
      : diagnosisSubmitted
        ? 'Submitted a diagnosis, but it did not match the case answer.'
        : 'Ended the encounter without submitting a diagnosis.',
  });

  criteria.push({
    criterion_id: 'investigation-coverage',
    domain: 'clinical_management',
    verdict:
      relevantTestsOrdered >= expectedTests.length && expectedTests.length > 0
        ? 'met'
        : relevantTestsOrdered > 0
          ? 'partially-met'
          : 'missed',
    evidence:
      expectedTests.length > 0
        ? `Ordered ${relevantTestsOrdered} of ${expectedTests.length} available case-linked investigations.`
        : 'No case-linked investigations were required by the dataset.',
  });

  criteria.push({
    criterion_id: 'management-plan',
    domain: 'clinical_management',
    verdict: likelyTreated ? 'met' : diagnosisCorrect ? 'partially-met' : 'missed',
    evidence: likelyTreated
      ? `Completed a prescription plan with ${prescriptions.length} item${prescriptions.length === 1 ? '' : 's'}.`
      : 'No prescription or treatment plan was recorded before dispatch.',
  });

  criteria.push({
    criterion_id: 'wrap-summary',
    domain: 'interpersonal',
    verdict: wrap?.sum ? 'met' : 'missed',
    evidence: wrap?.sum ? 'The student recorded that they summarised back to the patient.' : 'No summary-back step was recorded.',
  });
  criteria.push({
    criterion_id: 'wrap-safety',
    domain: 'interpersonal',
    verdict: wrap?.safe ? 'met' : 'missed',
    evidence: wrap?.safe ? 'Safety-netting was recorded before ending the encounter.' : 'Safety-netting was not recorded before dispatch.',
  });
  criteria.push({
    criterion_id: 'wrap-ice',
    domain: 'interpersonal',
    verdict: wrap?.ice ? 'met' : 'missed',
    evidence: wrap?.ice ? 'Ideas, concerns, and expectations were recorded as addressed.' : 'Ideas, concerns, and expectations were not recorded as addressed.',
  });

  const dataGatheringScore = makeDomainScore(coveredRelevant.length, totalRelevant);
  const investigationRatio =
    expectedTests.length > 0 ? relevantTestsOrdered / expectedTests.length : orderedIds.size > 0 ? 1 : 0.5;
  const diagnosisScore = diagnosisCorrect ? 1 : diagnosisSubmitted ? 0.4 : 0;
  const managementScore = likelyTreated ? 1 : diagnosisCorrect ? 0.5 : 0;
  const clinicalManagementScore = makeDomainScore(
    diagnosisScore + investigationRatio + managementScore,
    3,
  );
  const interpersonalScore = makeDomainScore(wrapCount, 3);

  const overallRatio =
    (dataGatheringScore.raw / dataGatheringScore.max +
      clinicalManagementScore.raw / clinicalManagementScore.max +
      interpersonalScore.raw / interpersonalScore.max) / 3;

  const safetyCritical =
    (request.case_summary.severity !== 'stable' && !diagnosisCorrect) ||
    (!!request.case_expectations.critical_treatment_ids.length && !wrap?.safe);

  const highlights: string[] = [];
  const improvements: string[] = [];

  if (coveredRelevant.length > 0) {
    highlights.push(`Covered ${coveredRelevant.length} relevant history concept${coveredRelevant.length === 1 ? '' : 's'}.`);
  }
  if (diagnosisCorrect) {
    highlights.push('Reached the correct diagnosis before debrief.');
  }
  if (likelyTreated) {
    highlights.push(`Recorded ${prescriptions.length} prescription item${prescriptions.length === 1 ? '' : 's'}.`);
  }
  if (missingRelevant.length > 0) {
    improvements.push(`Missed ${missingRelevant.length} relevant history question${missingRelevant.length === 1 ? '' : 's'}.`);
  }
  if (!diagnosisCorrect) {
    improvements.push(diagnosisSubmitted ? 'Review the differential diagnosis and final selection.' : 'Submit a working diagnosis before ending the encounter.');
  }
  if (unnecessaryInvestigations.length > 0) {
    improvements.push(`Review whether ${unnecessaryInvestigations.length} investigation${unnecessaryInvestigations.length === 1 ? '' : 's'} added value to the case.`);
  }
  if (!wrap?.safe) {
    improvements.push('Add safety-netting before dispatching the patient.');
  }
  if (!likelyTreated) {
    improvements.push('Document a management or prescription plan before dispatch.');
  }

  const narrativeParts = [
    diagnosisCorrect
      ? 'The student reached the correct diagnosis.'
      : diagnosisSubmitted
        ? 'The student submitted a diagnosis, but it did not match the case answer.'
        : 'The encounter ended without a submitted diagnosis.',
    coveredRelevant.length > 0
      ? `Relevant history was partly covered (${coveredRelevant.length}/${totalRelevant}).`
      : 'Relevant history prompts were missed.',
    likelyTreated
      ? 'A management plan was recorded.'
      : 'The management plan remained incomplete.',
  ];

  return {
    case_id: request.case_id,
    global_rating: verdictFromRatio(safetyCritical ? Math.min(overallRatio, 0.39) : overallRatio),
    domain_scores: {
      data_gathering: dataGatheringScore,
      clinical_management: clinicalManagementScore,
      interpersonal: interpersonalScore,
    },
    criteria,
    safety_breach: safetyCritical
      ? {
          what: !diagnosisCorrect
            ? 'An urgent or unstable case ended without the correct diagnosis.'
            : 'A critical follow-up or safety-net action was not recorded.',
        }
      : null,
    highlights,
    improvements,
    narrative: narrativeParts.join(' '),
  };
}
