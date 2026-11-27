import http from 'node:http';
import { config, assertConfig } from './config.js';
import { connectDb, disconnectDb, dbInfo } from './db.js';
import { createApp } from './app.js';
import { initKv, closeKv, kvInfo } from './services/kv.js';
import { initSearch, searchInfo, reindexAll } from './services/search/index.js';
import { sweepExpired } from './services/orders.js';
import { provider } from './services/payments/index.js';
import { User } from './models/index.js';
import { log } from './utils/log.js';

async function main() {
  assertConfig();
  await connectDb();
  await initKv();
  await initSearch();

  if (config.autoSeed && (await User.estimatedDocumentCount()) === 0) {
    log.info('Empty database: loading the demo marketplace (set AUTO_SEED=false to skip)...');
    const { runSeed } = await import('./seed/seed.js');
    await runSeed();
  } else if (searchInfo.driver === 'elasticsearch') {
    // Keep the index honest after restarts, schema changes or a fresh cluster.
    reindexAll().then((r) => log.info(`Search index rebuilt (${r.indexed} products)`)).catch((err) => log.warn(`Reindex failed: ${err.message}`));
  }

  const server = http.createServer(createApp());
  server.listen(config.port, () => {
    log.info(`Awning API on ${config.publicUrl}  [db: ${dbInfo.mode} | cache: ${kvInfo.driver} | search: ${searchInfo.driver} | storage: ${config.storageDriver} | payments: ${provider()}]`);
    if (!config.isProd) log.info(`Open the app at ${config.clientUrl}`);
  });

  // Unpaid orders hold stock for 30 minutes; release what was abandoned.
  const sweeper = setInterval(() => sweepExpired().catch((err) => log.warn(`Sweep failed: ${err.message}`)), 5 * 60 * 1000);
  sweeper.unref();

  const shutdown = async (signal) => {
    log.info(`${signal} received, shutting down...`);
    server.close();
    await closeKv();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error(err.message || err);
  process.exit(1);
});
