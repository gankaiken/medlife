import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

function read(relPath: string) {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

test('onboarding does not promise live model-powered patient conversation', () => {
  const source = read('src/components/OnboardingScreen.tsx');
  assert.doesNotMatch(source, /Patient conversations powered by/i);
  assert.match(source, /guided learner flow/i);
  assert.match(source, /AI debrief/i);
  assert.match(source, /rule-based assessment/i);
});

test('agent topology is framed as prototype architecture rather than live runtime proof', () => {
  const source = read('src/components/AgentTopologyScreen.tsx');
  assert.match(source, /PROTOTYPE ARCHITECTURE/i);
  assert.match(source, /product map, not proof that every service shown is live/i);
  assert.match(source, /Live voice remains planned\/experimental/i);
  assert.match(source, /Authenticated learners now save encounters, assessments, and progress on the backend/i);
  assert.doesNotMatch(source, /No authentication or shared records yet/i);
  assert.doesNotMatch(source, /Opus 4\.7/i);
  assert.doesNotMatch(source, /Live . agent topology/i);
});

test('agentic rounds separates guided flow from optional backend AI and planned voice', () => {
  const source = read('src/components/AgenticRoundsScreen.tsx');
  assert.match(source, /guided consultation simulator/i);
  assert.match(source, /AI debrief optional/i);
  assert.match(source, /Learner-facing live voice is not part of the current shipped guided browser flow/i);
  assert.match(source, /Learner accounts and server-backed encounter history now exist alongside signed-out local mode/i);
  assert.match(source, /not a claim that every service shown is currently live/i);
  assert.doesNotMatch(source, /No authentication or server-side persistence exists yet for learners/i);
  assert.doesNotMatch(source, /Claude Managed Agent/i);
  assert.doesNotMatch(source, /Opus 4\.7/i);
});
