import type { PatientCase } from '../game/types';
import { PATIENT_CASES, getPatientCase as getFullPatientCase } from './patients.ts';

export interface Case {
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
}

export const CASES: Case[] = PATIENT_CASES.map((item) => ({
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
}));

export const CONDITION_COLORS: Record<string, string> = {
  Headache: 'var(--butter)',
  Fatigue: 'var(--peach)',
  Cough: 'var(--mint)',
};

export function getCase(caseId: string | null | undefined): Case {
  return CASES.find((item) => item.id === caseId) ?? CASES[0];
}

export function getPatientCase(caseId: string | null | undefined) {
  return getFullPatientCase(caseId);
}
