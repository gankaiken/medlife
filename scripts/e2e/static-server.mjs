import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function safeJoin(base, target) {
  const normalized = normalize(target).replace(/^(\.\.[/\\])+/, '');
  return join(base, normalized);
}

function parseArgs(argv) {
  const dirArgIndex = argv.indexOf('--dir');
  const portArgIndex = argv.indexOf('--port');
  const rootDir = resolve(dirArgIndex >= 0 ? argv[dirArgIndex + 1] : 'dist');
  const port = Number(portArgIndex >= 0 ? argv[portArgIndex + 1] : 4173);

  return { rootDir, port };
}

export async function startStaticServer({
  rootDir,
  port,
  logger = console,
} = {}) {
  const sockets = new Set();
  const resolvedRootDir = resolve(rootDir ?? 'dist');
  const resolvedPort = Number(port ?? 4173);
  let shuttingDown = false;
  let shutdownPromise = null;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      let filePath = safeJoin(resolvedRootDir, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      let payload;

      try {
        payload = await readFile(filePath);
      } catch {
        filePath = join(resolvedRootDir, 'index.html');
        payload = await readFile(filePath);
      }

      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, {
        'content-type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(payload);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error instanceof Error ? error.message : String(error));
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  async function listen() {
    await new Promise((resolveStart, rejectStart) => {
      const onError = (error) => {
        server.off('listening', onListening);
        rejectStart(error);
      };

      const onListening = () => {
        server.off('error', onError);
        resolveStart();
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(resolvedPort, '127.0.0.1');
    });
  }

  async function shutdown(reason = 'shutdown', exitCode = 0) {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;

    if (typeof logger.info === 'function') {
      logger.info(`[serve-static] shutdown requested: ${reason}`);
    }

    shutdownPromise = new Promise((resolveShutdown) => {
      const forceTimer = setTimeout(() => {
        for (const socket of sockets) {
          socket.destroy();
        }
      }, 500);
      forceTimer.unref();

      if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }

      server.close(() => {
        clearTimeout(forceTimer);
        resolveShutdown(exitCode);
      });
    });

    return shutdownPromise;
  }

  await listen();

  return {
    port: resolvedPort,
    rootDir: resolvedRootDir,
    server,
    sockets,
    get shuttingDown() {
      return shuttingDown;
    },
    shutdown,
  };
}

export async function runStaticServerCli(argv = process.argv.slice(2), logger = console) {
  const { rootDir, port } = parseArgs(argv);
  let lifecycle;
  const parentPid = typeof process.ppid === 'number' ? process.ppid : null;
  let parentWatchdog = null;

  function exitAfterShutdown(code) {
    queueMicrotask(() => {
      process.exit(code);
    });
  }

  try {
    lifecycle = await startStaticServer({ rootDir, port, logger });
    process.stdout.write(`Static server running at http://127.0.0.1:${lifecycle.port}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[serve-static] startup failed: ${message}\n`);
    process.exit(1);
  }

  async function shutdownFrom(signal, exitCode = 0) {
    try {
      const code = await lifecycle.shutdown(signal, exitCode);
      if (parentWatchdog) {
        clearInterval(parentWatchdog);
        parentWatchdog = null;
      }
      exitAfterShutdown(code);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[serve-static] shutdown failed: ${message}\n`);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => {
    void shutdownFrom('SIGINT', 0);
  });

  process.on('SIGTERM', () => {
    void shutdownFrom('SIGTERM', 0);
  });

  process.on('SIGHUP', () => {
    void shutdownFrom('SIGHUP', 0);
  });

  process.on('uncaughtException', (error) => {
    process.stderr.write(`[serve-static] uncaughtException: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    void shutdownFrom('uncaughtException', 1);
  });

  process.on('unhandledRejection', (error) => {
    process.stderr.write(`[serve-static] unhandledRejection: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    void shutdownFrom('unhandledRejection', 1);
  });

  if (parentPid && parentPid > 1) {
    parentWatchdog = setInterval(() => {
      try {
        process.kill(parentPid, 0);
      } catch {
        void shutdownFrom('parent-exit', 0);
      }
    }, 250);
    parentWatchdog.unref?.();
  }

  if (process.env.MEDLIFE_DISABLE_STDIN_SHUTDOWN !== '1' && process.stdin && !process.stdin.destroyed) {
    process.stdin.resume();
    process.stdin.on('end', () => {
      void shutdownFrom('stdin-end', 0);
    });
    process.stdin.on('close', () => {
      void shutdownFrom('stdin-close', 0);
    });
  }
}
