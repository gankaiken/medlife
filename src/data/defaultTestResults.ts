export interface TestReport {
  text: string;
  abnormal: boolean;
}

export function getTestReport(testId: string, rawResult?: string, abnormal?: boolean): TestReport {
  return {
    text: rawResult ?? `${testId} pending.`,
    abnormal: Boolean(abnormal),
  };
}
