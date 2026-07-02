import type { ClinicId } from '../game/clinic.ts';

export type TestCategory = 'bedside' | 'lab' | 'imaging';

export interface TestDefinition {
  id: string;
  name: string;
  category: TestCategory;
  panel?: string;
}

export const TESTS: TestDefinition[] = [
  { id: 'bp-check', name: 'Blood pressure check', category: 'bedside', panel: 'observations' },
  { id: 'fbc', name: 'Full blood count', category: 'lab', panel: 'bloods' },
  { id: 'ferritin', name: 'Ferritin', category: 'lab', panel: 'bloods' },
  { id: 'crp', name: 'CRP', category: 'lab', panel: 'bloods' },
  { id: 'cxr', name: 'Chest X-ray', category: 'imaging', panel: 'imaging' },
];

export const TEST_PANELS: Array<{
  id: string;
  label: string;
  description: string;
  testIds: string[];
  clinicIds: ClinicId[];
}> = [
  {
    id: 'observations',
    label: 'Observations',
    description: 'Instant bedside observations for a quick first pass.',
    testIds: ['bp-check'],
    clinicIds: ['all-specialties', 'internal-medicine', 'neurology', 'pulmonology'],
  },
  {
    id: 'bloods',
    label: 'Bloods',
    description: 'Core blood tests commonly used in polyclinic workups.',
    testIds: ['fbc', 'ferritin', 'crp'],
    clinicIds: ['all-specialties', 'internal-medicine', 'pulmonology'],
  },
  {
    id: 'imaging',
    label: 'Imaging',
    description: 'Low-friction imaging bundle for respiratory cases.',
    testIds: ['cxr'],
    clinicIds: ['all-specialties', 'pulmonology'],
  },
];

export function testById(id: string): TestDefinition | null {
  return TESTS.find((item) => item.id === id) ?? null;
}
