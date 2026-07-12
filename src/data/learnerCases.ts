import learnerCatalog from '../../shared/learner_case_catalog.json' with { type: 'json' };
import type { PatientCase } from '../game/types.ts';
import { CLINIC_IDS, type ClinicId } from '../game/clinic.ts';

type LearnerCatalogCase = {
  case_id: string;
  case_version: string;
  status: PatientCase['status'];
  approval_status: PatientCase['approvalStatus'];
  review_banner: string;
  clinic: ClinicId;
  name: string;
  age: number;
  gender: 'M' | 'F';
  sex: 'M' | 'F';
  cond: string;
  complaint: string;
  chiefComplaint: string;
  arrivalBlurb: string;
  severity: PatientCase['severity'];
  skin: string;
  hair: string;
  mood: PatientCase['mood'];
  accessory?: PatientCase['accessory'];
  tags: string[];
  guideline: string;
  anamnesis: PatientCase['anamnesis'];
  vitals: PatientCase['vitals'];
  testResults: PatientCase['testResults'];
  diagnosisOptions: string[];
  assessmentCompatibility: PatientCase['assessmentCompatibility'];
};

type LearnerCatalog = {
  schema_version: string;
  cases: LearnerCatalogCase[];
};

function mapLearnerCase(item: LearnerCatalogCase): PatientCase {
  return {
    id: item.case_id,
    caseVersion: item.case_version,
    status: item.status,
    approvalStatus: item.approval_status,
    reviewBanner: item.review_banner,
    clinic: item.clinic,
    name: item.name,
    age: item.age,
    gender: item.gender,
    sex: item.sex,
    cond: item.cond,
    complaint: item.complaint,
    chiefComplaint: item.chiefComplaint,
    arrivalBlurb: item.arrivalBlurb,
    severity: item.severity,
    skin: item.skin,
    hair: item.hair,
    mood: item.mood,
    accessory: item.accessory,
    tags: item.tags,
    guideline: item.guideline,
    anamnesis: item.anamnesis,
    vitals: item.vitals,
    testResults: item.testResults,
    diagnosisOptions: item.diagnosisOptions,
    assessmentCompatibility: item.assessmentCompatibility,
  };
}

const catalog = learnerCatalog as LearnerCatalog;

export const PATIENT_CASES: PatientCase[] = catalog.cases.map(mapLearnerCase);

export const POLYCLINIC_CASES: Record<ClinicId, PatientCase[]> = CLINIC_IDS.reduce(
  (acc, clinicId) => {
    acc[clinicId] =
      clinicId === 'all-specialties'
        ? PATIENT_CASES
        : PATIENT_CASES.filter((item) => item.clinic === clinicId);
    return acc;
  },
  {} as Record<ClinicId, PatientCase[]>,
);

export interface CaseListItem {
  id: string;
  clinic: PatientCase['clinic'];
  name: string;
  age: number;
  sex: 'M' | 'F';
  cond: string;
  complaint: string;
  skin: string;
  hair: string;
  mood: PatientCase['mood'];
  accessory?: PatientCase['accessory'];
  tags: string[];
  guideline: string;
  attempted?: boolean;
  score?: string;
  status: PatientCase['status'];
  approvalStatus: PatientCase['approvalStatus'];
  reviewBanner: string;
}

export const CASES: CaseListItem[] = PATIENT_CASES.map((item) => ({
  id: item.id,
  clinic: item.clinic,
  name: item.name,
  age: item.age,
  sex: item.sex,
  cond: item.cond,
  complaint: item.complaint,
  skin: item.skin,
  hair: item.hair,
  mood: item.mood,
  accessory: item.accessory,
  tags: item.tags,
  guideline: item.guideline,
  attempted: item.attempted,
  score: item.score,
  status: item.status,
  approvalStatus: item.approvalStatus,
  reviewBanner: item.reviewBanner,
}));

export function getLearnerCase(caseId: string | null | undefined): PatientCase | null {
  if (!caseId) return null;
  return PATIENT_CASES.find((item) => item.id === caseId) ?? null;
}
