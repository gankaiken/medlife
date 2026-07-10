import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRuleBasedDebrief } from '../../src/agents/ruleBasedDebrief.ts';
import type { DebriefRequest } from '../../src/agents/debriefRequest.ts';

const FIXTURE_DIR = resolve('fixtures/rule-based');
const CASE_IDS = ['case-headache-001', 'case-anemia-002', 'case-cough-003'] as const;

for (const caseId of CASE_IDS) {
  test(`rule-based frontend fixture matches expected output for ${caseId}`, () => {
    const request = JSON.parse(
      readFileSync(resolve(FIXTURE_DIR, `${caseId}.request.json`), 'utf8'),
    ) as DebriefRequest;
    const expected = JSON.parse(
      readFileSync(resolve(FIXTURE_DIR, `${caseId}.expected.json`), 'utf8'),
    );

    assert.deepEqual(buildRuleBasedDebrief(request), expected);
  });
}
