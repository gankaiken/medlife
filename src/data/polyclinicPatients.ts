import type { ClinicId } from '../game/clinic.ts';
export { POLYCLINIC_CASES } from './learnerCases.ts';
import { PATIENT_CASES } from './learnerCases.ts';

export const POLYCLINIC_DIAGNOSIS_LABELS: Record<string, string> = {
  tension_headache: 'Tension headache',
  iron_deficiency_anemia: 'Iron deficiency anemia',
  community_acquired_pneumonia: 'Community-acquired pneumonia',
  migraine: 'Migraine',
  viral_urti: 'Viral URTI',
  anxiety: 'Anxiety',
};

export function getCaseSpecialty(caseId: string): ClinicId | null {
  return PATIENT_CASES.find((item) => item.id === caseId)?.clinic ?? null;
}
