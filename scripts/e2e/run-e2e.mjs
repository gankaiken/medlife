import { spawn } from 'node:child_process';
import net from 'node:net';
import { resolve } from 'node:path';
import { startManagedStaticServer } from './server-lifecycle.mjs';

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      resolve(false);
    });
  });
}

async function waitForPortReleased(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !(await isPortOpen(port));
}

let activeChild = null;
let shuttingDown = false;
let shutdownPromise = null;

function normalizeExitCode(code, signal) {
  if (typeof code === 'number') return code;
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  return 1;
}

function runProcess(command, args) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false,
    });
    activeChild = child;

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (activeChild === child) {
        activeChild = null;
      }
      resolveExit(normalizeExitCode(code, signal));
    });
  });
}

function runNodeProcess(args) {
  return runProcess(process.execPath, args);
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
  const shouldBuild = rawArgs.includes('--with-build');
  const forceFailureIndex = rawArgs.indexOf('--force-failure');
  const forcedFailureMarker =
    forceFailureIndex >= 0 && forceFailureIndex + 1 < rawArgs.length ? rawArgs[forceFailureIndex + 1] : null;
  const args = rawArgs.filter((arg, index) => {
    if (arg === '--with-build') return false;
    if (forceFailureIndex >= 0 && (index === forceFailureIndex || index === forceFailureIndex + 1)) return false;
    return true;
  });

  let frontend = null;
  let exitCode = 1;
  const frontendPort = await reservePort();
  const appUrl = `http://127.0.0.1:${frontendPort}`;

  const shutdown = async (reason, requestedExitCode = exitCode) => {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownPromise = (async () => {
      if (activeChild && !activeChild.killed) {
        try {
          activeChild.kill('SIGTERM');
        } catch {
          // ignore
        }
      }
      if (frontend) {
        await frontend.stop({ preserveLogsOnFailure: true, successful: requestedExitCode === 0 });
      }
      const released = await waitForPortReleased(frontendPort, 15000);
      if (!released) {
        process.stderr.write(`[e2e] Frontend port ${frontendPort} was not released during ${reason}.\n`);
        return 1;
      }
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
    process.stderr.write(`[e2e] uncaughtException: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    void shutdown('uncaughtException', 1).then((code) => process.exit(code));
  });
  process.once('unhandledRejection', (error) => {
    process.stderr.write(`[e2e] unhandledRejection: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    void shutdown('unhandledRejection', 1).then((code) => process.exit(code));
  });

  if (shouldBuild) {
    const tscExit = await runNodeProcess([
      resolve('node_modules/typescript/bin/tsc'),
      '-b',
      '--pretty',
      'false',
    ]);
    if (tscExit !== 0) process.exit(tscExit);

    const viteExit = await runNodeProcess([
      resolve('node_modules/vite/bin/vite.js'),
      'build',
    ]);
    if (viteExit !== 0) process.exit(viteExit);
  }

  frontend = await startManagedStaticServer({ label: 'mocked-suite', port: frontendPort, rootDir: 'dist' });
  try {
    await frontend.assertHealthy('before-playwright');
    exitCode = await new Promise((resolveExit, reject) => {
      const child = spawn(process.execPath, [
        resolve('node_modules/@playwright/test/cli.js'),
        'test',
        ...args,
      ], {
        cwd: process.cwd(),
        stdio: 'inherit',
        shell: false,
        env: {
          ...process.env,
          PLAYWRIGHT_BASE_URL: appUrl,
          ...(forcedFailureMarker ? { MEDLIFE_E2E_FORCE_FAILURE: forcedFailureMarker } : {}),
        },
      });
      activeChild = child;
      frontend.bindPlaywrightChild(child);
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (activeChild === child) {
          activeChild = null;
        }
        resolveExit(normalizeExitCode(code, signal));
      });
    });
    await frontend.assertHealthy('after-playwright');
  } finally {
    if (!shuttingDown) {
      exitCode = await shutdown('normal-exit', exitCode);
    }
  }

  process.exit(exitCode);
}

void main().catch((error) => {
  process.stderr.write(`[e2e] runner failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
