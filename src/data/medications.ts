import type { ClinicId } from '../game/clinic.ts';

export type MedicationCategory = 'analgesia' | 'respiratory' | 'hematology' | 'general';

export interface Medication {
  id: string;
  name: string;
  category: MedicationCategory;
  defaultDose: string;
  defaultDuration: string;
  indications: string[];
  class?: string;
  form?: string;
}

export const CATEGORY_LABELS: Record<MedicationCategory, string> = {
  analgesia: 'Analgesia',
  respiratory: 'Respiratory',
  hematology: 'Hematology',
  general: 'General',
};

export const MEDICATIONS: Medication[] = [
  {
    id: 'paracetamol-tablets',
    name: 'Paracetamol',
    category: 'analgesia',
    defaultDose: '1 g PO',
    defaultDuration: 'PRN for 3 days',
    indications: ['tension_headache'],
    class: 'Analgesic',
    form: 'Tablet',
  },
  {
    id: 'ferrous-sulfate',
    name: 'Ferrous sulfate',
    category: 'hematology',
    defaultDose: '200 mg PO',
    defaultDuration: '8 weeks',
    indications: ['iron_deficiency_anemia'],
    class: 'Iron supplement',
    form: 'Tablet',
  },
  {
    id: 'amoxicillin',
    name: 'Amoxicillin',
    category: 'respiratory',
    defaultDose: '500 mg PO TDS',
    defaultDuration: '5 days',
    indications: ['community_acquired_pneumonia'],
    class: 'Antibiotic',
    form: 'Capsule',
  },
];

export const SPECIALTY_MEDICATION_CATEGORIES: Record<ClinicId, MedicationCategory[]> = {
  'all-specialties': ['analgesia', 'respiratory', 'hematology', 'general'],
  'internal-medicine': ['hematology', 'general'],
  cardiology: ['general'],
  neurology: ['analgesia', 'general'],
  neurosurgery: ['analgesia', 'general'],
  dermatology: ['general'],
  endocrinology: ['general'],
  gastroenterology: ['general'],
  pulmonology: ['respiratory', 'general'],
  nephrology: ['general'],
  rheumatology: ['general'],
  hematology: ['hematology', 'general'],
  oncology: ['general'],
  'infectious-disease': ['respiratory', 'general'],
  'allergy-immunology': ['general'],
  psychiatry: ['general'],
  obgyn: ['general'],
  urology: ['general'],
  ophthalmology: ['general'],
  ent: ['general'],
  orthopedics: ['analgesia', 'general'],
  pmr: ['analgesia', 'general'],
  pediatrics: ['general'],
  'general-surgery': ['analgesia', 'general'],
  'cardiothoracic-vascular-surgery': ['general'],
};

export function medicationById(id: string): Medication | null {
  return MEDICATIONS.find((item) => item.id === id) ?? null;
}
