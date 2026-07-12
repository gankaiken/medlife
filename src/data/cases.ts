import type { PatientCase } from '../game/types';
import { CASES as LEARNER_CASES, getLearnerCase } from './learnerCases.ts';

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
  status?: PatientCase['status'];
  approvalStatus?: PatientCase['approvalStatus'];
  reviewBanner?: string;
}

export const CASES: Case[] = LEARNER_CASES;

export const CONDITION_COLORS: Record<string, string> = {
  Headache: 'var(--butter)',
  Fatigue: 'var(--peach)',
  Cough: 'var(--mint)',
};

export function getCase(caseId: string | null | undefined): Case {
  return CASES.find((item) => item.id === caseId) ?? CASES[0];
}

export function getPatientCase(caseId: string | null | undefined) {
  return getLearnerCase(caseId);
}
