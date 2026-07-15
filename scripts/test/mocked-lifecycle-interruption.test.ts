import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';

function isPortOpen(port: number) {
  return new Promise<boolean>((resolvePort) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolvePort(true);
    });
    socket.once('error', () => {
      resolvePort(false);
    });
  });
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('timed out waiting for condition');
}

test('mocked lifecycle smoke releases its port and active state after interruption, then restarts cleanly', async () => {
  const scriptPath = resolve('scripts/e2e/mocked-lifecycle-smoke.mjs');
  const e2eTempRoot = resolve('.tmp', 'e2e');
  const labelStatePath = resolve(e2eTempRoot, 'mocked-lifecycle-smoke.active.json');
  if (existsSync(labelStatePath)) {
    rmSync(labelStatePath, { force: true });
  }
  if (existsSync(e2eTempRoot)) {
    for (const entry of readdirSync(e2eTempRoot)) {
      if (entry.includes('mocked-lifecycle-smoke')) {
        rmSync(resolve(e2eTempRoot, entry), { recursive: true, force: true });
      }
    }
  }

  const first = spawn(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  let output = '';
  first.stdout.setEncoding('utf8');
  first.stdout.on('data', (chunk) => {
    output += chunk;
  });

  await waitFor(async () => /SMOKE_PORT=(\d+)/.test(output));
  const match = output.match(/SMOKE_PORT=(\d+)/);
  assert.ok(match, 'expected smoke port marker');
  const port = Number(match[1]);
  assert.ok(Number.isInteger(port) && port > 0);
  await waitFor(async () => await isPortOpen(port));
  assert.equal(existsSync(labelStatePath), true);
  const firstState = JSON.parse(readFileSync(labelStatePath, 'utf8')) as { tempDir?: string };
  assert.ok(firstState.tempDir, 'expected first tempDir in active state');

  first.kill('SIGINT');
  const firstExit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit) => {
    first.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
  assert.equal(firstExit.code === 130 || firstExit.signal === 'SIGINT', true);
  await waitFor(async () => !(await isPortOpen(port)));

  const second = spawn(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  let secondOutput = '';
  second.stdout.setEncoding('utf8');
  second.stdout.on('data', (chunk) => {
    secondOutput += chunk;
  });
  await waitFor(async () => /SMOKE_PORT=(\d+)/.test(secondOutput));
  const secondMatch = secondOutput.match(/SMOKE_PORT=(\d+)/);
  assert.ok(secondMatch, 'expected second smoke port marker');
  const secondPort = Number(secondMatch[1]);
  await waitFor(async () => await isPortOpen(secondPort));
  assert.equal(existsSync(labelStatePath), true);
  const secondState = JSON.parse(readFileSync(labelStatePath, 'utf8')) as { tempDir?: string };
  assert.ok(secondState.tempDir, 'expected second tempDir in active state');
  assert.notEqual(secondState.tempDir, firstState.tempDir);
  assert.equal(existsSync(firstState.tempDir ?? ''), false);
  second.kill('SIGINT');
  const secondExit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit) => {
    second.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
  assert.equal(secondExit.code === 130 || secondExit.signal === 'SIGINT', true);
  await waitFor(async () => !(await isPortOpen(secondPort)));
  rmSync(labelStatePath, { force: true });
  rmSync(secondState.tempDir ?? '', { recursive: true, force: true });
});
