import { loadConfig } from './config.js';
import { createFetcher } from './fetcher.js';
import { createApp } from './routes.js';
import { createScheduler } from './scheduler.js';
import { openStore } from './storage.js';

const config = loadConfig();
const store = openStore(config.dbPath);
const fetcher = createFetcher(config);
const scheduler = createScheduler({ config, fetcher, store });
const app = createApp({ store, scheduler });

function formatInterval(ms) {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  return `${ms}ms`;
}

const server = app.listen(config.port, () => {
  console.log(`listening on :${config.port}`);
  console.log(`定时抓取: 每 ${formatInterval(config.fetchIntervalMs)}（默认 10m）`);
  console.log('抓取成功后当天不再重复抓取（daily / weekly / monthly 各自独立）');
  scheduler.start();
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${config.port} 已被占用。请先结束旧进程，或换端口启动：`);
    console.error(`  $env:PORT=8081; npm start`);
    process.exit(1);
  }
  throw error;
});

function shutdown() {
  console.log('shutting down...');
  scheduler.stop();
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
