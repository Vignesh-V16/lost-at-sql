import http from 'node:http';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { initSockets } from './sockets/index.js';
import { datasetService } from './services/datasetService.js';
import { eventService } from './services/eventService.js';
import { sqlService } from './services/sqlService.js';
import { leaderboardService } from './services/leaderboardService.js';
import { ensureBaseline } from './scripts/seed.js';
import { logger } from './utils/logger.js';
import { lanUrls } from './utils/lan.js';

const banner = `
  ██╗      ██████╗ ███████╗████████╗     █████╗ ████████╗    ███████╗ ██████╗ ██╗
  ██║     ██╔═══██╗██╔════╝╚══██╔══╝    ██╔══██╗╚══██╔══╝    ██╔════╝██╔═══██╗██║
  ██║     ██║   ██║███████╗   ██║       ███████║   ██║       ███████╗██║   ██║██║
  ██║     ██║   ██║╚════██║   ██║       ██╔══██║   ██║       ╚════██║██║▄▄ ██║██║
  ███████╗╚██████╔╝███████║   ██║       ██║  ██║   ██║       ███████║╚██████╔╝███████╗
  ╚══════╝ ╚═════╝ ╚══════╝   ╚═╝       ╚═╝  ╚═╝   ╚═╝       ╚══════╝ ╚══▀▀═╝ ╚══════╝
  SQL Investigation Game Engine // OPERATION: BLACK CIPHER
`;

async function main() {
  // eslint-disable-next-line no-console
  console.log(banner);

  await connectDatabase();
  await ensureBaseline(); // idempotent: creates the event, coordinator, case files… if missing
  await datasetService.initialise();
  // Restart recovery: authoritative state lives in MongoDB; rebuild the derived leaderboard.
  await leaderboardService.recomputeAll().catch((err) => logger.warn('Leaderboard rebuild on boot failed', err.message));

  const app = createApp();
  const server = http.createServer(app);
  initSockets(server);
  eventService.startWatchdog();

  /* 0.0.0.0 explicitly: the room reaches this machine over Ethernet or Wi-Fi,
     not only over loopback. */
  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`LOST AT SQL backend online → http://localhost:${env.PORT}  (env: ${env.NODE_ENV})`);
    const urls = lanUrls(env.PORT);
    if (env.SERVE_CLIENT) {
      logger.info('Hand these out to the room:');
      if (urls.length) {
        for (const u of urls) logger.info(`   ${u.url}   (${u.name}${u.wired ? ', wired' : ''}${u.selfAssigned ? ' — no address from the network yet' : ''})`);
      } else {
        logger.warn('   no network address yet — plug in the cable or join the Wi-Fi, then restart');
      }
    } else {
      logger.info(`Serving the API only. The Vite dev server is the participants' entry point (${urls.map((u) => `http://${u.address}:5173`).join(', ') || 'no LAN address yet'}).`);
    }
    logger.info(`Allowed origins: ${env.clientOrigins.join(', ')}${env.ALLOW_LAN_ORIGINS ? ' + any local-network address' : ''}`);
  });

  const shutdown = async (signal) => {
    logger.warn(`${signal} received — shutting down`);
    eventService.stopWatchdog();
    server.close();
    await sqlService.terminate('shutdown');
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason))));
}

main().catch((err) => {
  logger.error('Fatal start-up error', err);
  process.exit(1);
});
