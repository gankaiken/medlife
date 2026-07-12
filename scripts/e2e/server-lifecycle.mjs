import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import net from 'node:net';
import { resolve } from 'node:path';

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function makeRunId(prefix) {
  return `${prefix}-${nowStamp()}-${Math.random().toString(36).slice(2, 8)}`;
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

async function waitForPortOpen(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for port ${port} to open`);
}

async function waitForPortReleased(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  return !(await isPortOpen(port));
}

function httpGetRoot(port, timeoutMs = 3000) {
  return new Promise((resolveRequest) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: '/',
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolveRequest({ ok: true, statusCode: res.statusCode ?? 0 });
      },
    );
    req.once('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.once('error', (error) => {
      resolveRequest({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
    req.end();
  });
}

function mirrorStream(stream, targetPath, targetWriter) {
  if (!stream) return;
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    appendFileSync(targetPath, text, 'utf8');
    targetWriter.write(text);
  });
}

export async function startManagedStaticServer({ label, port = 4173, rootDir = 'dist', extraEnv = {} }) {
  const runId = makeRunId(label);
  const tempDir = resolve('.tmp', 'e2e', runId);
  const statePath = resolve(tempDir, 'server-state.json');
  const stdoutPath = resolve(tempDir, 'server.stdout.log');
  const stderrPath = resolve(tempDir, 'server.stderr.log');
  mkdirSync(tempDir, { recursive: true });

  const child = spawn(
    process.execPath,
    [resolve('scripts/e2e/serve-static.mjs'), '--dir', rootDir, '--port', String(port)],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: {
        ...process.env,
        ...extraEnv,
        MEDLIFE_DISABLE_STDIN_SHUTDOWN: '1',
        MEDLIFE_DISABLE_PARENT_WATCHDOG: '1',
      },
    },
  );

  writeFileSync(
    statePath,
    JSON.stringify(
      {
        runId,
        pid: child.pid,
        parentPid: process.pid,
        port,
        command: `${process.execPath} scripts/e2e/serve-static.mjs --dir ${rootDir} --port ${port}`,
        rootDir: resolve(rootDir),
        startedAt: new Date().toISOString(),
        stdoutPath,
        stderrPath,
        tempDir,
      },
      null,
      2,
    ),
    'utf8',
  );

  mirrorStream(child.stdout, stdoutPath, process.stdout);
  mirrorStream(child.stderr, stderrPath, process.stderr);

  let exitInfo = null;
  let expectedShutdown = false;
  child.once('exit', (code, signal) => {
    exitInfo = { code, signal, at: new Date().toISOString() };
    appendFileSync(
      stderrPath,
      `\n[managed-static-server] exit code=${String(code)} signal=${String(signal)} at=${exitInfo.at}\n`,
      'utf8',
    );
  });

  await waitForPortOpen(port, 15000);
  const rootCheck = await httpGetRoot(port, 3000);
  if (!rootCheck.ok) {
    throw new Error(`Static server root check failed: ${rootCheck.error}`);
  }

  return {
    runId,
    port,
    tempDir,
    statePath,
    stdoutPath,
    stderrPath,
    pid: child.pid,
    child,
    markExpectedShutdown() {
      expectedShutdown = true;
    },
    async assertHealthy(contextLabel = 'health-check') {
      const root = await httpGetRoot(port, 3000);
      if (child.exitCode !== null || exitInfo) {
        const stderr = existsSync(stderrPath) ? readFileSync(stderrPath, 'utf8') : '';
        throw new Error(
          `[${contextLabel}] static server exited unexpectedly pid=${child.pid} code=${String(exitInfo?.code ?? child.exitCode)} signal=${String(exitInfo?.signal ?? null)} stderr=${stderr}`,
        );
      }
      if (!(await isPortOpen(port))) {
        const stderr = existsSync(stderrPath) ? readFileSync(stderrPath, 'utf8') : '';
        throw new Error(`[${contextLabel}] static server port ${port} is closed pid=${child.pid} stderr=${stderr}`);
      }
      if (!root.ok || root.statusCode >= 500) {
        const stderr = existsSync(stderrPath) ? readFileSync(stderrPath, 'utf8') : '';
        throw new Error(`[${contextLabel}] static server root unavailable pid=${child.pid} root=${JSON.stringify(root)} stderr=${stderr}`);
      }
    },
    bindPlaywrightChild(playwrightChild) {
      child.once('exit', () => {
        if (expectedShutdown) return;
        if (playwrightChild && !playwrightChild.killed) {
          try {
            playwrightChild.kill('SIGTERM');
          } catch {
            // ignore
          }
        }
      });
    },
    async stop({ preserveLogsOnFailure = true, successful = false } = {}) {
      expectedShutdown = true;
      try {
        if (!child.killed && child.exitCode === null) {
          child.kill('SIGTERM');
        }
      } catch {
        // ignore
      }
      const released = await waitForPortReleased(port, 15000);
      if (!released && child.exitCode === null) {
        try {
          child.kill();
        } catch {
          // ignore
        }
        await waitForPortReleased(port, 15000);
      }
      rmSync(statePath, { force: true });
      if (successful && !preserveLogsOnFailure) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}
