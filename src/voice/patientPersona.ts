export function parentGenderForId(caseId: string): 'M' | 'F' {
  const hash = Array.from(caseId).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return hash % 2 === 0 ? 'F' : 'M';
}
