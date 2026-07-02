import { CLINIC_IDS, type ClinicId } from '../game/clinic.ts';
import type { PatientCase } from '../game/types';

export const POLYCLINIC_DIAGNOSIS_LABELS: Record<string, string> = {
  tension_headache: 'Tension headache',
  iron_deficiency_anemia: 'Iron deficiency anemia',
  community_acquired_pneumonia: 'Community-acquired pneumonia',
  migraine: 'Migraine',
  viral_urti: 'Viral URTI',
  anxiety: 'Anxiety',
};

export const POLYCLINIC_CASE_LIST: PatientCase[] = [
  {
    id: 'case-headache-001',
    clinic: 'neurology',
    name: 'Aisha Rahman',
    age: 28,
    gender: 'F',
    sex: 'F',
    cond: 'Headache',
    complaint: 'A band-like headache after a stressful week.',
    chiefComplaint: 'I have had a tight headache across my forehead for two days.',
    arrivalBlurb: 'Looks tired but comfortable and speaking in full sentences.',
    severity: 'stable',
    skin: '#E1B692',
    hair: '#3A241B',
    mood: 'neutral',
    tags: ['Primary care', 'Stress', 'No red flags'],
    guideline: 'NICE headache',
    anamnesis: [
      { id: 'ha-onset', question: 'When did the headache start?', answer: 'Two days ago, after work.', relevant: true },
      { id: 'ha-redflags', question: 'Any weakness, collapse, vomiting, or visual loss?', answer: 'No, none of those.', relevant: true },
      { id: 'ha-stress', question: 'Anything making life more stressful lately?', answer: 'Yes, deadlines have been intense this week.', relevant: true },
    ],
    vitals: { hr: 84, bp: '118/74', spo2: 99, temp: 36.8, rr: 14 },
    testResults: [
      { testId: 'bp-check', result: 'Blood pressure normal.', abnormal: false },
      { testId: 'fbc', result: 'Full blood count within normal limits.', abnormal: false },
    ],
    diagnosisOptions: ['tension_headache', 'migraine', 'community_acquired_pneumonia'],
    correctDiagnosisId: 'tension_headache',
    acceptableTreatmentIds: ['advice-rest', 'paracetamol', 'safety-net-advice'],
    criticalTreatmentIds: ['safety-net-advice'],
  },
  {
    id: 'case-anemia-002',
    clinic: 'internal-medicine',
    name: 'Tom Whitford',
    age: 41,
    gender: 'M',
    sex: 'M',
    cond: 'Fatigue',
    complaint: 'Tired for weeks and getting breathless on stairs.',
    chiefComplaint: 'I am exhausted all the time and stairs wipe me out.',
    arrivalBlurb: 'Pale but stable, no immediate distress.',
    severity: 'urgent',
    skin: '#D9B08B',
    hair: '#5A4637',
    mood: 'worried',
    tags: ['Fatigue', 'Anemia', 'Primary care'],
    guideline: 'NICE anemia',
    anamnesis: [
      { id: 'an-duration', question: 'How long has this been going on?', answer: 'Around six weeks.', relevant: true },
      { id: 'an-bleeding', question: 'Any bleeding, black stools, or heavy periods?', answer: 'No obvious bleeding that I have noticed.', relevant: true },
      { id: 'an-diet', question: 'How is your diet?', answer: 'Not great. I skip meals often.', relevant: false },
    ],
    vitals: { hr: 102, bp: '110/70', spo2: 98, temp: 36.7, rr: 18 },
    testResults: [
      { testId: 'fbc', result: 'Hb 9.4 g/dL with microcytosis.', abnormal: true },
      { testId: 'ferritin', result: 'Ferritin low.', abnormal: true },
    ],
    diagnosisOptions: ['iron_deficiency_anemia', 'anxiety', 'viral_urti'],
    correctDiagnosisId: 'iron_deficiency_anemia',
    acceptableTreatmentIds: ['oral-iron', 'diet-advice', 'follow-up-plan', 'safety-net-advice'],
    criticalTreatmentIds: ['follow-up-plan', 'safety-net-advice'],
  },
  {
    id: 'case-cough-003',
    clinic: 'pulmonology',
    name: 'Leila Haddad',
    age: 34,
    gender: 'F',
    sex: 'F',
    cond: 'Cough',
    complaint: 'Cough, fever, and chest discomfort.',
    chiefComplaint: 'I have had a fever and cough for four days and my chest hurts when I breathe in.',
    arrivalBlurb: 'Looks mildly unwell, breathing a little faster than usual.',
    severity: 'urgent',
    skin: '#E7BE9A',
    hair: '#2E221C',
    mood: 'sick',
    accessory: 'bandage',
    tags: ['Respiratory', 'Fever', 'Red flag: pleuritic pain'],
    guideline: 'NICE pneumonia',
    anamnesis: [
      { id: 'cap-duration', question: 'How long have you had the fever and cough?', answer: 'About four days.', relevant: true },
      { id: 'cap-sputum', question: 'Any sputum or blood when you cough?', answer: 'Yellow sputum, no blood.', relevant: true },
      { id: 'cap-breathless', question: 'Are you short of breath?', answer: 'A bit on stairs, not at rest.', relevant: true },
    ],
    vitals: { hr: 108, bp: '112/68', spo2: 95, temp: 38.4, rr: 22 },
    testResults: [
      { testId: 'cxr', result: 'Right lower zone infiltrate.', abnormal: true },
      { testId: 'crp', result: 'CRP elevated.', abnormal: true },
    ],
    diagnosisOptions: ['community_acquired_pneumonia', 'viral_urti', 'anxiety'],
    correctDiagnosisId: 'community_acquired_pneumonia',
    acceptableTreatmentIds: ['oral-antibiotics', 'fluids-advice', 'follow-up-plan', 'safety-net-advice'],
    criticalTreatmentIds: ['safety-net-advice', 'follow-up-plan'],
  },
];

export const POLYCLINIC_CASES: Record<ClinicId, PatientCase[]> = CLINIC_IDS.reduce(
  (acc, clinicId) => {
    if (clinicId === 'all-specialties') {
      acc[clinicId] = POLYCLINIC_CASE_LIST;
    } else {
      acc[clinicId] = POLYCLINIC_CASE_LIST.filter((item) => item.clinic === clinicId);
    }
    return acc;
  },
  {} as Record<ClinicId, PatientCase[]>,
);

export function getCaseSpecialty(caseId: string): ClinicId | null {
  return POLYCLINIC_CASE_LIST.find((item) => item.id === caseId)?.clinic ?? null;
}
