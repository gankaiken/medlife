export interface GuidelineRecommendation {
  recId: string;
  text: string;
  recClass?: string;
  lev?: string;
  gradeStrength?: string;
  gradeCertainty?: string;
}

export interface Guideline {
  id: string;
  body: string;
  year: number;
  region: string;
  title: string;
  url: string;
  recommendations: GuidelineRecommendation[];
  notes?: string;
}

export const GUIDELINES: Guideline[] = [
  {
    id: 'nice-headache',
    body: 'NICE',
    year: 2024,
    region: 'UK',
    title: 'Headaches in over 12s',
    url: 'https://www.nice.org.uk/',
    recommendations: [
      { recId: 'headache-redflags', text: 'Screen for red flags and reassure if absent.', recClass: 'I', lev: 'C' },
      { recId: 'headache-safetynet', text: 'Give clear return precautions for worsening symptoms.', recClass: 'I', lev: 'C' },
    ],
  },
  {
    id: 'nice-anemia',
    body: 'NICE',
    year: 2024,
    region: 'UK',
    title: 'Anaemia and iron deficiency',
    url: 'https://www.nice.org.uk/',
    recommendations: [
      { recId: 'anemia-confirm', text: 'Confirm iron deficiency with blood tests.', recClass: 'I', lev: 'B' },
      { recId: 'anemia-followup', text: 'Treat and arrange follow-up of haemoglobin response.', recClass: 'I', lev: 'B' },
    ],
  },
  {
    id: 'nice-pneumonia',
    body: 'NICE',
    year: 2025,
    region: 'UK',
    title: 'Community-acquired pneumonia',
    url: 'https://www.nice.org.uk/',
    recommendations: [
      { recId: 'pna-assess', text: 'Assess severity and safety-net appropriately.', recClass: 'I', lev: 'B' },
      { recId: 'pna-antibiotics', text: 'Offer appropriate oral antibiotics for low-severity CAP.', recClass: 'I', lev: 'A' },
    ],
  },
];

export function getGuideline(id: string): Guideline | null {
  return GUIDELINES.find((item) => item.id === id) ?? null;
}

export function getRecommendation(ref: string) {
  const [guidelineId, recId] = ref.split(':');
  const guideline = getGuideline(guidelineId);
  if (!guideline) return null;
  const rec = guideline.recommendations.find((item) => item.recId === recId);
  if (!rec) return null;
  return { guideline, rec };
}
