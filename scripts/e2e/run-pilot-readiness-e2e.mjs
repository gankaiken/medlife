import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';
import { startManagedStaticServer } from './server-lifecycle.mjs';

const BACKEND_PORT = 8787;
const FRONTEND_PORT = 4173;
const TEMP_DIR = resolve('.tmp', 'pilot-readiness-e2e');
const DB_PATH = resolve(TEMP_DIR, 'medlife-pilot-readiness.sqlite3');

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

  const runId = `${Date.now()}`;
  const roleEmails = {
    learner: `learner.${runId}@example.com`,
    educator: `educator.${runId}@example.com`,
    clinical: `clinical.${runId}@example.com`,
    curriculum: `curriculum.${runId}@example.com`,
    admin: `admin.${runId}@example.com`,
  };

  rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  const env = {
    MEDLIFE_DB_PATH: DB_PATH,
    MEDLIFE_E2E_TEST_MODE: '1',
    MEDLIFE_PILOT_ID: `monash-candidate-pilot-${runId}`,
    MEDLIFE_RESEARCH_CONSENT_VERSION: `fixture-consent-${runId}`,
    MEDLIFE_EDUCATOR_REVIEWER_EMAILS: roleEmails.educator,
    MEDLIFE_CLINICAL_REVIEWER_EMAILS: roleEmails.clinical,
    MEDLIFE_CURRICULUM_REVIEWER_EMAILS: roleEmails.curriculum,
    MEDLIFE_PILOT_ADMIN_EMAILS: roleEmails.admin,
  };

  if (!existsSync(resolve('dist', 'index.html'))) {
    process.stderr.write('[pilot-e2e] dist/index.html is missing. Run `npm run build` before `npm run test:e2e:pilot-readiness`.\n');
    process.exit(1);
  }

  const migrateExit = await runProcess('python', ['-m', 'backend.manage_db', 'migrate'], env);
  if (migrateExit !== 0) process.exit(migrateExit);

  const frontend = await startManagedStaticServer({
    label: 'pilot-readiness-suite',
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
    await frontend.assertHealthy('before-pilot-playwright');
    const playwrightExit = await new Promise((resolveExit, reject) => {
      const child = spawn(process.execPath, [
        resolve('node_modules/@playwright/test/cli.js'),
        'test',
        '--config',
        resolve('playwright.real.config.ts'),
        'scripts/e2e/pilot-readiness.real.spec.ts',
        ...playwrightArgs,
      ], {
        cwd: process.cwd(),
        stdio: 'inherit',
        shell: false,
        env: {
          ...process.env,
          ...env,
          MEDLIFE_E2E_RUN_ID: runId,
          MEDLIFE_E2E_ROLE_LEARNER_EMAIL: roleEmails.learner,
          MEDLIFE_E2E_ROLE_EDUCATOR_EMAIL: roleEmails.educator,
          MEDLIFE_E2E_ROLE_CLINICAL_EMAIL: roleEmails.clinical,
          MEDLIFE_E2E_ROLE_CURRICULUM_EMAIL: roleEmails.curriculum,
          MEDLIFE_E2E_ROLE_ADMIN_EMAIL: roleEmails.admin,
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
    await frontend.assertHealthy('after-pilot-playwright');
  } finally {
    try {
      backend.kill('SIGTERM');
    } catch {}
    await waitForPortReleased(BACKEND_PORT, 10000).catch(() => undefined);
    await frontend.stop({ preserveLogsOnFailure: true, successful: process.exitCode === 0 });
    await waitForPortReleased(FRONTEND_PORT, 10000).catch(() => undefined);
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  process.stderr.write(`[pilot-e2e] runner failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
