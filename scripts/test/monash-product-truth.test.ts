import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const LEARNER_FACING_FILES = [
  'src/components/HomeScreen.tsx',
  'src/components/BriefScreen.tsx',
  'src/components/CaseLibraryScreen.tsx',
  'src/components/DebriefScreen.tsx',
  'src/components/EncounterScreen.tsx',
  'src/components/OnboardingScreen.tsx',
];

const BANNED_PATTERNS = [
  /Monash approved/i,
  /official Monash curriculum/i,
  /JCSMHS approved/i,
  /MMC approved/i,
  /clinically certified by Monash/i,
  /used for formal Monash assessment/i,
];

test('learner-facing copy avoids unauthorised Monash endorsement claims', () => {
  const source = LEARNER_FACING_FILES
    .map((relPath) => readFileSync(resolve(ROOT, relPath), 'utf8'))
    .join('\n');

  for (const pattern of BANNED_PATTERNS) {
    assert.doesNotMatch(source, pattern);
  }

  assert.match(source, /formative/i);
  assert.match(source, /education/i);
});
