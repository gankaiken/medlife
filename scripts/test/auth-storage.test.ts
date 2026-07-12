import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

function read(relPath: string) {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

test('authentication uses cookies instead of localStorage token persistence', () => {
  const accountApi = read('src/agents/accountApi.ts');
  const authProvider = read('src/runtime/AuthProvider.tsx');
  const encounterSyncProvider = read('src/runtime/EncounterSyncProvider.tsx');

  assert.match(accountApi, /credentials:\s*'include'/i);
  assert.match(accountApi, /auth\/export/i);
  assert.doesNotMatch(accountApi, /localStorage/i);
  assert.doesNotMatch(authProvider, /localStorage/i);
  assert.match(authProvider, /session expired/i);
  assert.match(encounterSyncProvider, /medlife\.pendingSync\.v1/i);
  assert.doesNotMatch(encounterSyncProvider, /medlife_session/i);
});
