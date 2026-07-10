import type { ClinicId } from './clinic';

export type Screen =
  | 'splash'
  | 'onboarding'
  | 'home'
  | 'mode'
  | 'gpRoom'
  | 'library'
  | 'brief'
  | 'encounter'
  | 'endConfirm'
  | 'debrief'
  | 'history'
  | 'agenticRounds'
  | 'agentTopology';

export interface QuestionAnswer {
  id: string;
  question: string;
  answer: string;
  relevant: boolean;
}

export interface Vitals {
  hr: number;
  bp: string;
  spo2: number;
  temp: number;
  rr: number;
}

export interface CaseTestResult {
  testId: string;
  result: string;
  abnormal: boolean;
}

export interface RubricCriterion {
  criterion_id: string;
  label: string;
  description: string;
  weight: number;
  guideline_ref?: string | null;
}

export interface CaseRubric {
  data_gathering: RubricCriterion[];
  clinical_management: RubricCriterion[];
  interpersonal: RubricCriterion[];
  safety_netting?: RubricCriterion | null;
}

export interface PatientCase {
  id: string;
  clinic: ClinicId;
  name: string;
  age: number;
  gender: 'M' | 'F';
  sex: 'M' | 'F';
  cond: string;
  complaint: string;
  chiefComplaint: string;
  arrivalBlurb: string;
  severity: 'stable' | 'urgent' | 'critical';
  skin: string;
  hair: string;
  mood: 'neutral' | 'happy' | 'sad' | 'sick' | 'worried';
  accessory?: 'thermometer' | 'bandage';
  tags: string[];
  guideline: string;
  attempted?: boolean;
  score?: string;
  anamnesis: QuestionAnswer[];
  vitals: Vitals;
  testResults: CaseTestResult[];
  diagnosisOptions: string[];
  correctDiagnosisId: string;
  acceptableTreatmentIds: string[];
  criticalTreatmentIds: string[];
  rubric?: CaseRubric;
}

export interface Prescription {
  medicationId: string;
  dose: string;
  duration: string;
}

export interface EncounterTranscriptTurn {
  role: 'assistant' | 'user' | 'system';
  content: string;
  source?: 'guided' | 'voice' | 'manual';
  timestamp?: number;
}

export interface ActivePatient {
  encounterId: string;
  bedIndex: number;
  arrivedAt: number;
  case: PatientCase;
  askedQuestionIds: string[];
  orderedTestIds: string[];
  completedTestIds: string[];
  viewedResultIds: string[];
  testOrderedAt: Record<string, number>;
  givenTreatmentIds: string[];
  prescriptions: Prescription[];
  submittedDiagnosisId: string | null;
  transcript: EncounterTranscriptTurn[];
  completedAt?: number | null;
  endConfirm?: EndConfirmChecks | null;
}

export interface EndConfirmChecks {
  sum: boolean;
  safe: boolean;
  ice: boolean;
}

export interface Tweaks {
  avatarStyle: 'cute' | 'portrait' | 'animal' | 'initials';
  palette: string;
  intensity: string;
}

export interface GameState {
  screen: Screen;
  onboardingStep: number;
  selectedCaseId: string;
  viewedEvalHistoryId: string | null;
  endConfirm: EndConfirmChecks;
  tweaks: Tweaks;
  lastEncounter: ActivePatient | null;
  polyclinic: {
    clinic: ClinicId;
    patient: ActivePatient | null;
  };
}
