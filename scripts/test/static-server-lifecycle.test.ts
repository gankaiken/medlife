import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

async function getFreePort() {
  return await new Promise<number>((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        rejectPort(new Error('Failed to allocate free port.'));
        return;
      }
      const { port } = address;
      server.close(() => resolvePort(port));
    });
    server.once('error', rejectPort);
  });
}

async function isPortOpen(port: number) {
  return await new Promise<boolean>((resolvePort) => {
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

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  return await predicate();
}

async function waitForOutput(stream: NodeJS.ReadableStream, pattern: RegExp, timeoutMs = 5000) {
  return await new Promise<void>((resolveOutput, rejectOutput) => {
    const timer = setTimeout(() => {
      cleanup();
      rejectOutput(new Error(`Timed out waiting for output: ${pattern}`));
    }, timeoutMs);

    function onData(chunk: Buffer | string) {
      const text = chunk.toString();
      if (pattern.test(text)) {
        cleanup();
        resolveOutput();
      }
    }

    function cleanup() {
      clearTimeout(timer);
      stream.off('data', onData);
    }

    stream.on('data', onData);
  });
}

function createFixtureDir() {
  const dir = mkdtempSync(join(os.tmpdir(), 'medlife-static-server-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><body><div id="root">medlife fixture</div></body></html>');
  writeFileSync(join(dir, 'app.js'), 'console.log("fixture");');
  return dir;
}

function spawnServer(dir: string, port: number) {
  return spawn(
    process.execPath,
    ['scripts/e2e/serve-static.mjs', '--dir', dir, '--port', String(port)],
    {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
}

test('static server serves index and SPA fallback, then releases the port when stdin closes', async () => {
  const fixtureDir = createFixtureDir();
  const port = await getFreePort();
  const child = spawnServer(fixtureDir, port);

  try {
    await waitForOutput(child.stdout, /Static server running/i);
    const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
    const rootText = await rootResponse.text();
    assert.equal(rootResponse.status, 200);
    assert.match(rootText, /medlife fixture/i);

    const fallbackResponse = await fetch(`http://127.0.0.1:${port}/nonexistent/route`);
    const fallbackText = await fallbackResponse.text();
    assert.equal(fallbackResponse.status, 200);
    assert.match(fallbackText, /medlife fixture/i);

    child.stdin.end();
    const exitCode = await new Promise<number | null>((resolveExit) => {
      child.once('exit', (code) => resolveExit(code));
    });
    assert.equal(exitCode, 0);
    assert.equal(await waitFor(async () => !(await isPortOpen(port))), true);
  } finally {
    child.kill('SIGKILL');
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('static server exits non-zero when the requested port is already occupied', async () => {
  const fixtureDir = createFixtureDir();
  const port = await getFreePort();
  const first = spawnServer(fixtureDir, port);

  try {
    await waitForOutput(first.stdout, /Static server running/i);

    const second = spawnServer(fixtureDir, port);
    let stderr = '';
    second.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const secondExitCode = await new Promise<number | null>((resolveExit) => {
      second.once('exit', (code) => resolveExit(code));
    });

    assert.notEqual(secondExitCode, 0);
    assert.match(stderr, /startup failed/i);
  } finally {
    first.stdin.end();
    await new Promise((resolveExit) => first.once('exit', resolveExit));
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('static server releases the port on SIGTERM without leaving 4173 occupied', async () => {
  const fixtureDir = createFixtureDir();
  const port = await getFreePort();
  const child = spawnServer(fixtureDir, port);

  try {
    await waitForOutput(child.stdout, /Static server running/i);
    assert.equal(await waitFor(async () => await isPortOpen(port)), true);
    child.kill('SIGTERM');
    await new Promise((resolveExit) => child.once('exit', resolveExit));
    assert.equal(
      await waitFor(async () => !(await isPortOpen(port)), 5000),
      true,
      'port stayed occupied after SIGTERM shutdown',
    );
  } finally {
    child.kill('SIGKILL');
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
