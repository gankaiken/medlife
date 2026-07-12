import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';

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
  const playwrightArgs = process.argv.slice(2);
  rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  const env = {
    MEDLIFE_DB_PATH: DB_PATH,
  };

  const migrateExit = await runProcess('python', ['-m', 'backend.manage_db', 'migrate'], env);
  if (migrateExit !== 0) {
    process.exit(migrateExit);
  }

  const tscExit = await runProcess(process.execPath, [
    resolve('node_modules/typescript/bin/tsc'),
    '-b',
    '--pretty',
    'false',
  ]);
  if (tscExit !== 0) {
    process.exit(tscExit);
  }

  const buildExit = await runProcess(
    process.execPath,
    [resolve('node_modules/vite/bin/vite.js'), 'build'],
    { VITE_API_BASE_URL: 'http://127.0.0.1:8787' },
  );
  if (buildExit !== 0) {
    process.exit(buildExit);
  }

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
    const playwrightExit = await runProcess(process.execPath, [
      resolve('node_modules/@playwright/test/cli.js'),
      'test',
      '--config',
      resolve('playwright.real.config.ts'),
      ...playwrightArgs,
    ]);
    process.exitCode = playwrightExit;
  } finally {
    try {
      backend.kill('SIGTERM');
    } catch {
      // already exited
    }
    await waitForPortReleased(BACKEND_PORT, 10000).catch(() => undefined);
    await waitForPortReleased(FRONTEND_PORT, 10000).catch(() => undefined);
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  process.stderr.write(`[real-e2e] runner failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
