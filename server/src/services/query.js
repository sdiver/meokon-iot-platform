import { getDeviceType } from '../protocol/deviceTypes.js';

const json = (s, d = null) => {
  if (s == null) return d;
  try { return JSON.parse(s); } catch { return d; }
};

/** 参数 key 只允许字母数字，防止拼进 json path 时注入 */
const safeKey = (k) => {
  if (!/^[A-Za-z0-9_]+$/.test(String(k))) throw Object.assign(new Error('非法参数名'), { status: 400 });
  return k;
};

export class QueryService {
  constructor(db, config) {
    this.db = db;
    this.config = config;
  }

  get tzSec() {
    return this.config.tzOffsetHours * 3600;
  }

  /** 本地时区当天 0 点（毫秒） */
  startOfDay(now = Date.now(), daysAgo = 0) {
    const local = Math.floor((now / 1000 + this.tzSec) / 86400) * 86400;
    return (local - this.tzSec - daysAgo * 86400) * 1000;
  }

  offlineAfterSec(row) {
    const period = (row.interval_sec || 60) * Math.max(1, row.record_count || 1);
    return Math.max(this.config.offlineMinSec, Math.round(period * this.config.offlineFactor));
  }

  mapDevice(row, now = Date.now()) {
    const def = getDeviceType(row.type_code);
    const offlineAfter = this.offlineAfterSec(row);
    const online = now - row.last_seen <= offlineAfter * 1000;
    const alarming = (row.alarm_raw ?? 0) !== 0;
    return {
      id: row.id,
      name: row.name,
      location: row.location,
      groupName: row.group_name,
      remark: row.remark,
      lat: row.lat,
      lng: row.lng,
      typeCode: row.type_code,
      typeName: row.type_name,
      category: def?.category ?? '其他',
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      lastUtc: row.last_utc,
      transport: row.transport,
      remote: row.remote,
      battery: { raw: row.battery_raw, level: row.battery_level, source: row.power_source, mode: row.power_mode },
      signal: row.signal,
      interval: row.interval_sec,
      recordCount: row.record_count,
      alarm: { raw: row.alarm_raw ?? 0, bits: json(row.alarm_bits, []) },
      alarmParams: json(row.alarm_params, []),
      realtime: json(row.realtime, {}),
      frameCount: row.frame_count,
      online,
      alarming,
      status: !online ? 'offline' : alarming ? 'alarm' : 'online',
      offlineAfter,
    };
  }

  allDevices(now = Date.now()) {
    return this.db.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all().map((r) => this.mapDevice(r, now));
  }

  listDevices(q = {}) {
    let list = this.allDevices();
    const kw = (q.keyword || '').trim().toLowerCase();
    if (kw) {
      list = list.filter((d) => [d.id, d.name, d.location, d.groupName, d.typeName, d.remark].some((v) => v && String(v).toLowerCase().includes(kw)));
    }
    if (q.type !== undefined && q.type !== '') list = list.filter((d) => d.typeCode === Number(q.type));
    if (q.category) list = list.filter((d) => d.category === q.category);
    if (q.group) list = list.filter((d) => d.groupName === q.group);
    if (q.status === 'online') list = list.filter((d) => d.online);
    else if (q.status === 'offline') list = list.filter((d) => !d.online);
    else if (q.status === 'alarm') list = list.filter((d) => d.alarming);
    else if (q.status === 'lowBattery') list = list.filter((d) => d.battery.source === '电池' && d.battery.level <= 20);
    const total = list.length;
    const page = Math.max(1, Number(q.page) || 1);
    const size = Math.min(500, Math.max(1, Number(q.size) || 20));
    return { total, page, size, items: list.slice((page - 1) * size, page * size) };
  }

  getDevice(id) {
    const row = this.db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    return row ? this.mapDevice(row) : null;
  }

  updateDevice(id, patch) {
    const fields = { name: 'name', location: 'location', groupName: 'group_name', remark: 'remark', lat: 'lat', lng: 'lng' };
    const sets = [];
    const vals = [];
    for (const [k, col] of Object.entries(fields)) {
      if (patch[k] === undefined) continue;
      sets.push(`${col} = ?`);
      let v = patch[k] === '' ? null : patch[k];
      if ((k === 'lat' || k === 'lng') && v !== null) v = Number(v);
      vals.push(v);
    }
    if (sets.length) this.db.prepare(`UPDATE devices SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    return this.getDevice(id);
  }

  deleteDevice(id, purge = false) {
    this.db.prepare('DELETE FROM devices WHERE id = ?').run(id);
    if (purge) {
      for (const t of ['readings', 'frames', 'alarms', 'commands']) this.db.prepare(`DELETE FROM ${t} WHERE device_id = ?`).run(id);
    }
  }

  groups() {
    return this.db.prepare("SELECT DISTINCT group_name AS g FROM devices WHERE group_name IS NOT NULL AND group_name <> '' ORDER BY g").all().map((r) => r.g);
  }

  // ---------------- 采集数据 ----------------

  readings(deviceId, { from, to, page = 1, size = 50, order = 'desc' } = {}) {
    const [f, t] = this.range(from, to, 7);
    const total = this.db.prepare('SELECT count(*) c FROM readings WHERE device_id = ? AND ts BETWEEN ? AND ?').get(deviceId, f, t).c;
    size = Math.min(5000, Math.max(1, Number(size) || 50));
    page = Math.max(1, Number(page) || 1);
    const rows = this.db.prepare(`SELECT ts, vals, alarm_raw FROM readings WHERE device_id = ? AND ts BETWEEN ? AND ? ORDER BY ts ${order === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`)
      .all(deviceId, f, t, size, (page - 1) * size);
    return { total, page, size, from: f, to: t, items: rows.map((r) => ({ ts: r.ts, values: json(r.vals, {}), alarmRaw: r.alarm_raw })) };
  }

  /** 秒级时间范围，默认最近 defDays 天 */
  range(from, to, defDays = 1) {
    const now = Math.floor(Date.now() / 1000);
    const t = to ? Number(to) : now;
    const f = from ? Number(from) : t - defDays * 86400;
    // 兼容毫秒
    return [f > 1e11 ? Math.floor(f / 1000) : f, t > 1e11 ? Math.floor(t / 1000) : t];
  }

  autoBucket(f, t) {
    const span = t - f;
    if (span <= 2 * 86400) return 0;
    if (span <= 8 * 86400) return 600;
    if (span <= 35 * 86400) return 3600;
    if (span <= 120 * 86400) return 4 * 3600;
    return 86400;
  }

  /** 曲线数据：bucket=0 返回原始点，否则按时间桶聚合 avg/min/max */
  series(deviceId, { params, from, to, bucket } = {}) {
    const [f, t] = this.range(from, to, 1);
    const dev = this.getDevice(deviceId);
    const def = dev ? getDeviceType(dev.typeCode) : null;
    let keys = params ? String(params).split(',').filter(Boolean) : (def?.params ?? []).filter((p) => p.kind === 'num' && p.chart !== false).map((p) => p.key);
    if (!keys.length && dev) keys = Object.keys(dev.realtime).filter((k) => typeof dev.realtime[k] === 'number');
    keys = keys.map(safeKey);
    const b = bucket === undefined || bucket === 'auto' || bucket === '' ? this.autoBucket(f, t) : Number(bucket);
    if (!keys.length) return { from: f, to: t, bucket: b, keys, points: [] };
    if (!b) {
      const rows = this.db.prepare('SELECT ts, vals FROM readings WHERE device_id = ? AND ts BETWEEN ? AND ? ORDER BY ts LIMIT 20000').all(deviceId, f, t);
      return {
        from: f, to: t, bucket: 0, keys,
        points: rows.map((r) => {
          const v = json(r.vals, {});
          return { ts: r.ts, ...Object.fromEntries(keys.map((k) => [k, v[k] ?? null])) };
        }),
      };
    }
    const cols = keys.map((k) => `avg(json_extract(vals, '$.${k}')) AS "${k}", min(json_extract(vals, '$.${k}')) AS "${k}__min", max(json_extract(vals, '$.${k}')) AS "${k}__max"`).join(', ');
    const rows = this.db.prepare(`SELECT (ts / ${b}) * ${b} AS bt, count(*) AS n, ${cols} FROM readings WHERE device_id = ? AND ts BETWEEN ? AND ? GROUP BY bt ORDER BY bt`).all(deviceId, f, t);
    return {
      from: f, to: t, bucket: b, keys,
      points: rows.map((r) => {
        const p = { ts: r.bt, n: r.n };
        for (const k of keys) {
          p[k] = r[k] == null ? null : Number(r[k].toFixed(4));
          p[`${k}__min`] = r[`${k}__min`];
          p[`${k}__max`] = r[`${k}__max`];
        }
        return p;
      }),
    };
  }

  /** 单设备各参数在时间段内的统计 */
  deviceStats(deviceId, { from, to } = {}) {
    const [f, t] = this.range(from, to, 1);
    const dev = this.getDevice(deviceId);
    if (!dev) return null;
    const def = getDeviceType(dev.typeCode);
    let params = (def?.params ?? []).filter((p) => p.kind === 'num' && p.chart !== false);
    if (!params.length) params = Object.keys(dev.realtime).filter((k) => typeof dev.realtime[k] === 'number').map((k) => ({ key: k, name: k, unit: '' }));
    const base = this.db.prepare('SELECT count(*) n, min(ts) f, max(ts) l FROM readings WHERE device_id = ? AND ts BETWEEN ? AND ?').get(deviceId, f, t);
    const items = params.map((p) => {
      const k = safeKey(p.key);
      const r = this.db.prepare(`SELECT min(v) mn, max(v) mx, avg(v) av, count(v) n FROM (SELECT json_extract(vals, '$.${k}') v FROM readings WHERE device_id = ? AND ts BETWEEN ? AND ?)`).get(deviceId, f, t);
      const first = this.db.prepare(`SELECT json_extract(vals, '$.${k}') v, ts FROM readings WHERE device_id = ? AND ts BETWEEN ? AND ? ORDER BY ts ASC LIMIT 1`).get(deviceId, f, t);
      const last = this.db.prepare(`SELECT json_extract(vals, '$.${k}') v, ts FROM readings WHERE device_id = ? AND ts BETWEEN ? AND ? ORDER BY ts DESC LIMIT 1`).get(deviceId, f, t);
      // 超限次数：根据当前报警参数统计
      const th = dev.alarmParams.find((a) => a.key === p.key);
      let below = null;
      let above = null;
      if (th && th.low != null && th.high != null && th.high > th.low) {
        const c = this.db.prepare(`SELECT sum(v < ?) b, sum(v > ?) a FROM (SELECT json_extract(vals, '$.${k}') v FROM readings WHERE device_id = ? AND ts BETWEEN ? AND ?)`).get(th.low, th.high, deviceId, f, t);
        below = c.b ?? 0;
        above = c.a ?? 0;
      }
      return {
        key: p.key, name: p.name, unit: p.unit,
        min: r.mn, max: r.mx, avg: r.av == null ? null : Number(r.av.toFixed(4)), count: r.n,
        first: first?.v ?? null, last: last?.v ?? null, change: first && last && first.v != null && last.v != null ? Number((last.v - first.v).toFixed(4)) : null,
        low: th?.low ?? null, high: th?.high ?? null, belowCount: below, aboveCount: above,
      };
    });
    // 数据完整率：期望点数 = 时间跨度 / 采集间隔
    const interval = dev.interval || 60;
    const span = base.n ? Math.max(interval, (base.l - base.f) + interval) : 0;
    const expected = span ? Math.round(span / interval) : 0;
    return {
      from: f, to: t, count: base.n, firstTs: base.f, lastTs: base.l,
      completeness: expected ? Math.min(1, base.n / expected) : null,
      params: items,
    };
  }

  exportCsv(deviceId, { from, to } = {}) {
    const [f, t] = this.range(from, to, 7);
    const dev = this.getDevice(deviceId);
    const def = dev ? getDeviceType(dev.typeCode) : null;
    const rows = this.db.prepare('SELECT ts, vals, alarm_raw FROM readings WHERE device_id = ? AND ts BETWEEN ? AND ? ORDER BY ts').all(deviceId, f, t);
    let keys = (def?.params ?? []).map((p) => p.key);
    if (!keys.length && rows.length) keys = Object.keys(json(rows[0].vals, {}));
    const head = ['采集时间', ...keys.map((k) => {
      const p = def?.params.find((x) => x.key === k);
      return p ? `${p.name}${p.unit ? `(${p.unit})` : ''}` : k;
    }), '报警状态'];
    const fmt = (ts) => new Date((ts + this.tzSec) * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [head.map(esc).join(',')];
    for (const r of rows) {
      const v = json(r.vals, {});
      lines.push([fmt(r.ts), ...keys.map((k) => v[k]), r.alarm_raw ? `0x${r.alarm_raw.toString(16).padStart(2, '0')}` : ''].map(esc).join(','));
    }
    return '﻿' + lines.join('\n');
  }

  // ---------------- 原始报文 ----------------

  frames({ deviceId, direction, ok, page = 1, size = 20, from, to } = {}) {
    const where = [];
    const args = [];
    if (deviceId) { where.push('device_id = ?'); args.push(deviceId); }
    if (direction) { where.push('direction = ?'); args.push(direction); }
    if (ok === '1' || ok === '0' || ok === 1 || ok === 0) { where.push('ok = ?'); args.push(Number(ok)); }
    if (from) { where.push('received_at >= ?'); args.push(Number(from) < 1e11 ? Number(from) * 1000 : Number(from)); }
    if (to) { where.push('received_at <= ?'); args.push(Number(to) < 1e11 ? Number(to) * 1000 : Number(to)); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    size = Math.min(500, Math.max(1, Number(size) || 20));
    page = Math.max(1, Number(page) || 1);
    const total = this.db.prepare(`SELECT count(*) c FROM frames ${w}`).get(...args).c;
    const items = this.db.prepare(`SELECT * FROM frames ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, size, (page - 1) * size).map((r) => ({
      id: r.id, deviceId: r.device_id, receivedAt: r.received_at, direction: r.direction, transport: r.transport, remote: r.remote,
      hex: r.raw_hex, ok: !!r.ok, crcOk: r.crc_ok == null ? null : !!r.crc_ok, error: r.error, typeCode: r.type_code,
      recordCount: r.record_count, alarmRaw: r.alarm_raw, bytes: r.raw_hex.length / 2,
    }));
    return { total, page, size, items };
  }

  // ---------------- 报警 ----------------

  alarms({ deviceId, status, acked, label, type, from, to, page = 1, size = 20 } = {}) {
    const where = [];
    const args = [];
    if (deviceId) { where.push('a.device_id = ?'); args.push(deviceId); }
    if (status === 'open') where.push('a.end_ts IS NULL');
    if (status === 'closed') where.push('a.end_ts IS NOT NULL');
    if (acked === '1' || acked === '0') { where.push('a.acked = ?'); args.push(Number(acked)); }
    if (label) { where.push('a.label = ?'); args.push(label); }
    if (type !== undefined && type !== '') { where.push('a.type_code = ?'); args.push(Number(type)); }
    if (from) { where.push('a.start_ts >= ?'); args.push(Number(from) < 1e11 ? Number(from) * 1000 : Number(from)); }
    if (to) { where.push('a.start_ts <= ?'); args.push(Number(to) < 1e11 ? Number(to) * 1000 : Number(to)); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    size = Math.min(500, Math.max(1, Number(size) || 20));
    page = Math.max(1, Number(page) || 1);
    const total = this.db.prepare(`SELECT count(*) c FROM alarms a ${w}`).get(...args).c;
    const items = this.db.prepare(`SELECT a.*, d.name AS device_name, d.type_name, d.location FROM alarms a LEFT JOIN devices d ON d.id = a.device_id ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`)
      .all(...args, size, (page - 1) * size).map((r) => ({
        id: r.id, deviceId: r.device_id, deviceName: r.device_name, typeCode: r.type_code, typeName: r.type_name, location: r.location,
        bit: r.bit, label: r.label, startTs: r.start_ts, endTs: r.end_ts, open: r.end_ts == null,
        duration: r.end_ts ? r.end_ts - r.start_ts : Date.now() - r.start_ts,
        snapshot: json(r.snapshot, {}), thresholds: json(r.thresholds, []), acked: !!r.acked, ackedAt: r.acked_at, note: r.note,
      }));
    return { total, page, size, items };
  }

  ackAlarm(id, note) {
    this.db.prepare('UPDATE alarms SET acked = 1, acked_at = ?, note = COALESCE(?, note) WHERE id = ?').run(Date.now(), note ?? null, id);
  }

  ackAll(deviceId) {
    if (deviceId) this.db.prepare('UPDATE alarms SET acked = 1, acked_at = ? WHERE acked = 0 AND device_id = ?').run(Date.now(), deviceId);
    else this.db.prepare('UPDATE alarms SET acked = 1, acked_at = ? WHERE acked = 0').run(Date.now());
  }

  // ---------------- 下行命令 ----------------

  commands(deviceId) {
    return this.db.prepare('SELECT * FROM commands WHERE device_id = ? ORDER BY id DESC LIMIT 100').all(deviceId).map((r) => ({
      id: r.id, deviceId: r.device_id, params: r.params_hex, note: r.note, status: r.status, createdAt: r.created_at,
      sentAt: r.sent_at, sentVia: r.sent_via, ackAt: r.ack_at, ackParams: r.ack_hex,
    }));
  }

  addCommand(deviceId, paramsHex, note) {
    const clean = String(paramsHex || '').replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    if (!clean || clean.length % 2) throw Object.assign(new Error('参数设置数据单元必须是偶数长度的十六进制'), { status: 400 });
    if (clean.length / 2 > 255) throw Object.assign(new Error('参数设置数据单元最多 255 字节'), { status: 400 });
    const r = this.db.prepare('INSERT INTO commands (device_id, params_hex, note, created_at) VALUES (?, ?, ?, ?)').run(deviceId, clean, note ?? null, Date.now());
    return Number(r.lastInsertRowid);
  }

  cancelCommand(id) {
    this.db.prepare("UPDATE commands SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(id);
  }

  // ---------------- 维护 ----------------

  cleanup() {
    const now = Date.now();
    let frames = 0;
    let readings = 0;
    if (this.config.frameRetentionDays > 0) {
      frames = Number(this.db.prepare('DELETE FROM frames WHERE received_at < ?').run(now - this.config.frameRetentionDays * 86400000).changes);
    }
    if (this.config.readingRetentionDays > 0) {
      readings = Number(this.db.prepare('DELETE FROM readings WHERE ts < ?').run(Math.floor(now / 1000) - this.config.readingRetentionDays * 86400).changes);
    }
    return { frames, readings };
  }
}
