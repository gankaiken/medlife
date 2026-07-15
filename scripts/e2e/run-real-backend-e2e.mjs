import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';
import { startManagedStaticServer } from './server-lifecycle.mjs';

const TEMP_ROOT = resolve('.tmp', 'real-backend-e2e');
let shuttingDown = false;
let shutdownPromise = null;

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

function reservePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.unref();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) {
          rejectPort(error);
          return;
        }
        if (typeof port !== 'number') {
          rejectPort(new Error('failed to reserve port'));
          return;
        }
        resolvePort(port);
      });
    });
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
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tempDir = resolve(TEMP_ROOT, runId);
  const dbPath = resolve(tempDir, 'medlife-round2c.sqlite3');
  mkdirSync(tempDir, { recursive: true });
  const backendPort = await reservePort();
  const frontendPort = await reservePort();
  const apiOrigin = `http://127.0.0.1:${backendPort}`;
  const appUrl = `http://127.0.0.1:${frontendPort}`;

  const env = {
    MEDLIFE_DB_PATH: dbPath,
    MEDLIFE_E2E_TEST_MODE: '1',
    MEDLIFE_EDUCATOR_REVIEWER_EMAILS: process.env.MEDLIFE_E2E_ROLE_EDUCATOR_EMAIL ?? 'educator@example.com',
    MEDLIFE_CLINICAL_REVIEWER_EMAILS: process.env.MEDLIFE_E2E_ROLE_CLINICAL_EMAIL ?? 'clinical@example.com',
    MEDLIFE_CURRICULUM_REVIEWER_EMAILS: process.env.MEDLIFE_E2E_ROLE_CURRICULUM_EMAIL ?? 'curriculum@example.com',
    MEDLIFE_PILOT_ADMIN_EMAILS: process.env.MEDLIFE_E2E_ROLE_ADMIN_EMAIL ?? 'admin@example.com',
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
    port: frontendPort,
    rootDir: 'dist',
    extraEnv: {
      MEDLIFE_STATIC_PROXY_TARGET: apiOrigin,
    },
  });
  const backend = spawnBackground(
    'python',
    ['-m', 'uvicorn', 'backend.server:app', '--host', '127.0.0.1', '--port', String(backendPort)],
    env,
  );

  const shutdown = async (reason, requestedExitCode = process.exitCode ?? 1) => {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownPromise = (async () => {
      try {
        if (!backend.killed) {
          backend.kill('SIGTERM');
        }
      } catch {
        // ignore
      }
      await waitForPortReleased(backendPort, 10000).catch(() => undefined);
      await frontend.stop({ preserveLogsOnFailure: true, successful: requestedExitCode === 0 });
      rmSync(tempDir, { recursive: true, force: true });
      return requestedExitCode;
    })();
    return shutdownPromise;
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT', 130).then((code) => process.exit(code));
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM', 143).then((code) => process.exit(code));
  });
  process.once('uncaughtException', (error) => {
    process.stderr.write(`[real-e2e] uncaughtException: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    void shutdown('uncaughtException', 1).then((code) => process.exit(code));
  });
  process.once('unhandledRejection', (error) => {
    process.stderr.write(`[real-e2e] unhandledRejection: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    void shutdown('unhandledRejection', 1).then((code) => process.exit(code));
  });

  try {
    await waitForPortOpen(backendPort, 15000);
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
          PLAYWRIGHT_BASE_URL: appUrl,
          MEDLIFE_E2E_APP_URL: `${appUrl}/`,
          MEDLIFE_E2E_API_ORIGIN: apiOrigin,
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
    if (!shuttingDown) {
      process.exitCode = await shutdown('normal-exit', process.exitCode ?? 1);
    }
  }
}

void main().catch((error) => {
  process.stderr.write(`[real-e2e] runner failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
