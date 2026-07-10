import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApiUrl, resolveApiBaseFromEnv } from '../../src/agents/debriefApi.ts';

test('resolveApiBaseFromEnv trims whitespace and trailing slash', () => {
  assert.equal(resolveApiBaseFromEnv('  http://127.0.0.1:8787/  '), 'http://127.0.0.1:8787');
});

test('resolveApiBaseFromEnv returns empty string when not configured', () => {
  assert.equal(resolveApiBaseFromEnv(undefined), '');
  assert.equal(resolveApiBaseFromEnv('   '), '');
});

test('buildApiUrl keeps relative path in dev and offline mode when no explicit API base is provided', () => {
  assert.equal(buildApiUrl('/health', ''), '/health');
  assert.equal(buildApiUrl('/agent/debrief', ''), '/agent/debrief');
});

test('buildApiUrl prefixes explicit API base for local preview or hosted split-backend mode', () => {
  assert.equal(buildApiUrl('/health', 'http://127.0.0.1:8787'), 'http://127.0.0.1:8787/health');
  assert.equal(
    buildApiUrl('/agent/capabilities', 'https://api.medlife.example'),
    'https://api.medlife.example/agent/capabilities',
  );
});
