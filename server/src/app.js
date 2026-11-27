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
import { TransportManager } from './transports/manager.js';
import { NotifyService } from './services/notify.js';

const defaultLogger = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), ...a),
  error: (...a) => console.error(new Date().toISOString(), ...a),
};

/** 组装并启动平台全部服务 */
export async function startPlatform(config, logger = defaultLogger) {
  const db = openDatabase(config.dbFile);
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  const ingest = new IngestService(db, config, bus);
  const query = new QueryService(db, config);
  const stats = new StatsService(db, config, query);

  const settings = new SettingsStore(db, config);
  const transports = new TransportManager({ config, ingest, logger });
  await transports.startAll();
  const notify = new NotifyService({ config, query, bus, logger });
  const photoDir = config.photoDir || (config.dbFile === ':memory:' ? path.join(os.tmpdir(), `iot-photos-${process.pid}`) : path.join(path.dirname(config.dbFile), 'photos'));

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use('/api', createApi({ config, ingest, query, stats, bus, transports, settings, notify, photoDir }));
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  } else {
    app.get('/', (req, res) => res.type('text/plain').send('前端尚未构建：请在 web 目录执行 npm run build，或使用 npm run dev 启动开发服务器。'));
  }

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
    db, bus, ingest, query, stats, server, settings, transports, notify,
    async close() {
      clearInterval(timer);
      server.closeAllConnections?.();
      await new Promise((r) => server.close(() => r()));
      await transports.stopAll();
      db.close();
    },
  };
}
