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

export interface AssessmentCompatibility {
  correctDiagnosisDigest: string;
  relevantHistoryQuestionIds: string[];
  allowedHistoryFactIds: string[];
  acceptableTreatmentIds: string[];
  criticalTreatmentIds: string[];
}

export type CaseStatus = 'draft' | 'in_review' | 'approved' | 'retired' | 'development_only';
export type ApprovalStatus =
  | 'clinically_reviewed'
  | 'clinical_review_required'
  | 'retired'
  | 'draft';

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
  caseVersion: string;
  status: CaseStatus;
  approvalStatus: ApprovalStatus;
  reviewBanner: string;
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
  assessmentCompatibility: AssessmentCompatibility;
  rubric?: CaseRubric;
}

export interface Prescription {
  medicationId: string;
  dose: string;
  duration: string;
}

export interface EncounterTranscriptTurn {
  id: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  source?: 'guided' | 'voice' | 'manual' | 'text_ai';
  timestamp: number;
  learnerMessageId?: string | null;
  engine?: 'guided' | 'ai_text' | 'fallback_guided' | null;
  disclosedFactIds?: string[];
  verifiedDisclosedFactIds?: string[];
  disclosureReceiptId?: string | null;
}

export type ConversationMode = 'guided' | 'text_ai';
export type EvidenceIntegrityStatus =
  | 'live_verified'
  | 'server_verified'
  | 'server_recorded_legacy_evidence'
  | 'locally_restored'
  | 'legacy_unverified'
  | 'modified_or_invalid'
  | 'pending_sync';

export interface DisclosureReceipt {
  receiptId: string;
  encounterId: string;
  learnerMessageId: string;
  patientMessageId: string;
  caseId: string;
  caseVersion: string;
  eligibleFactIds: string[];
  verifiedDisclosedFactIds: string[];
  historyDomainIds: string[];
  conversationTurn: number;
  engine: 'guided' | 'ai_text' | 'fallback_guided';
  createdAt: number;
  integrityDigest: string;
  integritySource: 'backend' | 'guided';
  status: 'verified' | 'fallback' | 'invalid';
}

export interface FallbackTransition {
  from: ConversationMode;
  to: ConversationMode;
  reason: string;
  timestamp: number;
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
  conversationMode: ConversationMode;
  conversationTurnCount: number;
  failedConversationTurnIds: string[];
  fallbackTransitions: FallbackTransition[];
  transcript: EncounterTranscriptTurn[];
  disclosureReceipts: DisclosureReceipt[];
  evidenceIntegrityStatus: EvidenceIntegrityStatus;
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
