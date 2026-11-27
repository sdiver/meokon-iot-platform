import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import express from 'express';
import { openDatabase } from './db/index.js';
import { IngestService } from './services/ingest.js';
import { QueryService } from './services/query.js';
import { StatsService } from './services/stats.js';
import { createApi } from './api/routes.js';
import { SettingsStore } from './settings.js';
import { NotifyService } from './services/notify.js';
import { AuthService } from './services/auth.js';

const defaultLogger = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), ...a),
  error: (...a) => console.error(new Date().toISOString(), ...a),
};

/** 不开放设备接入端口时使用的占位接入管理（如 Vercel 等无服务器环境） */
const NO_TRANSPORTS = {
  async startAll() {}, async stopAll() {}, async restart() {},
  status: () => ({
    tcp: { enabled: false, running: false, port: null }, udp: { enabled: false, running: false, port: null },
    mqttBroker: { enabled: false, running: false, port: null }, mqtt: { enabled: false, running: false },
    http: { enabled: true, running: true, endpoints: ['/api/push/raw', '/api/push/aep', '/api/push/onenet'] },
  }),
};

/**
 * 组装平台（不监听 HTTP 端口）。
 * @param {object} opts
 * @param {boolean} [opts.transports=true] 是否启动 TCP / UDP / MQTT 设备接入
 * @param {(ctx) => void} [opts.beforeApi] 在 API 路由前挂载的中间件（如演示环境实时模拟）
 */
export async function createPlatform(config, logger = defaultLogger, opts = {}) {
  const db = openDatabase(config.dbFile);
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  const ingest = new IngestService(db, config, bus);
  const query = new QueryService(db, config);
  const stats = new StatsService(db, config, query);

  const settings = new SettingsStore(db, config);
  let transports = NO_TRANSPORTS;
  if (opts.transports !== false) {
    const { TransportManager } = await import('./transports/manager.js');
    transports = new TransportManager({ config, ingest, logger });
    await transports.startAll();
  }
  const notify = new NotifyService({ config, query, bus, logger });
  const auth = new AuthService(db, config, logger);
  const photoDir = config.photoDir || (config.dbFile === ':memory:' ? path.join(os.tmpdir(), `iot-photos-${process.pid}`) : path.join(path.dirname(config.dbFile), 'photos'));

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  const ctx = { config, db, bus, ingest, query, stats, settings, transports, notify, auth, app, logger };
  if (opts.beforeApi) app.use('/api', opts.beforeApi(ctx));
  app.use('/api', createApi({ config, ingest, query, stats, bus, transports, settings, notify, photoDir, auth }));
  if (opts.serveWeb !== false && fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  } else if (opts.serveWeb !== false) {
    app.get('/', (req, res) => res.type('text/plain').send('前端尚未构建：请在 web 目录执行 npm run build，或使用 npm run dev 启动开发服务器。'));
  }
  return ctx;
}

/** 组装并启动平台全部服务 */
export async function startPlatform(config, logger = defaultLogger, opts = {}) {
  const ctx = await createPlatform(config, logger, opts);
  const { app, query, transports, db } = ctx;

  const server = http.createServer(app);
  await new Promise((r) => server.listen(config.httpPort, r));
  logger.info(`[http] Web/API http://0.0.0.0:${config.httpPort}`);

  // 每 6 小时清理过期数据
  const cleanup = () => {
    try {
      const r = query.cleanup();
      if (r.frames || r.readings) logger.info(`[cleanup] 删除报文 ${r.frames} 条，采集数据 ${r.readings} 条`);
    } catch (e) {
      logger.error('[cleanup]', e);
    }
  };
  cleanup();
  const timer = setInterval(cleanup, 6 * 3600 * 1000);
  timer.unref();

  return {
    ...ctx, server,
    async close() {
      clearInterval(timer);
      server.closeAllConnections?.();
      await new Promise((r) => server.close(() => r()));
      await transports.stopAll();
      db.close();
    },
  };
}
