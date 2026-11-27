import { getDeviceType } from '../protocol/deviceTypes.js';
import { inScope, scopeSql, currentOperator, currentScope } from './scope.js';

const json = (s, d = null) => {
  if (s == null) return d;
  try { return JSON.parse(s); } catch { return d; }
};

/** 参数 key 只允许字母数字，防止拼进 json path 时注入 */
const safeKey = (k) => {
  if (!/^[A-Za-z0-9_]+$/.test(String(k))) throw Object.assign(new Error('非法参数名'), { status: 400 });
  return k;
};

const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });
const toMs = (v) => (Number(v) < 1e11 ? Number(v) * 1000 : Number(v));

export const MAINT_TYPES = ['更换SIM卡', '更换电池', '维修', '安装', '巡检', '其他'];

/** API 字段 → 数据库列 */
export const ARCHIVE_FIELDS = {
  name: 'name', location: 'location', groupName: 'group_name', remark: 'remark', lat: 'lat', lng: 'lng',
  model: 'model', alias: 'alias', project: 'project', owner: 'owner', contact: 'contact', assetNo: 'asset_no',
  imei: 'imei', iccid: 'iccid', hwVersion: 'hw_version', swVersion: 'sw_version', commType: 'comm_type', alarmPush: 'alarm_push',
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
    const neverSeen = !row.last_seen;
    const online = !neverSeen && now - row.last_seen <= offlineAfter * 1000;
    const alarming = online && (row.alarm_raw ?? 0) !== 0;
    return {
      id: row.id,
      name: row.name,
      location: row.location,
      groupName: row.group_name,
      remark: row.remark,
      lat: row.lat,
      lng: row.lng,
      typeCode: row.type_code,
      typeName: row.type_name || (row.type_code == null ? null : def?.name),
      category: def?.category ?? '其他',
      firstSeen: row.first_seen || null,
      lastSeen: row.last_seen || null,
      lastUtc: row.last_utc,
      createdAt: row.created_at ?? row.first_seen,
      transport: row.transport,
      remote: row.remote,
      battery: { raw: row.battery_raw, level: row.battery_level, source: row.power_source, mode: row.power_mode },
      signal: row.signal,
      minSignal: row.min_signal,
      interval: row.interval_sec,
      recordCount: row.record_count,
      alarm: { raw: row.alarm_raw ?? 0, bits: json(row.alarm_bits, []) },
      alarmParams: json(row.alarm_params, []),
      realtime: json(row.realtime, {}),
      frameCount: row.frame_count,
      // 档案信息
      model: row.model, alias: row.alias, project: row.project, owner: row.owner, contact: row.contact,
      assetNo: row.asset_no, imei: row.imei, iccid: row.iccid, hwVersion: row.hw_version, swVersion: row.sw_version,
      commType: row.comm_type, alarmPush: row.alarm_push !== 0,
      photo: row.photo ? `/api/devices/${encodeURIComponent(row.id)}/photo?v=${encodeURIComponent(row.photo)}` : null,
      online,
      alarming,
      neverSeen,
      status: neverSeen ? 'inactive' : !online ? 'offline' : alarming ? 'alarm' : 'online',
      offlineAfter,
    };
  }

  allDevices(now = Date.now()) {
    return this.db.prepare('SELECT * FROM devices ORDER BY last_seen DESC, created_at DESC').all().filter((r) => inScope(r.project)).map((r) => this.mapDevice(r, now));
  }

  listDevices(q = {}) {
    let list = this.allDevices();
    const kw = (q.keyword || '').trim().toLowerCase();
    if (kw) {
      list = list.filter((d) => [d.id, d.name, d.location, d.groupName, d.typeName, d.remark, d.model, d.alias, d.project, d.owner, d.assetNo, d.imei, d.iccid]
        .some((v) => v && String(v).toLowerCase().includes(kw)));
    }
    if (q.type !== undefined && q.type !== '') list = list.filter((d) => d.typeCode === Number(q.type));
    if (q.category) list = list.filter((d) => d.category === q.category);
    if (q.group) list = list.filter((d) => d.groupName === q.group);
    if (q.project) list = list.filter((d) => d.project === q.project);
    if (q.located === '1') list = list.filter((d) => d.lat != null && d.lng != null);
    if (q.status === 'online') list = list.filter((d) => d.online);
    else if (q.status === 'offline') list = list.filter((d) => !d.online);
    else if (q.status === 'alarm') list = list.filter((d) => d.alarming);
    else if (q.status === 'inactive') list = list.filter((d) => d.neverSeen);
    else if (q.status === 'lowBattery') list = list.filter((d) => d.battery.source === '电池' && d.battery.level != null && d.battery.level <= 20);
    const total = list.length;
    const page = Math.max(1, Number(q.page) || 1);
    const size = Math.min(2000, Math.max(1, Number(q.size) || 20));
    return { total, page, size, items: list.slice((page - 1) * size, page * size) };
  }

  getDevice(id) {
    const row = this.db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    return row && inScope(row.project) ? this.mapDevice(row) : null;
  }

  /** 校验并转换档案字段 */
  archiveColumns(patch) {
    const out = [];
    for (const [k, col] of Object.entries(ARCHIVE_FIELDS)) {
      if (patch[k] === undefined) continue;
      let v = patch[k];
      if (k === 'lat' || k === 'lng') {
        v = v === '' || v === null ? null : Number(v);
        if (v !== null && (!Number.isFinite(v) || (k === 'lat' ? Math.abs(v) > 90 : Math.abs(v) > 180))) throw badRequest(`${k === 'lat' ? '纬度' : '经度'}超出范围`);
      } else if (k === 'project') {
        v = v === null ? null : String(v).trim().slice(0, 50) || null;
        const sc = currentScope();
        if (!sc.all && !(v && sc.projects.includes(v))) throw badRequest(v ? `无权将设备归入项目“${v}”` : '请选择设备所属项目');
      } else if (k === 'alarmPush') {
        v = v === false || v === 0 || v === '0' || v === 'false' || v === '关' ? 0 : 1;
      } else {
        v = v === null ? null : String(v).trim().slice(0, 200) || null;
      }
      out.push([col, v]);
    }
    return out;
  }

  updateDevice(id, patch, { now = Date.now() } = {}) {
    const before = this.db.prepare('SELECT lat, lng, iccid, project FROM devices WHERE id = ?').get(id);
    if (!before || !inScope(before.project)) return null;
    const cols = this.archiveColumns(patch);
    if (cols.length) this.db.prepare(`UPDATE devices SET ${cols.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map(([, v]) => v), id);
    // 档案中出现新的项目名称时自动建立项目
    const proj = cols.find(([c]) => c === 'project')?.[1];
    if (proj) this.db.prepare('INSERT OR IGNORE INTO projects (name, created_at) VALUES (?, ?)').run(proj, now);
    const after = this.db.prepare('SELECT lat, lng, iccid, location FROM devices WHERE id = ?').get(id);
    if (after.lat != null && after.lng != null && (after.lat !== before.lat || after.lng !== before.lng)) {
      this.db.prepare("INSERT INTO locations (device_id, ts, lat, lng, source, address) VALUES (?, ?, ?, ?, 'manual', ?)").run(id, now, after.lat, after.lng, after.location);
    }
    if (before.iccid && after.iccid && before.iccid !== after.iccid && !patch._skipMaint) {
      this.db.prepare("INSERT INTO maintenance (device_id, type, old_value, new_value, note, ts) VALUES (?, '更换SIM卡', ?, ?, '修改设备档案时记录', ?)").run(id, before.iccid, after.iccid, now);
    }
    return this.getDevice(id);
  }

  /** 预先登记设备（设备尚未上报） */
  createDevice(body, now = Date.now()) {
    const id = String(body?.id ?? '').trim();
    if (!/^[\x21-\x7e]{1,12}$/.test(id)) throw badRequest('设备编号为 1~12 位字母、数字或符号');
    if (this.db.prepare('SELECT 1 FROM devices WHERE id = ?').get(id)) throw Object.assign(new Error(`设备 ${id} 已存在`), { status: 409 });
    let typeCode = null;
    let typeName = null;
    if (body.typeCode !== undefined && body.typeCode !== null && body.typeCode !== '') {
      const def = getDeviceType(Number(body.typeCode));
      if (!def) throw badRequest('设备类型不存在');
      typeCode = def.code;
      typeName = def.name;
    }
    const sc = currentScope();
    if (!sc.all) {
      if (!sc.projects.length) throw badRequest('当前账号未分配项目，无法登记设备');
      if (!body.project) body = { ...body, project: sc.projects[0] };
      this.archiveColumns({ project: body.project }); // 校验项目权限
    }
    this.db.prepare('INSERT INTO devices (id, first_seen, last_seen, created_at, type_code, type_name, frame_count, project) VALUES (?, 0, 0, ?, ?, ?, 0, ?)')
      .run(id, now, typeCode, typeName, sc.all ? null : body.project);
    return this.updateDevice(id, body, { now });
  }

  /** 批量导入档案：已存在则更新，不存在则登记 */
  importDevices(rows, now = Date.now()) {
    if (!Array.isArray(rows) || !rows.length) throw badRequest('没有可导入的数据');
    if (rows.length > 5000) throw badRequest('单次最多导入 5000 行');
    const result = { created: 0, updated: 0, errors: [] };
    this.db.exec('BEGIN');
    try {
      rows.forEach((r, i) => {
        try {
          const id = String(r.id ?? '').trim();
          if (this.db.prepare('SELECT 1 FROM devices WHERE id = ?').get(id)) {
            if (!this.updateDevice(id, r, { now })) throw badRequest('无权修改该设备');
            result.updated++;
          } else {
            this.createDevice(r, now);
            result.created++;
          }
        } catch (e) {
          result.errors.push({ row: i + 2, id: r.id ?? '', error: e.message });
        }
      });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return result;
  }

  deleteDevice(id, purge = false) {
    if (!this.getDevice(id)) return;
    this.db.prepare('DELETE FROM devices WHERE id = ?').run(id);
    if (purge) {
      for (const t of ['readings', 'frames', 'alarms', 'commands', 'locations', 'maintenance']) this.db.prepare(`DELETE FROM ${t} WHERE device_id = ?`).run(id);
    }
  }

  setPhoto(id, name) {
    this.db.prepare('UPDATE devices SET photo = ? WHERE id = ?').run(name, id);
  }

  projects() {
    return this.db.prepare("SELECT name AS p FROM projects UNION SELECT DISTINCT project FROM devices WHERE project IS NOT NULL AND project <> '' ORDER BY p").all().map((r) => r.p).filter((p) => inScope(p));
  }

  /** 运行信息 */
  deviceRuntime(id) {
    const dev = this.getDevice(id);
    if (!dev) return null;
    const f = this.db.prepare("SELECT count(*) total, sum(ok) ok, min(received_at) first, max(received_at) last, sum(record_count) records FROM frames WHERE device_id = ? AND direction = 'up'").get(id);
    const down = this.db.prepare("SELECT count(*) c FROM frames WHERE device_id = ? AND direction = 'down'").get(id).c;
    const recent = this.db.prepare("SELECT received_at t FROM frames WHERE device_id = ? AND direction = 'up' AND ok = 1 ORDER BY received_at DESC LIMIT 50").all(id).map((r) => r.t);
    let avgUpload = null;
    if (recent.length > 1) avgUpload = Math.round((recent[0] - recent[recent.length - 1]) / (recent.length - 1) / 1000);
    const readings = this.db.prepare('SELECT count(*) c FROM readings WHERE device_id = ?').get(id).c;
    const alarms = this.db.prepare('SELECT count(*) total, sum(status = 0) pending FROM alarms WHERE device_id = ?').get(id);
    return {
      battery: dev.battery, signal: dev.signal, minSignal: dev.minSignal,
      uploads: f.total, uploadsOk: f.ok ?? 0, successRate: f.total ? (f.ok ?? 0) / f.total : null,
      downlinks: down, readings, records: f.records ?? 0,
      firstUpload: f.first, lastUpload: f.last, avgUploadSec: avgUpload,
      interval: dev.interval, recordCount: dev.recordCount,
      expectedUploadSec: dev.interval ? dev.interval * Math.max(1, dev.recordCount || 1) : null,
      runDays: dev.firstSeen ? Math.max(0, (Date.now() - dev.firstSeen) / 86400000) : null,
      alarms: alarms.total, pendingAlarms: alarms.pending ?? 0,
      transport: dev.transport, remote: dev.remote, lastUtc: dev.lastUtc,
    };
  }

  /** 设备轨迹 */
  locations(id, { limit = 200 } = {}) {
    return this.db.prepare('SELECT ts, lat, lng, source, address FROM locations WHERE device_id = ? ORDER BY ts DESC LIMIT ?').all(id, Math.min(2000, Number(limit) || 200));
  }

  // ---------------- 维保记录 ----------------

  maintenance({ deviceId, type, from, to, page = 1, size = 20 } = {}) {
    const sc = scopeSql('m.device_id');
    const where = [sc.sql];
    const args = [...sc.args];
    if (deviceId) { where.push('m.device_id LIKE ?'); args.push(`%${deviceId}%`); }
    if (type) { where.push('m.type = ?'); args.push(type); }
    if (from) { where.push('m.ts >= ?'); args.push(toMs(from)); }
    if (to) { where.push('m.ts <= ?'); args.push(toMs(to)); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    size = Math.min(5000, Math.max(1, Number(size) || 20));
    page = Math.max(1, Number(page) || 1);
    const total = this.db.prepare(`SELECT count(*) c FROM maintenance m ${w}`).get(...args).c;
    const items = this.db.prepare(`SELECT m.*, d.name device_name, d.model FROM maintenance m LEFT JOIN devices d ON d.id = m.device_id ${w} ORDER BY m.ts DESC, m.id DESC LIMIT ? OFFSET ?`)
      .all(...args, size, (page - 1) * size)
      .map((r) => ({ id: r.id, deviceId: r.device_id, deviceName: r.device_name, model: r.model, type: r.type, oldValue: r.old_value, newValue: r.new_value, note: r.note, ts: r.ts, auto: !!r.auto, operator: r.operator }));
    const counts = Object.fromEntries(this.db.prepare(`SELECT type, count(*) n FROM maintenance m WHERE ${sc.sql} GROUP BY type`).all(...sc.args).map((r) => [r.type, r.n]));
    return { total, page, size, items, counts };
  }

  addMaintenance(b, now = Date.now()) {
    const deviceId = String(b?.deviceId ?? '').trim();
    if (!this.getDevice(deviceId)) throw badRequest('设备不存在');
    const type = String(b.type ?? '').trim();
    if (!MAINT_TYPES.includes(type)) throw badRequest(`维保类型应为：${MAINT_TYPES.join(' / ')}`);
    const ts = b.ts ? toMs(b.ts) : now;
    const clip = (v) => (v == null || v === '' ? null : String(v).slice(0, 200));
    let oldValue = clip(b.oldValue);
    const newValue = clip(b.newValue);
    if (type === '更换SIM卡') {
      if (!newValue) throw badRequest('请填写新 ICCID');
      const cur = this.db.prepare('SELECT iccid FROM devices WHERE id = ?').get(deviceId).iccid;
      oldValue = oldValue ?? cur ?? null;
      this.db.prepare('UPDATE devices SET iccid = ? WHERE id = ?').run(newValue, deviceId);
    }
    const r = this.db.prepare('INSERT INTO maintenance (device_id, type, old_value, new_value, note, ts, auto, operator) VALUES (?, ?, ?, ?, ?, ?, 0, ?)').run(deviceId, type, oldValue, newValue, clip(b.note), ts, currentOperator());
    return Number(r.lastInsertRowid);
  }

  deleteMaintenance(id) {
    const sc = scopeSql('device_id');
    this.db.prepare(`DELETE FROM maintenance WHERE id = ? AND ${sc.sql}`).run(id, ...sc.args);
  }

  groups() {
    const sc = scopeSql('id');
    return this.db.prepare(`SELECT DISTINCT group_name AS g FROM devices WHERE group_name IS NOT NULL AND group_name <> '' AND ${sc.sql} ORDER BY g`).all(...sc.args).map((r) => r.g);
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
    const sc = scopeSql('device_id');
    const where = [sc.sql];
    const args = [...sc.args];
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

  alarmWhere(q = {}) {
    const sc = scopeSql('a.device_id');
    const where = [sc.sql];
    const args = [...sc.args];
    if (q.deviceId) { where.push('a.device_id = ?'); args.push(q.deviceId); }
    if (q.keyword) { where.push('(a.device_id LIKE ? OR d.name LIKE ? OR d.location LIKE ?)'); const k = `%${q.keyword}%`; args.push(k, k, k); }
    if (q.status === 'open') where.push('a.end_ts IS NULL');
    if (q.status === 'closed') where.push('a.end_ts IS NOT NULL');
    if (q.handle !== undefined && q.handle !== '' && q.handle !== 'all') { where.push('a.status = ?'); args.push(Number(q.handle)); }
    if (q.acked === '1') where.push('a.status > 0');
    if (q.acked === '0') where.push('a.status = 0');
    if (q.label) { where.push('a.label = ?'); args.push(q.label); }
    if (q.level) { where.push('a.level = ?'); args.push(q.level); }
    if (q.type !== undefined && q.type !== '') { where.push('a.type_code = ?'); args.push(Number(q.type)); }
    if (q.group) { where.push('d.group_name = ?'); args.push(q.group); }
    if (q.from) { where.push('a.start_ts >= ?'); args.push(toMs(q.from)); }
    if (q.to) { where.push('a.start_ts <= ?'); args.push(toMs(q.to)); }
    return { w: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
  }

  mapAlarm(r, devMap, now = Date.now()) {
    const dev = devMap?.get(r.device_id);
    const tz = this.tzSec * 1000;
    const day = new Date(r.start_ts + tz).toISOString().slice(0, 10).replace(/-/g, '');
    return {
      id: r.id,
      code: `ALM${day}${String(r.id).padStart(6, '0')}`,
      deviceId: r.device_id, deviceName: r.device_name, typeCode: r.type_code, typeName: r.type_name, location: r.location,
      bit: r.bit, label: r.label, level: r.level || 'high',
      startTs: r.start_ts, endTs: r.end_ts, open: r.end_ts == null,
      duration: r.end_ts ? r.end_ts - r.start_ts : now - r.start_ts,
      snapshot: json(r.snapshot, {}), thresholds: json(r.thresholds, []),
      status: r.status ?? 0, acked: (r.status ?? 0) > 0, handledAt: r.handled_at, ackedAt: r.handled_at, note: r.note, handledBy: r.handled_by,
      deviceStatus: dev?.status ?? null, deviceRealtime: dev?.realtime ?? null, lat: dev?.lat ?? null, lng: dev?.lng ?? null,
      owner: dev?.owner ?? null, contact: dev?.contact ?? null,
    };
  }

  alarms(q = {}) {
    const { w, args } = this.alarmWhere(q);
    const size = Math.min(5000, Math.max(1, Number(q.size) || 20));
    const page = Math.max(1, Number(q.page) || 1);
    const total = this.db.prepare(`SELECT count(*) c FROM alarms a LEFT JOIN devices d ON d.id = a.device_id ${w}`).get(...args).c;
    const rows = this.db.prepare(`SELECT a.*, d.name AS device_name, d.type_name, d.location FROM alarms a LEFT JOIN devices d ON d.id = a.device_id ${w} ORDER BY a.start_ts DESC, a.id DESC LIMIT ? OFFSET ?`)
      .all(...args, size, (page - 1) * size);
    const devMap = new Map(this.allDevices().map((d) => [d.id, d]));
    return { total, page, size, items: rows.map((r) => this.mapAlarm(r, devMap)) };
  }

  /** 报警汇总：处理状态、严重程度、上下限，以及告警设备数 */
  alarmSummary() {
    const sc = scopeSql('device_id');
    const s = this.db.prepare(`SELECT count(*) total, sum(status = 0) pending, sum(status = 1) recorded, sum(status = 2) handled,
      count(DISTINCT CASE WHEN status = 0 THEN device_id END) devices,
      sum(status = 0 AND level = 'high') high, sum(status = 0 AND level = 'mid') mid, sum(status = 0 AND level = 'low') low,
      sum(status = 0 AND label LIKE '%高报警') upper, sum(status = 0 AND label LIKE '%低报警') lower,
      sum(end_ts IS NULL) open
      FROM alarms WHERE ${sc.sql}`).get(...sc.args);
    const n = (v) => v ?? 0;
    return {
      total: n(s.total), pending: n(s.pending), recorded: n(s.recorded), handled: n(s.handled), devices: n(s.devices), open: n(s.open),
      levels: { high: n(s.high), mid: n(s.mid), low: n(s.low) },
      upper: n(s.upper), lower: n(s.lower),
    };
  }

  /** 处理报警：status 1 已记录 / 2 已处理（也可退回 0） */
  handleAlarms(ids, status, note, now = Date.now()) {
    const list = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Number.isInteger);
    if (!list.length) throw badRequest('请选择报警');
    status = Number(status);
    if (![0, 1, 2].includes(status)) throw badRequest('处理状态应为 0 / 1 / 2');
    const n = note == null || note === '' ? null : String(note).slice(0, 500);
    const sc = scopeSql('device_id');
    const stmt = this.db.prepare(`UPDATE alarms SET status = ?, acked = ?, handled_at = ?, acked_at = ?, note = COALESCE(?, note), handled_by = ? WHERE id = ? AND ${sc.sql}`);
    const by = status > 0 ? currentOperator() : null;
    this.db.exec('BEGIN');
    for (const id of list) stmt.run(status, status > 0 ? 1 : 0, status > 0 ? now : null, status > 0 ? now : null, n, by, id, ...sc.args);
    this.db.exec('COMMIT');
    return list.length;
  }

  ackAlarm(id, note) {
    const cur = this.db.prepare('SELECT status FROM alarms WHERE id = ?').get(id);
    this.handleAlarms([id], Math.max(1, cur?.status ?? 1), note);
  }

  /** 将未处理的报警全部标为已记录（或已处理） */
  ackAll(deviceId, status = 1, note) {
    const sc = scopeSql('device_id');
    const rows = deviceId
      ? this.db.prepare(`SELECT id FROM alarms WHERE status = 0 AND device_id = ? AND ${sc.sql}`).all(deviceId, ...sc.args)
      : this.db.prepare(`SELECT id FROM alarms WHERE status = 0 AND ${sc.sql}`).all(...sc.args);
    if (rows.length) this.handleAlarms(rows.map((r) => r.id), status, note);
    return rows.length;
  }

  alarmsCsv(q = {}) {
    const { items } = this.alarms({ ...q, page: 1, size: 5000 });
    const STATUS = ['未处理', '已记录', '已处理'];
    const LEVEL = { high: '高', mid: '中', low: '低' };
    const fmt = (ms) => (ms ? new Date(ms + this.tzSec * 1000).toISOString().replace('T', ' ').slice(0, 19) : '');
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const head = ['告警编号', '设备编号', '设备名称', '设备类型', '安装位置', '告警类型', '级别', '处理状态', '告警时间', '恢复时间', '触发时数据', '处理说明', '处理人'];
    const lines = [head.join(',')];
    for (const a of items) {
      lines.push([a.code, a.deviceId, a.deviceName, a.typeName, a.location, a.label, LEVEL[a.level], STATUS[a.status], fmt(a.startTs), fmt(a.endTs),
        Object.entries(a.snapshot).map(([k, v]) => `${k}=${v}`).join(' '), a.note, a.handledBy].map(esc).join(','));
    }
    return '\ufeff' + lines.join('\n');
  }

  /** 最近 N 天按报警类型的每日次数 */
  alarmTrend(days = 30, now = Date.now()) {
    days = Math.min(366, Math.max(1, Number(days) || 30));
    const tz = this.config.tzOffsetHours * 3600;
    const since = this.startOfDay(now, days - 1);
    const sc = scopeSql('device_id');
    const rows = this.db.prepare(`SELECT date(start_ts / 1000 + ${tz}, 'unixepoch') d, label, count(*) n FROM alarms WHERE start_ts >= ? AND ${sc.sql} GROUP BY d, label`).all(since, ...sc.args);
    const dates = Array.from({ length: days }, (_, i) => new Date(since + i * 86400000 + tz * 1000).toISOString().slice(0, 10));
    const totals = new Map();
    for (const r of rows) totals.set(r.label, (totals.get(r.label) || 0) + r.n);
    const labels = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
    const series = labels.map((label) => {
      const m = new Map(rows.filter((r) => r.label === label).map((r) => [r.d, r.n]));
      return { name: label, total: totals.get(label), data: dates.map((d) => m.get(d) ?? 0) };
    });
    return { dates, series };
  }

  // ---------------- 下行命令（远程配置） ----------------

  commands(deviceId) {
    return this.commandList({ deviceId, size: 100 }).items;
  }

  commandList({ deviceId, status, keyword, page = 1, size = 20 } = {}) {
    const sc = scopeSql('c.device_id');
    const where = [sc.sql];
    const args = [...sc.args];
    if (deviceId) { where.push('c.device_id = ?'); args.push(deviceId); }
    if (status) { where.push('c.status = ?'); args.push(status); }
    if (keyword) { where.push('(c.device_id LIKE ? OR d.name LIKE ? OR c.note LIKE ?)'); const k = `%${keyword}%`; args.push(k, k, k); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    size = Math.min(500, Math.max(1, Number(size) || 20));
    page = Math.max(1, Number(page) || 1);
    const total = this.db.prepare(`SELECT count(*) c FROM commands c LEFT JOIN devices d ON d.id = c.device_id ${w}`).get(...args).c;
    const devMap = new Map(this.allDevices().map((d) => [d.id, d]));
    const items = this.db.prepare(`SELECT c.*, d.name device_name FROM commands c LEFT JOIN devices d ON d.id = c.device_id ${w} ORDER BY c.id DESC LIMIT ? OFFSET ?`)
      .all(...args, size, (page - 1) * size).map((r) => {
        const dev = devMap.get(r.device_id);
        return {
          id: r.id, deviceId: r.device_id, deviceName: r.device_name, typeName: dev?.typeName ?? null, model: dev?.model ?? null,
          deviceStatus: dev?.status ?? null, lastSeen: dev?.lastSeen ?? null, transport: dev?.transport ?? null,
          params: r.params_hex, note: r.note, status: r.status, createdAt: r.created_at, createdBy: r.created_by,
          sentAt: r.sent_at, sentVia: r.sent_via, ackAt: r.ack_at, ackParams: r.ack_hex,
        };
      });
    const counts = Object.fromEntries(this.db.prepare(`SELECT status, count(*) n FROM commands c WHERE ${sc.sql} GROUP BY status`).all(...sc.args).map((r) => [r.status, r.n]));
    return { total, page, size, items, counts };
  }

  addCommand(deviceId, paramsHex, note) {
    const clean = String(paramsHex || '').replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    if (!clean || clean.length % 2) throw badRequest('参数设置数据单元必须是偶数长度的十六进制');
    if (clean.length / 2 > 255) throw badRequest('参数设置数据单元最多 255 字节');
    if (!this.getDevice(deviceId)) throw Object.assign(new Error(`设备 ${deviceId} 不存在或无权访问`), { status: 404 });
    const r = this.db.prepare('INSERT INTO commands (device_id, params_hex, note, created_at, created_by) VALUES (?, ?, ?, ?, ?)').run(deviceId, clean, note ?? null, Date.now(), currentOperator());
    return Number(r.lastInsertRowid);
  }

  addCommands(deviceIds, paramsHex, note) {
    const ids = [...new Set((deviceIds || []).map((x) => String(x).trim()).filter(Boolean))];
    if (!ids.length) throw badRequest('请选择设备');
    if (ids.length > 1000) throw badRequest('单次最多 1000 台设备');
    this.db.exec('BEGIN');
    try {
      const out = ids.map((id) => this.addCommand(id, paramsHex, note));
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  cancelCommand(id) {
    const sc = scopeSql('device_id');
    return Number(this.db.prepare(`UPDATE commands SET status = 'cancelled' WHERE id = ? AND status = 'pending' AND ${sc.sql}`).run(id, ...sc.args).changes);
  }

  deleteCommands(ids) {
    const sc = scopeSql('device_id');
    const stmt = this.db.prepare(`DELETE FROM commands WHERE id = ? AND status IN ('cancelled', 'acked', 'sent') AND ${sc.sql}`);
    let n = 0;
    for (const id of ids || []) n += Number(stmt.run(Number(id), ...sc.args).changes);
    return n;
  }

  // ---------------- 维护 ----------------

  dataSummary() {
    const c = (sql) => this.db.prepare(sql).get().c;
    return {
      devices: c('SELECT count(*) c FROM devices'),
      readings: c('SELECT count(*) c FROM readings'),
      frames: c('SELECT count(*) c FROM frames'),
      alarms: c('SELECT count(*) c FROM alarms'),
      commands: c('SELECT count(*) c FROM commands'),
      oldestReading: this.db.prepare('SELECT min(ts) v FROM readings').get().v,
      dbBytes: this.db.prepare('SELECT page_count * page_size v FROM pragma_page_count(), pragma_page_size()').get().v,
    };
  }

  /** scope=all 清空全部（含设备档案）；scope=data 仅清空数据、报文、报警与命令，保留设备档案 */
  purge(scope) {
    const before = this.dataSummary();
    this.db.exec('BEGIN');
    try {
      for (const t of ['readings', 'frames', 'alarms', 'commands', 'locations', 'maintenance']) this.db.exec(`DELETE FROM ${t}`);
      if (scope === 'all') this.db.exec('DELETE FROM devices');
      else this.db.exec("UPDATE devices SET frame_count = 0, alarm_raw = 0, alarm_bits = '[]'");
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    try { this.db.exec('VACUUM'); } catch { /* 忽略 */ }
    return { deleted: before };
  }

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
