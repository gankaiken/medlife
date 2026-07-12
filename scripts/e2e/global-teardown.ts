import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';

const STATE_PATH = resolve('.tmp', 'playwright', 'server-state.json');

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

async function waitForPortReleased(port: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Port ${port} was not released by Playwright teardown`);
}

export default async function globalTeardown() {
  if (!existsSync(STATE_PATH)) return;
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as { pid?: number; port?: number };

  if (typeof state.pid === 'number') {
    try {
      process.kill(state.pid, 'SIGTERM');
    } catch {
      // already exited
    }
  }

  if (typeof state.port === 'number') {
    try {
      await waitForPortReleased(state.port, 10000);
    } catch {
      if (typeof state.pid === 'number') {
        try {
          process.kill(state.pid);
        } catch {
          // already exited
        }
      }
      await waitForPortReleased(state.port, 15000);
    }
  }

  rmSync(STATE_PATH, { force: true });
}
