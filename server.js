import { createGuildHttpServer } from './lib/roster/src/guild-http.js';

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
const server = createGuildHttpServer();
server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Forever Guild Builder listening on port ${port}\n`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  });
}