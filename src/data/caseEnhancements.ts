import curriculumMappings from '../../shared/curriculum/case_curriculum_mappings.json' with { type: 'json' };
import type {
  AssessmentBlueprint,
  CurriculumAlignment,
  LearningDesign,
  MalaysianContextProfile,
  PatientSafetyProfile,
  PilotReadinessProfile,
} from '../game/types';

type MappingEntry = (typeof curriculumMappings)["cases"][number];

interface CaseEnhancement {
  curriculumAlignment: CurriculumAlignment;
  learningDesign: LearningDesign;
  assessmentBlueprint: AssessmentBlueprint;
  patientSafety: PatientSafetyProfile;
  malaysianContext: MalaysianContextProfile;
  pilotReadiness: PilotReadinessProfile;
}

function buildCurriculumAlignment(entry: MappingEntry): CurriculumAlignment {
  return {
    mappingVersion: entry.mapping_version,
    targetPrograms: ['Undergraduate medicine'],
    targetYears: [entry.candidate_target_year],
    stages: [entry.candidate_stage_of_training],
    specialties: [entry.discipline],
    rotations: [entry.discipline],
    competencyDomains: entry.competency_domains,
    learningOutcomes: [
      `Manage the presenting problem: ${entry.presenting_problem}`,
      ...entry.patient_safety_outcomes,
    ],
    clinicalProblems: [entry.presenting_problem],
    expectedPerformanceLevel: 'formative supervised learner',
    prerequisites: entry.expected_prerequisite_knowledge,
    estimatedStudentLearningTimeMin: entry.estimated_completion_time_min,
    formativeOrSummative: entry.formative_assessment_status,
    publicSourceMappings: [
      {
        institutionProfileId: 'monash-medicine-candidate-malaysia',
        sourceId: entry.source,
        sourceType: 'official_public_source',
        approvalStatus: entry.monash_candidate_relationship,
        confidenceLevel: entry.confidence as 'low' | 'medium' | 'high',
        rationale: entry.rationale,
        internalDocumentRequired: true,
      },
    ],
    internalMappings: [],
    mappingStatus: entry.curriculum_review_status,
    mappingReviewers: [],
    mappingReviewDate: null,
  };
}

const ENHANCEMENTS: Record<string, Omit<CaseEnhancement, 'curriculumAlignment'>> = {
  'case-headache-001': {
    learningDesign: {
      pathwayTags: ['History-taking foundation', 'Primary-care consultation', 'Communication and professionalism'],
      recommendedUse: 'Use before or alongside early supervised clinical exposure.',
      prebrief: {
        learningObjectives: [
          'Take a focused headache history.',
          'Explore concerns respectfully.',
          'Recognise when reassurance is safe and when escalation is needed.',
        ],
        expectedLearnerLevel: 'Early clinical learner',
        prerequisites: ['Basic symptom chronology', 'Headache red flags', 'Open and closed questioning'],
        estimatedDurationMin: 12,
        simulationLimitations: [
          'Text interaction cannot assess eye contact, tone, or body language fully.',
          'This is a synthetic educational case, not a real patient.',
        ],
        aiModeExplanation: 'Guided mode is deterministic. Text AI Patient Mode is optional and clearly labelled.',
        confidentialityExpectation: 'Treat the encounter as confidential educational material.',
        psychologicalSafety: 'The activity is formative practice. Uncertainty and mistakes are expected learning opportunities.',
        formativeAssessmentNotice: 'Formative practice only. Not for progression decisions.',
        availableTools: ['Guided questions', 'Investigations and results', 'Diagnosis choices', 'Management planning', 'Debrief review'],
        professionalBehaviour: ['Introduce yourself clearly', 'Use respectful language', 'Explain uncertainty honestly'],
      },
      debrief: {
        reflectionPrompts: [
          'What went well?',
          'What important information did you miss?',
          'What would you do differently next time?',
          'Which part of your reasoning was weakest?',
          'What will you practise next?',
        ],
        suggestedResources: ['Headache red flags review', 'Patient-centred concern exploration', 'Safety-netting language practice'],
        recommendedNextCaseIds: ['case-cough-003'],
      },
    },
    assessmentBlueprint: {
      formativeLabels: ['Formative practice', 'Automated feedback', 'Not for formal progression decisions'],
      aiRoles: ['patient simulator', 'feedback assistant'],
      dimensions: [
        { label: 'Opening the consultation', evidenceType: 'observed' },
        { label: 'Ideas, concerns and expectations', evidenceType: 'observed' },
        { label: 'Clinical reasoning', evidenceType: 'observed' },
        { label: 'Safety-netting', evidenceType: 'observed' },
        { label: 'Non-verbal communication', evidenceType: 'not_observable' },
        { label: 'Reflection', evidenceType: 'learner_authored' },
      ],
      modalityLimits: ['Eye contact, physical presence, tone, and body language are not fully observable in the current modality.'],
    },
    patientSafety: {
      redFlags: ['Sudden severe onset', 'Focal neurology', 'Collapse', 'Vomiting with concerning features', 'Visual loss'],
      timeCriticalActions: ['Escalate immediately if focal neurology or thunderclap headache emerges.'],
      unsafeDelays: ['Reassuring before screening for red flags.'],
      contraindications: ['Do not offer false reassurance without assessing red flags.'],
      allergyChecks: ['Confirm medication allergy before recommending analgesia.'],
      medicationSafety: ['Use simple first-line analgesia advice only in this learning scenario.'],
      escalationRequirements: ['Escalate if symptoms become acute or neurological signs appear.'],
      referralRequirements: ['Refer or advise urgent review if new red flags are reported.'],
      safetyNetting: ['Return urgently for worsening pain, neurological symptoms, vomiting, collapse, or visual symptoms.'],
      followUp: ['Advise follow-up if recurrent symptoms persist.'],
      uncertaintyManagement: ['State clearly when the current modality cannot exclude all causes.'],
      learnerCompetenceLimits: ['Learners should not overstate certainty or replace senior supervision.'],
      safetyRuleApprovalStatus: 'clinical_review_required',
    },
    malaysianContext: {
      setting: 'Malaysian primary-care consultation',
      contextTags: ['primary care', 'cost-conscious follow-up', 'workplace stress'],
      culturalSafeguards: ['Do not assume language preference or family structure.', 'Use concern exploration without stereotyping stress or coping.'],
      costConsiderations: ['Begin with focused history and safety-netting before unnecessary investigation.'],
      referralContext: ['Escalation pathways depend on local clinic and emergency access.'],
      referenceStatus: 'clinical_review_required',
    },
    pilotReadiness: {
      candidateTargetYear: 3,
      candidateStage: 'early_clinical',
      clinicalReviewStatus: 'clinical_review_required',
      curriculumReviewStatus: 'academic_review_required',
      simulationReviewStatus: 'review_pending',
      aiReviewStatus: 'review_pending',
      pilotReadyStatus: 'not_pilot_ready',
    },
  },
  'case-anemia-002': {
    learningDesign: {
      pathwayTags: ['Clinical reasoning foundation', 'Patient safety', 'Transition to clinical years'],
      recommendedUse: 'Use after introductory medicine teaching and before or during early clinic exposure.',
      prebrief: {
        learningObjectives: [
          'Elicit fatigue chronology and bleeding clues.',
          'Choose useful investigations.',
          'Plan safe follow-up for likely iron deficiency anaemia.',
        ],
        expectedLearnerLevel: 'Core clinical learner',
        prerequisites: ['Full blood count basics', 'Occult bleeding questions', 'Follow-up planning'],
        estimatedDurationMin: 14,
        simulationLimitations: ['The case is educational and not clinically approved yet.', 'The patient cannot provide specialist lab interpretation.'],
        aiModeExplanation: 'AI mode may simulate patient responses, but the learner record preserves original learner actions.',
        confidentialityExpectation: 'Use this case as confidential educational material only.',
        psychologicalSafety: 'This is a formative case intended to support safe reasoning practice.',
        formativeAssessmentNotice: 'Automated and rule-based outputs remain formative.',
        availableTools: ['Guided history', 'Investigations', 'Diagnosis', 'Management', 'Debrief and reflection'],
        professionalBehaviour: ['Clarify uncertainty', 'Avoid premature reassurance', 'Explain follow-up clearly'],
      },
      debrief: {
        reflectionPrompts: [
          'What went well?',
          'What important information did you miss?',
          'What would you do differently next time?',
          'Which part of your reasoning was weakest?',
          'What will you practise next?',
        ],
        suggestedResources: ['Iron deficiency anaemia approach', 'Abnormal result follow-up planning', 'Shared explanation of uncertainty'],
        recommendedNextCaseIds: ['case-headache-001'],
      },
    },
    assessmentBlueprint: {
      formativeLabels: ['Formative practice', 'Automated feedback', 'Educator review recommended'],
      aiRoles: ['patient simulator', 'feedback assistant'],
      dimensions: [
        { label: 'Focused fatigue history', evidenceType: 'observed' },
        { label: 'Investigation strategy', evidenceType: 'observed' },
        { label: 'Management and follow-up', evidenceType: 'observed' },
        { label: 'Safety-critical omission classification', evidenceType: 'inferred' },
        { label: 'Non-verbal communication', evidenceType: 'not_observable' },
        { label: 'Reflection', evidenceType: 'learner_authored' },
      ],
      modalityLimits: ['Non-verbal communication remains unobservable in text-only or guided interaction.'],
    },
    patientSafety: {
      redFlags: ['Worsening exertional breathlessness', 'Bleeding history', 'Progressive fatigue'],
      timeCriticalActions: ['Arrange timely follow-up for abnormal haemoglobin and iron studies.'],
      unsafeDelays: ['Failure to arrange follow-up after abnormal results.'],
      contraindications: ['Do not present the issue as benign without a plan for review.'],
      allergyChecks: ['Check for medication intolerance before suggesting iron therapy.'],
      medicationSafety: ['Explain common oral iron issues and when to seek review.'],
      escalationRequirements: ['Escalate if symptoms worsen significantly or unstable features appear.'],
      referralRequirements: ['Investigate or refer if concerning bleeding or alternative pathology is suspected.'],
      safetyNetting: ['Advise urgent review for worsening breathlessness, syncope, or bleeding.'],
      followUp: ['Follow up abnormal results and response to treatment.'],
      uncertaintyManagement: ['Discuss likely diagnosis while preserving need for confirmation and review.'],
      learnerCompetenceLimits: ['Do not treat abnormal results as fully resolved without follow-up.'],
      safetyRuleApprovalStatus: 'clinical_review_required',
    },
    malaysianContext: {
      setting: 'Malaysian primary-care follow-up context',
      contextTags: ['primary care', 'resource stewardship', 'follow-up logistics'],
      culturalSafeguards: ['Do not assume diet, literacy, or finances from appearance.', 'Ask clarifying questions respectfully.'],
      costConsiderations: ['Prioritise high-value tests and safe follow-up over unnecessary broad workups.'],
      referralContext: ['Referral urgency depends on symptom severity and local service access.'],
      referenceStatus: 'clinical_review_required',
    },
    pilotReadiness: {
      candidateTargetYear: 3,
      candidateStage: 'core_clinical_rotation',
      clinicalReviewStatus: 'clinical_review_required',
      curriculumReviewStatus: 'academic_review_required',
      simulationReviewStatus: 'review_pending',
      aiReviewStatus: 'review_pending',
      pilotReadyStatus: 'not_pilot_ready',
    },
  },
  'case-cough-003': {
    learningDesign: {
      pathwayTags: ['Acute red-flag recognition', 'Patient safety', 'Primary-care consultation'],
      recommendedUse: 'Use in early acute-care teaching and respiratory primary-care sessions.',
      prebrief: {
        learningObjectives: [
          'Take a focused respiratory history.',
          'Identify red flags and escalation thresholds.',
          'Communicate a safe ambulatory management plan and safety-netting.',
        ],
        expectedLearnerLevel: 'Core clinical learner',
        prerequisites: ['Respiratory symptom questions', 'Shortness-of-breath assessment', 'Urgency communication'],
        estimatedDurationMin: 13,
        simulationLimitations: ['This case does not prove competence in real-time physical examination.', 'Non-verbal communication is not fully assessed.'],
        aiModeExplanation: 'The learner can choose guided or AI patient mode; both still preserve the learner action record.',
        confidentialityExpectation: 'Maintain confidentiality expectations for all transcript material.',
        psychologicalSafety: 'The case is formative and designed for safe practice with bounded uncertainty.',
        formativeAssessmentNotice: 'Not educator reviewed unless a reviewer explicitly adds review notes.',
        availableTools: ['Guided or AI patient mode', 'Investigations', 'Diagnosis', 'Management', 'Debrief and reflection'],
        professionalBehaviour: ['Explain red flags clearly', 'Use understandable language', 'State follow-up and return precautions explicitly'],
      },
      debrief: {
        reflectionPrompts: [
          'What went well?',
          'What important information did you miss?',
          'What would you do differently next time?',
          'Which part of your reasoning was weakest?',
          'What will you practise next?',
        ],
        suggestedResources: ['Acute cough red flags', 'Pleuritic chest pain differential review', 'Safety-netting for outpatient infection'],
        recommendedNextCaseIds: ['case-anemia-002'],
      },
    },
    assessmentBlueprint: {
      formativeLabels: ['Formative practice', 'Automated feedback', 'Safety review recommended'],
      aiRoles: ['patient simulator', 'feedback assistant'],
      dimensions: [
        { label: 'Focused respiratory history', evidenceType: 'observed' },
        { label: 'Escalation and referral judgement', evidenceType: 'observed' },
        { label: 'Explanation and safety-netting', evidenceType: 'observed' },
        { label: 'Shared decision-making', evidenceType: 'inferred' },
        { label: 'Body language', evidenceType: 'not_observable' },
        { label: 'Reflection', evidenceType: 'learner_authored' },
      ],
      modalityLimits: ['Tone, respiratory distress impression, and body language are only partially represented.'],
    },
    patientSafety: {
      redFlags: ['Pleuritic chest pain', 'Fever', 'Breathlessness', 'Haemoptysis'],
      timeCriticalActions: ['Escalate if breathlessness at rest, haemodynamic instability, or severe deterioration emerges.'],
      unsafeDelays: ['Missing escalation advice when pleuritic pain and fever worsen.'],
      contraindications: ['Do not minimise serious deterioration or omit safety-netting.'],
      allergyChecks: ['Check antibiotic allergy before recommending antimicrobial treatment.'],
      medicationSafety: ['Use antibiotic and follow-up advice cautiously; final rules need clinical review.'],
      escalationRequirements: ['Escalate for worsening breathlessness, chest pain, or instability.'],
      referralRequirements: ['Refer when outpatient management is no longer safe.'],
      safetyNetting: ['Return urgently if breathlessness worsens, chest pain escalates, or new concerning symptoms develop.'],
      followUp: ['Arrange follow-up if symptoms fail to improve.'],
      uncertaintyManagement: ['Explain that deterioration changes the urgency threshold.'],
      learnerCompetenceLimits: ['Do not present the learner as independently clearing severe respiratory illness.'],
      safetyRuleApprovalStatus: 'clinical_review_required',
    },
    malaysianContext: {
      setting: 'Malaysian ambulatory and primary-care respiratory presentation',
      contextTags: ['community respiratory illness', 'public/private care variability', 'follow-up access'],
      culturalSafeguards: ['Do not assume health literacy or financial capacity.', 'Avoid stereotype-based assumptions about family involvement.'],
      costConsiderations: ['Explain why targeted investigations and timely escalation matter.'],
      referralContext: ['Referral pathways vary by local clinic, district hospital, and emergency access.'],
      referenceStatus: 'clinical_review_required',
    },
    pilotReadiness: {
      candidateTargetYear: 3,
      candidateStage: 'core_clinical_rotation',
      clinicalReviewStatus: 'clinical_review_required',
      curriculumReviewStatus: 'academic_review_required',
      simulationReviewStatus: 'review_pending',
      aiReviewStatus: 'review_pending',
      pilotReadyStatus: 'not_pilot_ready',
    },
  },
};

export function getCaseEnhancement(caseId: string): CaseEnhancement {
  const mapping = curriculumMappings.cases.find((item) => item.case_id === caseId);
  const enhancement = ENHANCEMENTS[caseId];
  if (!mapping || !enhancement) {
    throw new Error(`Missing case enhancement for ${caseId}`);
  }
  return {
    curriculumAlignment: buildCurriculumAlignment(mapping),
    ...enhancement,
  };
}
