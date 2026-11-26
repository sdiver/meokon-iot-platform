import express from 'express';
import { decodeFrame, hexToBuffer } from '../protocol/decoder.js';
import { buildDownlink, READ_ALL_CONFIG } from '../protocol/encoder.js';
import { listDeviceTypes } from '../protocol/deviceTypes.js';

const wrap = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.then === 'function') r.catch(next);
  } catch (e) {
    next(e);
  }
};

/** 从第三方推送中提取报文：支持十六进制和 base64 */
export function extractPayload(v) {
  if (v == null) return null;
  if (typeof v === 'object' && !Array.isArray(v)) {
    for (const k of ['APPdata', 'appData', 'value', 'data', 'payload', 'hex', 'raw']) {
      const r = extractPayload(v[k]);
      if (r) return r;
    }
    return null;
  }
  const s = String(v).trim();
  if (/^[0-9a-fA-F\s]+$/.test(s) && s.replace(/\s+/g, '').length % 2 === 0) return hexToBuffer(s);
  if (/^[A-Za-z0-9+/=\s]+$/.test(s)) {
    const b = Buffer.from(s, 'base64');
    if (b.length >= 2 && b[0] === 0xa5 && b[1] === 0x5a) return b;
  }
  return null;
}

export function createApi({ config, ingest, query, stats, bus, transports }) {
  const api = express.Router();
  api.use(express.json({ limit: '2mb' }));

  // ---------- 鉴权（可选） ----------
  api.use((req, res, next) => {
    if (!config.authToken || req.path.startsWith('/push/') || req.path === '/health') return next();
    const h = req.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
    if (token === config.authToken) return next();
    res.status(401).json({ error: '未授权' });
  });

  api.get('/health', (req, res) => res.json({ ok: true, time: Date.now() }));

  api.get('/system', (req, res) => {
    res.json({
      version: '1.0.0',
      protocol: 'MEOKON 智能无线终端通讯协议 V3.3',
      authRequired: Boolean(config.authToken),
      tzOffsetHours: config.tzOffsetHours,
      offlineMinSec: config.offlineMinSec,
      offlineFactor: config.offlineFactor,
      transports: transports(),
    });
  });

  // ---------- 字典 ----------
  api.get('/device-types', (req, res) => res.json(listDeviceTypes()));

  // ---------- 设备 ----------
  api.get('/devices', wrap((req, res) => res.json(query.listDevices(req.query))));
  api.get('/device-groups', wrap((req, res) => res.json(query.groups())));
  api.get('/devices/:id', wrap((req, res) => {
    const d = query.getDevice(req.params.id);
    if (!d) return res.status(404).json({ error: '设备不存在' });
    res.json(d);
  }));
  api.put('/devices/:id', wrap((req, res) => {
    const d = query.updateDevice(req.params.id, req.body || {});
    if (!d) return res.status(404).json({ error: '设备不存在' });
    res.json(d);
  }));
  api.delete('/devices/:id', wrap((req, res) => {
    query.deleteDevice(req.params.id, req.query.purge === '1');
    res.json({ ok: true });
  }));
  api.get('/devices/:id/readings', wrap((req, res) => res.json(query.readings(req.params.id, req.query))));
  api.get('/devices/:id/series', wrap((req, res) => res.json(query.series(req.params.id, req.query))));
  api.get('/devices/:id/stats', wrap((req, res) => {
    const s = query.deviceStats(req.params.id, req.query);
    if (!s) return res.status(404).json({ error: '设备不存在' });
    res.json(s);
  }));
  api.get('/devices/:id/export.csv', wrap((req, res) => {
    const csv = query.exportCsv(req.params.id, req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(req.params.id)}.csv"`);
    res.send(csv);
  }));

  // ---------- 下行命令 ----------
  api.get('/devices/:id/commands', wrap((req, res) => res.json(query.commands(req.params.id))));
  api.post('/devices/:id/commands', wrap((req, res) => {
    const params = req.body?.preset === 'readAll' ? READ_ALL_CONFIG : req.body?.params;
    const id = query.addCommand(req.params.id, params, req.body?.note);
    bus.emit('command', { deviceId: req.params.id, commandId: id, status: 'pending' });
    res.json({ id, preview: buildDownlink(req.params.id, { params }).toString('hex') });
  }));
  api.delete('/commands/:id', wrap((req, res) => {
    query.cancelCommand(Number(req.params.id));
    res.json({ ok: true });
  }));

  // ---------- 原始报文 ----------
  api.get('/frames', wrap((req, res) => res.json(query.frames(req.query))));

  // ---------- 报警 ----------
  api.get('/alarms', wrap((req, res) => res.json(query.alarms(req.query))));
  api.post('/alarms/:id/ack', wrap((req, res) => {
    query.ackAlarm(Number(req.params.id), req.body?.note);
    res.json({ ok: true });
  }));
  api.post('/alarms/ack-all', wrap((req, res) => {
    query.ackAll(req.body?.deviceId);
    res.json({ ok: true });
  }));

  // ---------- 统计 ----------
  api.get('/stats/overview', wrap((req, res) => res.json(stats.overview())));
  api.get('/stats/trend', wrap((req, res) => res.json(stats.trend(req.query.days))));
  api.get('/stats/hourly', wrap((req, res) => res.json(stats.hourly())));
  api.get('/stats/alarms', wrap((req, res) => res.json(stats.alarmStats(req.query))));
  api.get('/stats/types', wrap((req, res) => res.json(stats.typeStats())));
  api.get('/stats/activity', wrap((req, res) => res.json(stats.activity(req.query))));

  // ---------- 报文工具 ----------
  api.post('/tools/decode', wrap((req, res) => {
    let buf;
    try {
      buf = hexToBuffer(req.body?.hex || '');
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    res.json(decodeFrame(buf));
  }));
  api.post('/tools/downlink', wrap((req, res) => {
    const { deviceId, params, utc } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: '缺少设备编号' });
    res.json({ hex: buildDownlink(deviceId, { params: params || undefined, utc: utc ? Number(utc) : undefined }).toString('hex') });
  }));

  // ---------- 第三方平台推送 / HTTP 接入 ----------
  const checkPush = (req, res) => {
    if (config.pushToken && req.query.token !== config.pushToken) {
      res.status(401).json({ error: 'token 无效' });
      return false;
    }
    return true;
  };
  const ingestPush = (buf, transport, remote) => {
    const { decoded } = ingest.handle(buf, { transport, remote, replyMode: 'none' });
    return { ok: decoded.ok, deviceId: decoded.deviceId, errors: decoded.errors, warnings: decoded.warnings };
  };

  /** 通用 HTTP 接入：{ "hex": "a55a..." } 或 { "base64": "..." } */
  api.post('/push/raw', wrap((req, res) => {
    if (!checkPush(req, res)) return;
    const b = req.body || {};
    const buf = b.base64 ? Buffer.from(b.base64, 'base64') : extractPayload(b.hex ?? b);
    if (!buf) return res.status(400).json({ error: '未找到报文' });
    res.json(ingestPush(buf, b.transport || 'http', req.ip));
  }));

  /** 电信 AEP 订阅推送（dataReport，APPdata 为 base64） */
  api.post('/push/aep', wrap((req, res) => {
    if (!checkPush(req, res)) return;
    const b = req.body || {};
    if (b.messageType && b.messageType !== 'dataReport') return res.json({ ok: true, ignored: b.messageType });
    const buf = extractPayload(b.payload ?? b);
    if (!buf) return res.json({ ok: false, error: '未找到报文' });
    res.json(ingestPush(buf, 'aep', b.IMEI || b.imei || b.deviceId || null));
  }));

  /** 移动 OneNET 数据推送：GET 用于 URL 验证（原样返回 msg） */
  api.get('/push/onenet', (req, res) => res.type('text/plain').send(String(req.query.msg ?? 'ok')));
  api.post('/push/onenet', wrap((req, res) => {
    if (!checkPush(req, res)) return;
    let msg = req.body?.msg ?? req.body;
    if (typeof msg === 'string') {
      try { msg = JSON.parse(msg); } catch { /* 原样使用 */ }
    }
    const list = Array.isArray(msg) ? msg : [msg];
    const results = [];
    for (const m of list) {
      const buf = extractPayload(m);
      if (buf) results.push(ingestPush(buf, 'onenet', m?.imei || m?.dev_id || m?.deviceName || null));
    }
    res.json({ ok: true, results });
  }));

  // ---------- 实时推送（SSE） ----------
  api.get('/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const send = (event) => (data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const handlers = { frame: send('frame'), alarm: send('alarm'), command: send('command') };
    for (const [e, h] of Object.entries(handlers)) bus.on(e, h);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      for (const [e, h] of Object.entries(handlers)) bus.off(e, h);
    });
  });

  api.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || '服务器错误' });
  });

  return api;
}
