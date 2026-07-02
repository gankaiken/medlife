import type { PatientCase } from '../game/types';
import { POLYCLINIC_CASE_LIST } from './polyclinicPatients.ts';

export const PATIENT_CASES: PatientCase[] = POLYCLINIC_CASE_LIST;

export function getPatientCase(caseId: string | null | undefined): PatientCase | null {
  if (!caseId) return null;
  return PATIENT_CASES.find((item) => item.id === caseId) ?? null;
}
