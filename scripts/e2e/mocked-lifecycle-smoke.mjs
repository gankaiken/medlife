import { reservePort } from './mocked-lifecycle-util.mjs';
import { startManagedStaticServer } from './server-lifecycle.mjs';

let frontend = null;
let shutdownPromise = null;

async function shutdown(reason, exitCode = 0) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    if (frontend) {
      await frontend.stop({ preserveLogsOnFailure: false, successful: true });
    }
    return exitCode;
  })();
  return shutdownPromise;
}

process.once('SIGINT', () => {
  void shutdown('SIGINT', 130).then((code) => process.exit(code));
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM', 143).then((code) => process.exit(code));
});
process.once('uncaughtException', (error) => {
  process.stderr.write(`[mocked-lifecycle-smoke] uncaughtException: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  void shutdown('uncaughtException', 1).then((code) => process.exit(code));
});
process.once('unhandledRejection', (error) => {
  process.stderr.write(`[mocked-lifecycle-smoke] unhandledRejection: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  void shutdown('unhandledRejection', 1).then((code) => process.exit(code));
});

const port = await reservePort();
frontend = await startManagedStaticServer({ label: 'mocked-lifecycle-smoke', port, rootDir: 'dist' });
process.stdout.write(`SMOKE_PORT=${port}\n`);
await new Promise(() => {});
