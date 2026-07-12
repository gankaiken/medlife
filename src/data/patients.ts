import type { PatientCase } from '../game/types';
import { PATIENT_CASES as LEARNER_CASES, getLearnerCase } from './learnerCases.ts';

export const PATIENT_CASES: PatientCase[] = LEARNER_CASES;

export function getPatientCase(caseId: string | null | undefined): PatientCase | null {
  return getLearnerCase(caseId);
}
