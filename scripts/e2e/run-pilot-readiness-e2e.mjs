import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import net from 'node:net';
import { resolve } from 'node:path';
import { startManagedStaticServer } from './server-lifecycle.mjs';

const POLL_INTERVAL_MS = 150;
const BACKEND_READY_TIMEOUT_MS = 30_000;
const PORT_RELEASE_TIMEOUT_MS = 10_000;
const TEMP_ROOT = resolve('.tmp', 'pilot-readiness-e2e');

function nowIso() {
  return new Date().toISOString();
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

function mirrorStream(stream, filePath, targetWriter) {
  if (!stream) return;
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    appendFileSync(filePath, text, 'utf8');
    targetWriter.write(text);
  });
}

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

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitForPortReleased(port, timeoutMs = PORT_RELEASE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) return true;
    await wait(POLL_INTERVAL_MS);
  }
  return !(await isPortOpen(port));
}

function httpProbe(url, timeoutMs = 2000) {
  return new Promise((resolveProbe) => {
    const req = httpRequest(
      url,
      {
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolveProbe({
            ok: true,
            statusCode: res.statusCode ?? 0,
            body,
          });
        });
      },
    );
    req.once('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.once('error', (error) => {
      resolveProbe({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    req.end();
  });
}

function formatRecentLogs(filePath, maxLines = 40) {
  if (!existsSync(filePath)) return '';
  const content = readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).filter(Boolean).slice(-maxLines).join('\n');
}

function classifyStartupFailure({ portOpen, childExit, livez, readyz }) {
  if (childExit) return 'backend process crash';
  if (!portOpen && !livez.ok) return 'process failed before binding';
  if (livez.ok && !readyz.ok) return 'readiness failure';
  if (portOpen && !livez.ok) return 'port accepted but liveness failed';
  return 'timeout too short or unknown startup failure';
}

async function waitForBackendReadiness({
  child,
  port,
  timeoutMs,
  stdoutPath,
  stderrPath,
  metadataPath,
}) {
  const startedAt = Date.now();
  let lastLivez = { ok: false, error: 'not checked' };
  let lastReadyz = { ok: false, error: 'not checked' };

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      const detail = {
        category: 'backend process crash',
        childPid: child.pid,
        exitCode: child.exitCode,
        exitSignal: null,
        startupDurationMs: Date.now() - startedAt,
        lastLivez,
        lastReadyz,
        metadataPath,
        stdoutTail: formatRecentLogs(stdoutPath),
        stderrTail: formatRecentLogs(stderrPath),
      };
      throw new Error(`[pilot-e2e] backend startup failed ${JSON.stringify(detail, null, 2)}`);
    }

    const portOpen = await isPortOpen(port);
    if (portOpen) {
      lastLivez = await httpProbe(`http://127.0.0.1:${port}/livez`);
      lastReadyz = await httpProbe(`http://127.0.0.1:${port}/readyz`);
      if (lastReadyz.ok && lastReadyz.statusCode === 200) {
        return {
          startupDurationMs: Date.now() - startedAt,
          lastLivez,
          lastReadyz,
        };
      }
    }

    await wait(POLL_INTERVAL_MS);
  }

  const portOpen = await isPortOpen(port);
  const detail = {
    category: classifyStartupFailure({
      portOpen,
      childExit: child.exitCode !== null,
      livez: lastLivez,
      readyz: lastReadyz,
    }),
    childPid: child.pid,
    exitCode: child.exitCode,
    exitSignal: null,
    startupDurationMs: Date.now() - startedAt,
    portOpen,
    lastLivez,
    lastReadyz,
    metadataPath,
    stdoutTail: formatRecentLogs(stdoutPath),
    stderrTail: formatRecentLogs(stderrPath),
  };
  throw new Error(`[pilot-e2e] backend readiness timeout ${JSON.stringify(detail, null, 2)}`);
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
  const runDir = resolve(TEMP_ROOT, runId);
  const dbPath = resolve(runDir, 'medlife-pilot-readiness.sqlite3');
  const backendStdoutPath = resolve(runDir, 'backend.stdout.log');
  const backendStderrPath = resolve(runDir, 'backend.stderr.log');
  const metadataPath = resolve(runDir, 'lifecycle.json');
  mkdirSync(runDir, { recursive: true });

  const backendPort = await reservePort();
  const frontendPort = await reservePort();
  const appUrl = `http://127.0.0.1:${frontendPort}/`;
  const apiOrigin = `http://127.0.0.1:${backendPort}`;
  const roleEmails = {
    learner: `learner.${runId}@example.com`,
    educator: `educator.${runId}@example.com`,
    clinical: `clinical.${runId}@example.com`,
    curriculum: `curriculum.${runId}@example.com`,
    admin: `admin.${runId}@example.com`,
  };

  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        runId,
        parentPid: process.pid,
        backendPid: null,
        frontendPid: null,
        backendPort,
        frontendPort,
        startedAt: nowIso(),
        tempDir: runDir,
        sqlitePath: dbPath,
        backendStdoutPath,
        backendStderrPath,
        command: ['python', '-m', 'uvicorn', 'backend.server:app', '--host', '127.0.0.1', '--port', String(backendPort)],
      },
      null,
      2,
    ),
    'utf8',
  );

  const env = {
    MEDLIFE_DB_PATH: dbPath,
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
    port: frontendPort,
    rootDir: 'dist',
    extraEnv: {
      MEDLIFE_STATIC_PROXY_TARGET: apiOrigin,
    },
  });

  const backend = spawn(
    'python',
    ['-m', 'uvicorn', 'backend.server:app', '--host', '127.0.0.1', '--port', String(backendPort)],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: {
        ...process.env,
        ...env,
      },
    },
  );
  mirrorStream(backend.stdout, backendStdoutPath, process.stdout);
  mirrorStream(backend.stderr, backendStderrPath, process.stderr);
  let backendExitInfo = null;
  backend.once('exit', (code, signal) => {
    backendExitInfo = { code, signal, at: nowIso() };
    appendFileSync(
      backendStderrPath,
      `\n[pilot-e2e] backend exited code=${String(code)} signal=${String(signal)} at=${backendExitInfo.at}\n`,
      'utf8',
    );
  });

  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        ...JSON.parse(readFileSync(metadataPath, 'utf8')),
        backendPid: backend.pid,
        frontendPid: frontend.pid,
      },
      null,
      2,
    ),
    'utf8',
  );

  const forwardSignal = (signal) => {
    if (!backend.killed) {
      backend.kill(signal);
    }
  };
  process.once('SIGINT', forwardSignal);
  process.once('SIGTERM', forwardSignal);

  let readiness = null;
  try {
    readiness = await waitForBackendReadiness({
      child: backend,
      port: backendPort,
      timeoutMs: BACKEND_READY_TIMEOUT_MS,
      stdoutPath: backendStdoutPath,
      stderrPath: backendStderrPath,
      metadataPath,
    });
    process.stdout.write(`[pilot-e2e] backend ready backendPort=${backendPort} frontendPort=${frontendPort} startupMs=${readiness.startupDurationMs}\n`);
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
          PLAYWRIGHT_BASE_URL: appUrl,
          MEDLIFE_E2E_RUN_ID: runId,
          MEDLIFE_E2E_APP_URL: appUrl,
          MEDLIFE_E2E_API_ORIGIN: apiOrigin,
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
    const backendReleased = await waitForPortReleased(backendPort, PORT_RELEASE_TIMEOUT_MS).catch(() => false);
    await frontend.stop({ preserveLogsOnFailure: true, successful: process.exitCode === 0 });
    const frontendReleased = await waitForPortReleased(frontendPort, PORT_RELEASE_TIMEOUT_MS).catch(() => false);
    const cleanupOk = process.exitCode === 0 && backendReleased && frontendReleased;
    process.stdout.write(
      `[pilot-e2e] cleanup exitCode=${String(process.exitCode ?? 1)} backendPort=${backendPort} frontendPort=${frontendPort} ` +
        `livez=${readiness?.lastLivez?.statusCode ?? 'n/a'} readyz=${readiness?.lastReadyz?.statusCode ?? 'n/a'} ` +
        `portsReleased=${backendReleased && frontendReleased} backendReleased=${backendReleased} frontendReleased=${frontendReleased} ` +
        `sqlitePath=${dbPath} backendPid=${backend.pid} frontendPid=${frontend.pid}\n`,
    );
    if (cleanupOk) {
      rmSync(runDir, { recursive: true, force: true });
    }
    if (!cleanupOk) {
      appendFileSync(
        backendStderrPath,
        `\n[pilot-e2e] cleanup preserved logs exitCode=${String(process.exitCode ?? 1)} backendReleased=${backendReleased} frontendReleased=${frontendReleased} backendExit=${JSON.stringify(backendExitInfo)}\n`,
        'utf8',
      );
    }
  }
}

void main().catch((error) => {
  process.stderr.write(`[pilot-e2e] runner failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
