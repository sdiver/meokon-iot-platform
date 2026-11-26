import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import express from 'express';
import { openDatabase } from './db/index.js';
import { IngestService } from './services/ingest.js';
import { QueryService } from './services/query.js';
import { StatsService } from './services/stats.js';
import { createApi } from './api/routes.js';
import { startTcpServer } from './transports/tcp.js';
import { startUdpServer } from './transports/udp.js';
import { startEmbeddedBroker, startMqttClient } from './transports/mqtt.js';

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

  const closers = [];
  const status = {};

  if (config.tcpEnabled) {
    const t = startTcpServer({ port: config.tcpPort, ingest, logger, idleCloseMs: config.tcpIdleCloseMs });
    closers.push(t.close);
    status.tcp = { enabled: true, port: config.tcpPort };
  } else status.tcp = { enabled: false };

  if (config.udpEnabled) {
    const u = startUdpServer({ port: config.udpPort, ingest, logger });
    closers.push(u.close);
    status.udp = { enabled: true, port: config.udpPort };
  } else status.udp = { enabled: false };

  let mqttUrl = config.mqttUrl;
  if (config.mqttBrokerPort) {
    const b = await startEmbeddedBroker({ port: config.mqttBrokerPort, logger, username: config.mqttUsername, password: config.mqttPassword });
    closers.push(b.close);
    status.mqttBroker = { enabled: true, port: config.mqttBrokerPort };
    if (!mqttUrl) mqttUrl = `mqtt://127.0.0.1:${config.mqttBrokerPort}`;
  } else status.mqttBroker = { enabled: false };

  let mqttState = null;
  if (mqttUrl) {
    const m = startMqttClient({
      url: mqttUrl, username: config.mqttUsername, password: config.mqttPassword,
      uplinkTopic: config.mqttUplinkTopic, downlinkPrefix: config.mqttDownlinkPrefix, ingest, logger,
    });
    mqttState = m.state;
    closers.unshift(m.close);
  }

  const transports = () => ({
    ...status,
    mqtt: mqttState
      ? { enabled: true, url: mqttState.url.replace(/\/\/[^@]*@/, '//***@'), connected: mqttState.connected, received: mqttState.received, uplinkTopic: config.mqttUplinkTopic, downlinkPrefix: config.mqttDownlinkPrefix }
      : { enabled: false },
    http: { enabled: true, port: config.httpPort, endpoints: ['/api/push/raw', '/api/push/aep', '/api/push/onenet'] },
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use('/api', createApi({ config, ingest, query, stats, bus, transports }));
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
    db, bus, ingest, query, stats, server,
    async close() {
      clearInterval(timer);
      server.closeAllConnections?.();
      await new Promise((r) => server.close(() => r()));
      for (const c of closers) await c();
      db.close();
    },
  };
}
