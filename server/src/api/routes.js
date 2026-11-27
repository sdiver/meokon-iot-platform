import fs from 'node:fs';
import path from 'node:path';
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

export function createApi({ config, ingest, query, stats, bus, transports, settings, notify, photoDir }) {
  const api = express.Router();
  api.use(express.json({ limit: '8mb' }));

  // ---------- 鉴权（可选） ----------
  api.use((req, res, next) => {
    if (!config.authToken || req.path.startsWith('/push/') || req.path === '/health' || req.path === '/ui-config') return next();
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
      transports: transports.status(),
    });
  });

  // ---------- 界面配置（平台名称、地图） ----------
  api.get('/ui-config', (req, res) => res.json({
    platformName: config.platformName,
    screenTitle: config.screenTitle,
    tzOffsetHours: config.tzOffsetHours,
    map: { provider: config.mapProvider, tileUrl: config.mapTileUrl, center: [config.mapCenterLat, config.mapCenterLng], zoom: config.mapZoom },
  }));
  api.post('/settings/notify-test', wrap(async (req, res) => res.json(await notify.test())));

  // ---------- 系统设置 ----------
  const settingsView = () => ({ ...settings.list(), transports: transports.status(), notify: notify.status() });
  api.get('/settings', (req, res) => res.json(settingsView()));
  api.put('/settings', wrap(async (req, res) => {
    const { changed, applyGroups } = settings.update(req.body || {});
    const restart = [...applyGroups].filter((g) => g !== 'runtime');
    if (restart.length) await transports.restart(restart);
    res.json({ ...settingsView(), changed, restarted: restart });
  }));
  api.post('/settings/reset', wrap(async (req, res) => {
    const { changed, applyGroups } = settings.reset(req.body?.keys);
    const restart = [...applyGroups].filter((g) => g !== 'runtime');
    if (restart.length) await transports.restart(restart);
    res.json({ ...settingsView(), changed, restarted: restart });
  }));

  // ---------- 数据管理 ----------
  api.get('/admin/data-summary', wrap((req, res) => res.json(query.dataSummary())));
  api.post('/admin/purge', wrap((req, res) => {
    const { scope, confirm } = req.body || {};
    if (confirm !== '确认清空') return res.status(400).json({ error: '请输入“确认清空”以继续' });
    if (scope !== 'all' && scope !== 'data') return res.status(400).json({ error: 'scope 必须为 all 或 data' });
    const r = query.purge(scope);
    bus.emit('frame', { purge: true, at: Date.now(), ok: true });
    res.json({ ok: true, ...r });
  }));

  // ---------- 字典 ----------
  api.get('/device-types', (req, res) => res.json(listDeviceTypes()));

  // ---------- 设备 ----------
  api.get('/devices', wrap((req, res) => res.json(query.listDevices(req.query))));
  api.get('/device-groups', wrap((req, res) => res.json(query.groups())));
  api.post('/devices', wrap((req, res) => res.json(query.createDevice(req.body || {}))));
  api.post('/devices/import', wrap((req, res) => res.json(query.importDevices(req.body?.rows))));
  api.get('/devices/export.csv', wrap((req, res) => {
    const { items } = query.listDevices({ ...req.query, page: 1, size: 2000 });
    const STATUS = { online: '在线', alarm: '报警', offline: '离线', inactive: '未上线' };
    const head = ['设备编号', '设备名称', '产品型号', '产品别名', '设备类型', '项目', '分组', '安装位置', '经度', '纬度', '负责人', '联系方式', '资产编号', 'IMEI', 'ICCID', '硬件版本', '软件版本', '通讯方式', '告警推送', '状态', '电量', '信号', '最后上报', '备注'];
    const fmt = (ms) => (ms ? new Date(ms + config.tzOffsetHours * 3600000).toISOString().replace('T', ' ').slice(0, 19) : '');
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [head.join(',')];
    for (const d of items) {
      lines.push([d.id, d.name, d.model, d.alias, d.typeName, d.project, d.groupName, d.location, d.lng, d.lat, d.owner, d.contact, d.assetNo, d.imei, d.iccid,
        d.hwVersion, d.swVersion, d.commType, d.alarmPush ? '开' : '关', STATUS[d.status], d.battery.level == null ? '' : `${d.battery.level}%`, d.signal ?? '', fmt(d.lastSeen), d.remark].map(esc).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="devices.csv"');
    res.send('\ufeff' + lines.join('\n'));
  }));
  api.get('/device-projects', wrap((req, res) => res.json(query.projects())));
  api.get('/devices/:id/runtime', wrap((req, res) => {
    const r = query.deviceRuntime(req.params.id);
    if (!r) return res.status(404).json({ error: '设备不存在' });
    res.json(r);
  }));
  api.get('/devices/:id/locations', wrap((req, res) => res.json(query.locations(req.params.id, req.query))));

  // 设备照片：上传 dataURL（jpg / png / webp，≤ 5MB）
  const PHOTO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const photoName = (id) => Buffer.from(id).toString('hex');
  api.post('/devices/:id/photo', wrap((req, res) => {
    if (!query.getDevice(req.params.id)) return res.status(404).json({ error: '设备不存在' });
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.dataUrl || '');
    if (!m) return res.status(400).json({ error: '仅支持 JPG / PNG / WEBP 图片' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ error: '图片不能超过 5MB' });
    fs.mkdirSync(photoDir, { recursive: true });
    const base = photoName(req.params.id);
    for (const ext of Object.values(PHOTO_EXT)) fs.rmSync(path.join(photoDir, `${base}.${ext}`), { force: true });
    const file = `${base}.${PHOTO_EXT[m[1]]}`;
    fs.writeFileSync(path.join(photoDir, file), buf);
    query.setPhoto(req.params.id, `${file}:${Date.now()}`);
    res.json(query.getDevice(req.params.id));
  }));
  api.delete('/devices/:id/photo', wrap((req, res) => {
    const base = photoName(req.params.id);
    for (const ext of Object.values(PHOTO_EXT)) fs.rmSync(path.join(photoDir, `${base}.${ext}`), { force: true });
    query.setPhoto(req.params.id, null);
    res.json(query.getDevice(req.params.id));
  }));
  api.get('/devices/:id/photo', (req, res) => {
    const base = photoName(req.params.id);
    for (const [type, ext] of Object.entries(PHOTO_EXT)) {
      const f = path.join(photoDir, `${base}.${ext}`);
      if (fs.existsSync(f)) {
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'private, max-age=86400');
        return res.send(fs.readFileSync(f));
      }
    }
    res.status(404).end();
  });

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
  api.get('/commands', wrap((req, res) => res.json(query.commandList(req.query))));
  api.post('/commands/batch', wrap((req, res) => {
    const b = req.body || {};
    const params = b.preset === 'readAll' ? READ_ALL_CONFIG : b.params;
    const ids = query.addCommands(b.deviceIds, params, b.note);
    for (const [i, id] of ids.entries()) bus.emit('command', { deviceId: b.deviceIds[i], commandId: id, status: 'pending' });
    res.json({ ids });
  }));
  api.post('/commands/cancel', wrap((req, res) => {
    let n = 0;
    for (const id of req.body?.ids || []) n += query.cancelCommand(Number(id));
    res.json({ cancelled: n });
  }));
  api.post('/commands/delete', wrap((req, res) => res.json({ deleted: query.deleteCommands(req.body?.ids) })));
  api.delete('/commands/:id', wrap((req, res) => {
    query.cancelCommand(Number(req.params.id));
    res.json({ ok: true });
  }));

  // ---------- 维保记录 ----------
  api.get('/maintenance', wrap((req, res) => res.json(query.maintenance(req.query))));
  api.post('/maintenance', wrap((req, res) => res.json({ id: query.addMaintenance(req.body || {}) })));
  api.delete('/maintenance/:id', wrap((req, res) => {
    query.deleteMaintenance(Number(req.params.id));
    res.json({ ok: true });
  }));
  api.get('/maintenance/export.csv', wrap((req, res) => {
    const { items } = query.maintenance({ ...req.query, page: 1, size: 5000 });
    const fmt = (ms) => new Date(ms + config.tzOffsetHours * 3600000).toISOString().replace('T', ' ').slice(0, 19);
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = ['设备编号,设备名称,维保类型,原值,新值,说明,维保时间,来源'];
    for (const m of items) lines.push([m.deviceId, m.deviceName, m.type, m.oldValue, m.newValue, m.note, fmt(m.ts), m.auto ? '自动识别' : '人工登记'].map(esc).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="maintenance.csv"');
    res.send('\ufeff' + lines.join('\n'));
  }));

  // ---------- 原始报文 ----------
  api.get('/frames', wrap((req, res) => res.json(query.frames(req.query))));

  // ---------- 报警 ----------
  api.get('/alarms', wrap((req, res) => res.json(query.alarms(req.query))));
  api.get('/alarms/summary', wrap((req, res) => res.json(query.alarmSummary())));
  api.get('/alarms/export.csv', wrap((req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="alarms.csv"');
    res.send(query.alarmsCsv(req.query));
  }));
  api.post('/alarms/handle', wrap((req, res) => {
    const n = query.handleAlarms(req.body?.ids, req.body?.status, req.body?.note);
    bus.emit('alarm', { state: 'handled', ids: req.body?.ids, status: Number(req.body?.status) });
    res.json({ updated: n });
  }));
  api.post('/alarms/:id/ack', wrap((req, res) => {
    query.ackAlarm(Number(req.params.id), req.body?.note);
    res.json({ ok: true });
  }));
  api.post('/alarms/ack-all', wrap((req, res) => {
    const n = query.ackAll(req.body?.deviceId, req.body?.status ?? 1, req.body?.note);
    bus.emit('alarm', { state: 'handled' });
    res.json({ ok: true, updated: n });
  }));

  // ---------- 统计 ----------
  api.get('/stats/overview', wrap((req, res) => res.json(stats.overview())));
  api.get('/stats/trend', wrap((req, res) => res.json(stats.trend(req.query.days))));
  api.get('/stats/hourly', wrap((req, res) => res.json(stats.hourly())));
  api.get('/stats/alarms', wrap((req, res) => res.json(stats.alarmStats(req.query))));
  api.get('/stats/alarm-trend', wrap((req, res) => res.json(query.alarmTrend(req.query.days))));
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
