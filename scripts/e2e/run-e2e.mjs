import { spawn } from 'node:child_process';
import net from 'node:net';
import { resolve } from 'node:path';

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
  const args = rawArgs.filter((arg) => arg !== '--with-build');

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

  const exitCode = await runNodeProcess([
    resolve('node_modules/@playwright/test/cli.js'),
    'test',
    ...args,
  ]);

  const portReleased = await waitForPortReleased(4173, 5000);
  if (!portReleased) {
    process.stderr.write('[e2e] Port 4173 was not released after Playwright exited.\n');
    process.exit(1);
  }

  process.exit(exitCode);
}

void main().catch((error) => {
  process.stderr.write(`[e2e] runner failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
