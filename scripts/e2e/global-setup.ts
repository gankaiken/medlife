import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';

const SERVER_PORT = 4173;
const STATE_DIR = resolve('.tmp', 'playwright');
const STATE_PATH = resolve(STATE_DIR, 'server-state.json');

async function isPortOpen(port: number): Promise<boolean> {
  return await new Promise((resolvePort) => {
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

async function waitForPortOpen(port: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for port ${port} to open`);
}

export default async function globalSetup() {
  mkdirSync(STATE_DIR, { recursive: true });
  if (existsSync(STATE_PATH)) {
    try {
      const stale = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as { pid?: number; port?: number };
      if (typeof stale.pid === 'number') {
        try {
          process.kill(stale.pid);
        } catch {
          // already exited
        }
      }
    } catch {
      // ignore unreadable stale state
    }
    rmSync(STATE_PATH, { force: true });
  }

  const child = spawn(
    process.execPath,
    [resolve('scripts/e2e/serve-static.mjs'), '--dir', 'dist', '--port', String(SERVER_PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MEDLIFE_DISABLE_STDIN_SHUTDOWN: '1',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
    },
  );

  child.once('error', (error) => {
    throw error;
  });

  await waitForPortOpen(SERVER_PORT, 15000);
  writeFileSync(
    STATE_PATH,
    JSON.stringify({
      pid: child.pid,
      port: SERVER_PORT,
      startedAt: Date.now(),
    }),
    'utf8',
  );
}
