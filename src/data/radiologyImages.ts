export interface ImagingExample {
  url: string;
  caption: string;
  credit: string;
}

export function getImagingExamples(testId: string, abnormal: boolean, diagnosisId: string): ImagingExample[] {
  if (testId !== 'cxr') return [];
  return [
    {
      url: abnormal ? '/images/cxr-abnormal.png' : '/images/cxr-normal.png',
      caption: abnormal ? `Representative finding for ${diagnosisId}` : 'No acute abnormality',
      credit: 'Medlife demo placeholder image',
    },
  ];
}
