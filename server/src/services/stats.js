import { listDeviceTypes } from '../protocol/deviceTypes.js';

const SIGNAL_LEVELS = [
  { name: '强 (≥-85dBm)', test: (s) => s >= -85 },
  { name: '良 (-95~-85)', test: (s) => s >= -95 && s < -85 },
  { name: '弱 (-105~-95)', test: (s) => s >= -105 && s < -95 },
  { name: '差 (<-105)', test: (s) => s < -105 },
];
const BATTERY_LEVELS = [
  { name: '0-20%', test: (b) => b <= 20 },
  { name: '21-50%', test: (b) => b > 20 && b <= 50 },
  { name: '51-80%', test: (b) => b > 50 && b <= 80 },
  { name: '81-100%', test: (b) => b > 80 },
];

const countBy = (list, fn) => {
  const m = new Map();
  for (const x of list) {
    const k = fn(x);
    if (k == null) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};

export class StatsService {
  constructor(db, config, query) {
    this.db = db;
    this.config = config;
    this.query = query;
  }

  /** 首页总览 */
  overview(now = Date.now()) {
    const devices = this.query.allDevices(now);
    const today = this.query.startOfDay(now);
    const online = devices.filter((d) => d.online).length;
    const fr = this.db.prepare("SELECT sum(direction = 'up' AND ok = 1) up, sum(direction = 'up' AND ok = 0) bad, sum(direction = 'down') down FROM frames WHERE received_at >= ?").get(today);
    const readingsToday = this.db.prepare('SELECT count(*) c FROM readings WHERE ts >= ?').get(Math.floor(today / 1000)).c;
    const alarmsToday = this.db.prepare('SELECT count(*) c FROM alarms WHERE start_ts >= ?').get(today).c;
    const openAlarms = this.db.prepare('SELECT count(*) c, sum(acked = 0) u FROM alarms WHERE end_ts IS NULL').get();
    const totals = this.db.prepare('SELECT (SELECT count(*) FROM readings) r, (SELECT count(*) FROM frames) f, (SELECT count(*) FROM alarms) a').get();
    const battDevices = devices.filter((d) => d.battery.source === '电池' && d.battery.level != null);

    return {
      now,
      devices: {
        total: devices.length,
        online,
        offline: devices.length - online,
        alarming: devices.filter((d) => d.alarming).length,
        lowBattery: battDevices.filter((d) => d.battery.level <= 20).length,
        weakSignal: devices.filter((d) => d.signal != null && d.signal < -105).length,
        onlineRate: devices.length ? online / devices.length : 0,
        newToday: devices.filter((d) => d.firstSeen >= today).length,
      },
      today: {
        frames: fr.up ?? 0,
        badFrames: fr.bad ?? 0,
        downlinks: fr.down ?? 0,
        readings: readingsToday,
        alarms: alarmsToday,
      },
      alarms: { open: openAlarms.c ?? 0, unacked: openAlarms.u ?? 0 },
      totals: { readings: totals.r, frames: totals.f, alarms: totals.a },
      byType: countBy(devices, (d) => d.typeName),
      byCategory: countBy(devices, (d) => d.category),
      byTransport: countBy(devices, (d) => d.transport),
      byStatus: [
        { name: '在线正常', value: devices.filter((d) => d.status === 'online').length },
        { name: '报警', value: devices.filter((d) => d.status === 'alarm').length },
        { name: '离线', value: devices.filter((d) => d.status === 'offline').length },
      ],
      byPower: countBy(devices, (d) => d.battery.mode),
      battery: BATTERY_LEVELS.map((l) => ({ name: l.name, value: battDevices.filter((d) => l.test(d.battery.level)).length })),
      signal: SIGNAL_LEVELS.map((l) => ({ name: l.name, value: devices.filter((d) => d.signal != null && l.test(d.signal)).length })),
    };
  }

  /** 最近 N 天每日趋势：上报帧、错误帧、采集数据、报警、活跃设备 */
  trend(days = 7, now = Date.now()) {
    days = Math.min(366, Math.max(1, Number(days) || 7));
    const tz = this.config.tzOffsetHours * 3600;
    const since = this.query.startOfDay(now, days - 1);
    const dayKey = (col, ms) => `date(${ms ? `${col} / 1000` : col} + ${tz}, 'unixepoch')`;
    const frames = this.db.prepare(`SELECT ${dayKey('received_at', true)} d, sum(direction='up' AND ok=1) up, sum(direction='up' AND ok=0) bad,
        count(DISTINCT CASE WHEN direction='up' AND ok=1 THEN device_id END) active
      FROM frames WHERE received_at >= ? GROUP BY d`).all(since);
    const readings = this.db.prepare(`SELECT ${dayKey('ts')} d, count(*) n FROM readings WHERE ts >= ? GROUP BY d`).all(Math.floor(since / 1000));
    const alarms = this.db.prepare(`SELECT ${dayKey('start_ts', true)} d, count(*) n FROM alarms WHERE start_ts >= ? GROUP BY d`).all(since);
    const fm = new Map(frames.map((r) => [r.d, r]));
    const rm = new Map(readings.map((r) => [r.d, r.n]));
    const am = new Map(alarms.map((r) => [r.d, r.n]));
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since + i * 86400000 + tz * 1000).toISOString().slice(0, 10);
      const f = fm.get(d);
      out.push({ date: d, frames: f?.up ?? 0, badFrames: f?.bad ?? 0, activeDevices: f?.active ?? 0, readings: rm.get(d) ?? 0, alarms: am.get(d) ?? 0 });
    }
    return out;
  }

  /** 最近 24 小时每小时上报量 */
  hourly(now = Date.now()) {
    const hourMs = 3600000;
    const end = Math.floor(now / hourMs) * hourMs;
    const since = end - 23 * hourMs;
    const rows = this.db.prepare("SELECT (received_at / 3600000) * 3600000 h, count(*) n, count(DISTINCT device_id) dev FROM frames WHERE direction='up' AND ok=1 AND received_at >= ? GROUP BY h").all(since);
    const m = new Map(rows.map((r) => [r.h, r]));
    return Array.from({ length: 24 }, (_, i) => {
      const h = since + i * hourMs;
      return { ts: h, frames: m.get(h)?.n ?? 0, devices: m.get(h)?.dev ?? 0 };
    });
  }

  /** 报警统计 */
  alarmStats({ from, to } = {}) {
    const now = Date.now();
    const t = to ? Number(to) : now;
    const f = from ? Number(from) : this.query.startOfDay(now, 29);
    const tz = this.config.tzOffsetHours * 3600;
    const byLabel = this.db.prepare('SELECT label name, count(*) value FROM alarms WHERE start_ts BETWEEN ? AND ? GROUP BY label ORDER BY value DESC').all(f, t);
    const typeNames = new Map(listDeviceTypes().map((x) => [x.code, x.name]));
    const byType = this.db.prepare('SELECT type_code code, count(*) value FROM alarms WHERE start_ts BETWEEN ? AND ? GROUP BY type_code ORDER BY value DESC').all(f, t)
      .map((r) => ({ name: typeNames.get(r.code) ?? `类型 ${r.code}`, value: r.value }));
    const topDevices = this.db.prepare(`SELECT a.device_id id, d.name, d.type_name typeName, count(*) value, sum(a.end_ts IS NULL) open
      FROM alarms a LEFT JOIN devices d ON d.id = a.device_id WHERE a.start_ts BETWEEN ? AND ? GROUP BY a.device_id ORDER BY value DESC LIMIT 10`).all(f, t);
    const daily = this.db.prepare(`SELECT date(start_ts / 1000 + ${tz}, 'unixepoch') date, count(*) value FROM alarms WHERE start_ts BETWEEN ? AND ? GROUP BY date ORDER BY date`).all(f, t);
    const hourOfDay = this.db.prepare(`SELECT CAST(strftime('%H', start_ts / 1000 + ${tz}, 'unixepoch') AS INTEGER) hour, count(*) value FROM alarms WHERE start_ts BETWEEN ? AND ? GROUP BY hour`).all(f, t);
    const sum = this.db.prepare(`SELECT count(*) total, sum(end_ts IS NULL) open, sum(acked) acked, avg(CASE WHEN end_ts IS NOT NULL THEN end_ts - start_ts END) avgDuration,
      max(CASE WHEN end_ts IS NOT NULL THEN end_ts - start_ts END) maxDuration, count(DISTINCT device_id) devices FROM alarms WHERE start_ts BETWEEN ? AND ?`).get(f, t);
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, value: hourOfDay.find((r) => r.hour === h)?.value ?? 0 }));
    return {
      from: f, to: t,
      summary: {
        total: sum.total ?? 0, open: sum.open ?? 0, acked: sum.acked ?? 0, devices: sum.devices ?? 0,
        ackRate: sum.total ? (sum.acked ?? 0) / sum.total : 0,
        avgDuration: sum.avgDuration ?? null, maxDuration: sum.maxDuration ?? null,
      },
      byLabel, byType, topDevices, daily, hourOfDay: hours,
    };
  }

  /** 按设备类型汇总：设备数、在线、报警、主参数当前均值 */
  typeStats(now = Date.now()) {
    const devices = this.query.allDevices(now);
    const types = new Map(listDeviceTypes().map((t) => [t.code, t]));
    const since = now - 86400000;
    const frames24 = new Map(this.db.prepare("SELECT type_code t, count(*) n FROM frames WHERE direction='up' AND ok=1 AND received_at >= ? GROUP BY type_code").all(since).map((r) => [r.t, r.n]));
    const alarms30 = new Map(this.db.prepare('SELECT type_code t, count(*) n FROM alarms WHERE start_ts >= ? GROUP BY type_code').all(now - 30 * 86400000).map((r) => [r.t, r.n]));
    const groups = new Map();
    for (const d of devices) {
      if (!groups.has(d.typeCode)) groups.set(d.typeCode, []);
      groups.get(d.typeCode).push(d);
    }
    return [...groups.entries()].map(([code, list]) => {
      const t = types.get(code);
      const params = (t?.params ?? []).filter((p) => p.chart).map((p) => {
        const vals = list.filter((d) => d.online).map((d) => d.realtime[p.key]).filter((v) => typeof v === 'number');
        return {
          key: p.key, name: p.name, unit: p.unit, n: vals.length,
          avg: vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4)) : null,
          min: vals.length ? Math.min(...vals) : null,
          max: vals.length ? Math.max(...vals) : null,
        };
      });
      return {
        code, name: t?.name ?? `未知类型(${code})`, category: t?.category ?? '其他',
        devices: list.length, online: list.filter((d) => d.online).length, alarming: list.filter((d) => d.alarming).length,
        frames24h: frames24.get(code) ?? 0, alarms30d: alarms30.get(code) ?? 0, params,
      };
    }).sort((a, b) => b.devices - a.devices);
  }

  /** 设备活跃度排行（按时间段内上报帧数） */
  activity({ from, to, limit = 20 } = {}) {
    const now = Date.now();
    const t = to ? Number(to) : now;
    const f = from ? Number(from) : now - 7 * 86400000;
    const rows = this.db.prepare(`SELECT f.device_id id, d.name, d.type_name typeName, sum(f.ok) ok, sum(f.ok = 0) bad, sum(f.record_count) records, max(f.received_at) last
      FROM frames f LEFT JOIN devices d ON d.id = f.device_id WHERE f.direction = 'up' AND f.received_at BETWEEN ? AND ? AND f.device_id IS NOT NULL
      GROUP BY f.device_id ORDER BY ok DESC LIMIT ?`).all(f, t, Math.min(200, Number(limit) || 20));
    return rows.map((r) => ({ ...r, successRate: r.ok + r.bad ? r.ok / (r.ok + r.bad) : null }));
  }
}
