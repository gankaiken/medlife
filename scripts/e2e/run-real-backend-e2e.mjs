import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';
import { startManagedStaticServer } from './server-lifecycle.mjs';

const BACKEND_PORT = 8787;
const FRONTEND_PORT = 4173;
const TEMP_DIR = resolve('.tmp', 'real-backend-e2e');
const DB_PATH = resolve(TEMP_DIR, 'medlife-round2c.sqlite3');

function isPortOpen(port) {
  return new Promise((resolvePort) => {
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

async function waitForPortOpen(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for port ${port} to open`);
}

async function waitForPortReleased(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for port ${port} to close`);
}

function normalizeExitCode(code, signal) {
  if (typeof code === 'number') return code;
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  return 1;
}

function runProcess(command, args, extraEnv = {}) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        ...extraEnv,
      },
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolveExit(normalizeExitCode(code, signal));
    });
  });
}

function spawnBackground(command, args, extraEnv = {}) {
  return spawn(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const forceFailureIndex = rawArgs.indexOf('--force-failure');
  const forcedFailureMarker =
    forceFailureIndex >= 0 && forceFailureIndex + 1 < rawArgs.length ? rawArgs[forceFailureIndex + 1] : null;
  const playwrightArgs = rawArgs.filter((arg, index) => {
    if (forceFailureIndex >= 0 && (index === forceFailureIndex || index === forceFailureIndex + 1)) return false;
    return true;
  });
  rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  const env = {
    MEDLIFE_DB_PATH: DB_PATH,
  };

  if (!existsSync(resolve('dist', 'index.html'))) {
    process.stderr.write('[real-e2e] dist/index.html is missing. Run `npm run build` before `npm run test:e2e:real`.\n');
    process.exit(1);
  }

  const migrateExit = await runProcess('python', ['-m', 'backend.manage_db', 'migrate'], env);
  if (migrateExit !== 0) {
    process.exit(migrateExit);
  }

  const frontend = await startManagedStaticServer({
    label: 'real-suite',
    port: FRONTEND_PORT,
    rootDir: 'dist',
    extraEnv: {
      MEDLIFE_STATIC_PROXY_TARGET: `http://127.0.0.1:${BACKEND_PORT}`,
    },
  });
  const backend = spawnBackground(
    'python',
    ['-m', 'uvicorn', 'backend.server:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
    env,
  );

  const forwardSignal = (signal) => {
    if (!backend.killed) {
      backend.kill(signal);
    }
  };
  process.once('SIGINT', forwardSignal);
  process.once('SIGTERM', forwardSignal);

  try {
    await waitForPortOpen(BACKEND_PORT, 15000);
    await frontend.assertHealthy('before-real-playwright');
    const playwrightExit = await new Promise((resolveExit, reject) => {
      const child = spawn(process.execPath, [
        resolve('node_modules/@playwright/test/cli.js'),
        'test',
        '--config',
        resolve('playwright.real.config.ts'),
        ...playwrightArgs,
      ], {
        cwd: process.cwd(),
        stdio: 'inherit',
        shell: false,
        env: {
          ...process.env,
          ...(forcedFailureMarker ? { MEDLIFE_E2E_FORCE_FAILURE: forcedFailureMarker } : {}),
        },
      });
      frontend.bindPlaywrightChild(child);
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        resolveExit(normalizeExitCode(code, signal));
      });
    });
    process.exitCode = playwrightExit;
    await frontend.assertHealthy('after-real-playwright');
  } finally {
    try {
      backend.kill('SIGTERM');
    } catch {
      // already exited
    }
    await waitForPortReleased(BACKEND_PORT, 10000).catch(() => undefined);
    await frontend.stop({ preserveLogsOnFailure: false, successful: process.exitCode === 0 });
    await waitForPortReleased(FRONTEND_PORT, 10000).catch(() => undefined);
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  process.stderr.write(`[real-e2e] runner failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
