import { execFileSync, spawn } from 'node:child_process';
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

function safeLabel(label) {
  return String(label).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
}

function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function removeOwnedActiveState(activeStatePath, { runId, pid, port }) {
  if (!existsSync(activeStatePath)) return;
  const activeState = readJsonIfPresent(activeStatePath);
  if (!activeState) {
    rmSync(activeStatePath, { force: true });
    return;
  }
  const sameRun = activeState.runId === runId;
  const sameOwner = activeState.pid === pid && activeState.port === port;
  if (sameRun || sameOwner) {
    rmSync(activeStatePath, { force: true });
  }
}

function findListeningPid(port) {
  if (process.platform !== 'win32') return null;
  try {
    const output = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
    const lines = output.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
      if (match && Number(match[1]) === port) {
        return Number(match[2]);
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function cleanupStaleOwner(activeStatePath, port) {
  const stale = readJsonIfPresent(activeStatePath);
  if (!stale || typeof stale.pid !== 'number' || typeof stale.port !== 'number') return;
  if (stale.port !== port) {
    if (typeof stale.tempDir === 'string' && stale.tempDir) {
      rmSync(stale.tempDir, { recursive: true, force: true });
    }
    rmSync(activeStatePath, { force: true });
    return;
  }
  const listeningPid = findListeningPid(port);
  if (listeningPid === null) {
    if (typeof stale.tempDir === 'string' && stale.tempDir) {
      rmSync(stale.tempDir, { recursive: true, force: true });
    }
    rmSync(activeStatePath, { force: true });
    return;
  }
  if (listeningPid !== stale.pid) {
    throw new Error(
      `Port ${port} is already occupied by pid=${listeningPid} and does not match stale owned pid=${stale.pid}. ` +
        `Active state path=${activeStatePath}`,
    );
  }
  try {
    process.kill(stale.pid, 'SIGTERM');
  } catch {
    // already exiting
  }
  const released = await waitForPortReleased(port, 15000);
  if (!released) {
    try {
      process.kill(stale.pid);
    } catch {
      // already exiting
    }
    const hardReleased = await waitForPortReleased(port, 15000);
    if (!hardReleased) {
      throw new Error(`Port ${port} remained occupied by stale owned pid=${stale.pid} after cleanup attempt.`);
    }
  }
  if (typeof stale.tempDir === 'string' && stale.tempDir) {
    rmSync(stale.tempDir, { recursive: true, force: true });
  }
  rmSync(activeStatePath, { force: true });
}

export async function startManagedStaticServer({ label, port = 4173, rootDir = 'dist', extraEnv = {} }) {
  const runId = makeRunId(label);
  const normalizedLabel = safeLabel(label);
  const tempDir = resolve('.tmp', 'e2e', runId);
  const activeStatePath = resolve('.tmp', 'e2e', `${normalizedLabel}.active.json`);
  const statePath = resolve(tempDir, 'server-state.json');
  const stdoutPath = resolve(tempDir, 'server.stdout.log');
  const stderrPath = resolve(tempDir, 'server.stderr.log');
  await cleanupStaleOwner(activeStatePath, port);
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
        MEDLIFE_MANAGED_RUN_ID: runId,
        MEDLIFE_MANAGED_PORT: String(port),
        MEDLIFE_MANAGED_STATE_PATH: statePath,
        MEDLIFE_MANAGED_ACTIVE_STATE_PATH: activeStatePath,
        MEDLIFE_MANAGED_TEMP_DIR: tempDir,
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
      activeStatePath,
    },
    null,
    2,
  ),
  'utf8',
  );
  writeFileSync(
    activeStatePath,
    JSON.stringify(
      {
        runId,
        pid: child.pid,
        parentPid: process.pid,
        port,
        statePath,
        stdoutPath,
        stderrPath,
        tempDir,
        startedAt: new Date().toISOString(),
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
    try {
      appendFileSync(
        stderrPath,
        `\n[managed-static-server] exit code=${String(code)} signal=${String(signal)} at=${exitInfo.at}\n`,
        'utf8',
      );
    } catch {
      // The caller may already have removed the temp directory during shutdown.
    }
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
    activeStatePath,
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
      removeOwnedActiveState(activeStatePath, { runId, pid: child.pid, port });
      rmSync(activeStatePath, { force: true });
      if (successful && !preserveLogsOnFailure) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}
