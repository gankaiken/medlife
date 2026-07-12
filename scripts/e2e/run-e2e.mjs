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

  const forwardSignal = (signal) => {
    if (activeChild && !activeChild.killed) {
      activeChild.kill(signal);
    }
  };
  process.once('SIGINT', forwardSignal);
  process.once('SIGTERM', forwardSignal);

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

  const frontend = await startManagedStaticServer({ label: 'mocked-suite', port: 4173, rootDir: 'dist' });
  let exitCode = 1;
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
    await frontend.stop({ preserveLogsOnFailure: false, successful: exitCode === 0 });
  }

  const portReleased = await waitForPortReleased(4173, 5000);
  if (!portReleased) {
    process.stderr.write('[e2e] Port 4173 was not released after runner cleanup.\n');
    process.exit(1);
  }
  process.exit(exitCode);
}

void main().catch((error) => {
  process.stderr.write(`[e2e] runner failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
