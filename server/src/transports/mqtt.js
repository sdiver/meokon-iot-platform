import net from 'node:net';
import mqtt from 'mqtt';
import { Aedes } from 'aedes';
import { listenAsync } from './listen.js';

/** MQTT 负载为十六进制字符串；同时兼容直接发送二进制的设备 */
export function payloadToBuffer(payload) {
  const text = payload.toString('latin1').trim();
  if (/^[0-9a-fA-F\s]+$/.test(text) && text.replace(/\s+/g, '').length % 2 === 0) {
    return Buffer.from(text.replace(/\s+/g, ''), 'hex');
  }
  return Buffer.from(payload);
}

/** 内置 MQTT Broker（开发、小规模部署可直接让设备连接平台） */
export async function startEmbeddedBroker({ port, logger, username, password }) {
  const broker = await Aedes.createBroker();
  if (username) {
    broker.authenticate = (client, u, p, cb) => {
      const ok = u === username && (p?.toString() ?? '') === (password ?? '');
      if (!ok) logger.warn(`[mqtt] 设备 ${client?.id} 认证失败`);
      cb(null, ok);
    };
  }
  const sockets = new Set();
  const server = net.createServer((s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
    broker.handle(s);
  });
  try {
    await listenAsync(server, port);
  } catch (e) {
    await new Promise((r) => broker.close(() => r()));
    throw e;
  }
  logger.info(`[mqtt] 内置 Broker 端口 ${port}`);
  return {
    broker,
    close: () => new Promise((r) => {
      for (const s of sockets) s.destroy();
      server.close();
      broker.close(() => r());
    }),
  };
}

/**
 * 1.2 MQTT：订阅 GIOT-GW/UL/#，负载为十六进制字符串；
 * 有下行指令时发布到 GIOT-GW/DL/<设备ID>，否则无需应答。
 */
export function startMqttClient({ url, username, password, uplinkTopic, downlinkPrefix, ingest, logger }) {
  const client = mqtt.connect(url, {
    username: username || undefined,
    password: password || undefined,
    clientId: `meokon-platform-${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 3000,
  });
  const state = { connected: false, url, received: 0, error: null };
  client.on('connect', () => {
    state.connected = true;
    state.error = null;
    client.subscribe(uplinkTopic, { qos: 1 }, (err) => {
      if (err) logger.error('[mqtt] 订阅失败', err);
      else logger.info(`[mqtt] 已连接 ${url}，订阅 ${uplinkTopic}`);
    });
  });
  client.on('close', () => { state.connected = false; });
  client.on('error', (e) => {
    state.error = e.message;
    logger.warn(`[mqtt] ${e.message}`);
  });
  client.on('message', (topic, payload) => {
    state.received++;
    const topicId = topic.split('/').pop();
    let buf;
    try {
      buf = payloadToBuffer(payload);
    } catch (e) {
      logger.warn(`[mqtt] ${topic} 负载无法解析`);
      return;
    }
    try {
      const { decoded, reply } = ingest.handle(buf, { transport: 'mqtt', remote: topic, replyMode: 'command' });
      if (!decoded.ok) logger.warn(`[mqtt] ${topic} 无效帧: ${decoded.errors.join('; ')}`);
      if (reply) {
        const id = decoded.deviceId || topicId;
        client.publish(`${downlinkPrefix}${id}`, reply.toString('hex'), { qos: 1 });
        ingest.logDownlink(reply, { transport: 'mqtt', remote: `${downlinkPrefix}${id}` });
      }
    } catch (e) {
      logger.error(`[mqtt] ${topic} 处理失败`, e);
    }
  });
  return { client, state, close: () => new Promise((r) => client.end(true, {}, () => r())) };
}
