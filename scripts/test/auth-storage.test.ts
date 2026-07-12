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
  const homeScreen = read('src/components/HomeScreen.tsx');
  const backendReadme = read('backend/README.md');

  assert.match(accountApi, /credentials:\s*'include'/i);
  assert.match(accountApi, /auth\/export/i);
  assert.doesNotMatch(accountApi, /localStorage/i);
  assert.match(authProvider, /medlife\.preferences\.v1/i);
  assert.doesNotMatch(authProvider, /medlife_session/i);
  assert.match(authProvider, /session expired/i);
  assert.match(homeScreen, /Account deletion is still unavailable in this training build/i);
  assert.doesNotMatch(accountApi, /auth\/delete/i);
  assert.match(backendReadme, /Account deletion is not implemented yet/i);
  assert.match(encounterSyncProvider, /medlife\.pendingSync\.v1/i);
  assert.doesNotMatch(encounterSyncProvider, /medlife_session/i);
});
