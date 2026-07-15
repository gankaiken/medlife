import net from 'node:net';

export function reservePort() {
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
