export interface Treatment {
  id: string;
  name: string;
  category: 'advice' | 'medication' | 'follow-up' | 'disposition';
}

export const TREATMENTS: Treatment[] = [
  { id: 'paracetamol', name: 'Paracetamol', category: 'medication' },
  { id: 'oral-iron', name: 'Oral iron', category: 'medication' },
  { id: 'oral-antibiotics', name: 'Oral antibiotics', category: 'medication' },
  { id: 'advice-rest', name: 'Rest and hydration advice', category: 'advice' },
  { id: 'diet-advice', name: 'Dietary advice', category: 'advice' },
  { id: 'fluids-advice', name: 'Fluids advice', category: 'advice' },
  { id: 'follow-up-plan', name: 'Arrange follow-up', category: 'follow-up' },
  { id: 'safety-net-advice', name: 'Safety-net advice', category: 'follow-up' },
];
