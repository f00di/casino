import { createApplication } from './app.js';
import { loadConfig } from './config.js';
import { MemoryRoomRepository, PostgresRoomRepository } from './repository.js';

const config = loadConfig();
const repository = config.databaseUrl === undefined ? new MemoryRoomRepository() : new PostgresRoomRepository(config.databaseUrl);
const application = createApplication(config, repository);
const recovered = await application.manager.recover();
application.httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', message: 'server_started', port: config.port, recoveredRooms: recovered }));
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true; application.setStopping(true);
  console.log(JSON.stringify({ level: 'info', message: 'shutdown_started', signal }));
  application.io.disconnectSockets(true);
  void application.io.close();
  const forceTimer = setTimeout(() => process.exit(1), 10_000); forceTimer.unref();
  application.httpServer.close(() => {
    void repository.close().then(() => {
      clearTimeout(forceTimer);
      console.log(JSON.stringify({ level: 'info', message: 'shutdown_complete' }));
      process.exit(0);
    }).catch((error: unknown) => {
      console.error(JSON.stringify({ level: 'error', message: 'shutdown_failed', error: error instanceof Error ? error.message : 'unknown' }));
      process.exit(1);
    });
  });
}
process.on('SIGTERM', () => { shutdown('SIGTERM'); });
process.on('SIGINT', () => { shutdown('SIGINT'); });
