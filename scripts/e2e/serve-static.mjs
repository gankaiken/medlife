import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const dirArgIndex = args.indexOf('--dir');
const portArgIndex = args.indexOf('--port');
const rootDir = resolve(dirArgIndex >= 0 ? args[dirArgIndex + 1] : 'dist');
const port = Number(portArgIndex >= 0 ? args[portArgIndex + 1] : 4173);

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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    let filePath = safeJoin(rootDir, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    let payload;

    try {
      payload = await readFile(filePath);
    } catch {
      filePath = join(rootDir, 'index.html');
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

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Static server running at http://127.0.0.1:${port}\n`);
});
