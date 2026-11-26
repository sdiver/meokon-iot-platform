import { decodeFrame } from '../protocol/decoder.js';
import { buildDownlink } from '../protocol/encoder.js';
import { getDeviceType } from '../protocol/deviceTypes.js';
import { tx } from '../db/index.js';

/**
 * 报文接入：解析 → 入库（设备、原始报文、采集数据、报警事件）→ 生成下行应答。
 *
 * replyMode:
 *   always  —— UDP/TCP：每次上报都需要下行应答（无待下发命令时发送默认应答）
 *   command —— MQTT：仅在存在待下发命令时下发
 *   none    —— 电信 AEP / 移动 OneNET：运营商平台自动应答，这里不回复
 */
export class IngestService {
  constructor(db, config, bus) {
    this.db = db;
    this.config = config;
    this.bus = bus;
    this.stmt = {
      insertFrame: db.prepare(`INSERT INTO frames (device_id, received_at, direction, transport, remote, raw_hex, ok, crc_ok, error, type_code, record_count, alarm_raw)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
      upsertDevice: db.prepare(`INSERT INTO devices (id, type_code, type_name, first_seen, last_seen, last_utc, transport, remote,
          battery_raw, battery_level, power_source, power_mode, signal, interval_sec, record_count, alarm_raw, alarm_bits, alarm_params, realtime, frame_count, lat, lng)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          type_code = excluded.type_code, type_name = excluded.type_name, last_seen = excluded.last_seen, last_utc = excluded.last_utc,
          transport = excluded.transport, remote = excluded.remote, battery_raw = excluded.battery_raw, battery_level = excluded.battery_level,
          power_source = excluded.power_source, power_mode = excluded.power_mode, signal = excluded.signal, interval_sec = excluded.interval_sec,
          record_count = excluded.record_count, alarm_raw = excluded.alarm_raw, alarm_bits = excluded.alarm_bits,
          alarm_params = excluded.alarm_params, realtime = excluded.realtime, frame_count = devices.frame_count + 1,
          lat = COALESCE(excluded.lat, devices.lat), lng = COALESCE(excluded.lng, devices.lng)`),
      insertReading: db.prepare('INSERT OR IGNORE INTO readings (device_id, ts, vals, alarm_raw) VALUES (?, ?, ?, ?)'),
      openAlarms: db.prepare('SELECT id, bit FROM alarms WHERE device_id = ? AND end_ts IS NULL'),
      insertAlarm: db.prepare(`INSERT INTO alarms (device_id, type_code, bit, label, start_ts, snapshot, thresholds) VALUES (?, ?, ?, ?, ?, ?, ?)`),
      closeAlarm: db.prepare('UPDATE alarms SET end_ts = ? WHERE id = ?'),
      nextCommand: db.prepare("SELECT * FROM commands WHERE device_id = ? AND status = 'pending' ORDER BY id LIMIT 1"),
      markSent: db.prepare("UPDATE commands SET status = 'sent', sent_at = ?, sent_via = ? WHERE id = ?"),
      lastSent: db.prepare("SELECT id FROM commands WHERE device_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1"),
      markAcked: db.prepare("UPDATE commands SET status = 'acked', ack_at = ?, ack_hex = ? WHERE id = ?"),
    };
  }

  /**
   * @param {Buffer} buf 完整一帧
   * @param {{transport:string, remote?:string, replyMode?:'always'|'command'|'none', now?:number}} ctx
   * @returns {{decoded:object, reply:Buffer|null, frameId:number}}
   */
  handle(buf, ctx) {
    const now = ctx.now ?? Date.now();
    const decoded = decodeFrame(buf);
    const hex = buf.toString('hex');
    const err = decoded.errors.length ? decoded.errors.join('; ') : null;

    if (decoded.direction !== 'up') {
      const frameId = this.saveFrame(decoded, hex, ctx, now, err);
      if (decoded.direction === 'ack' && decoded.ok && decoded.deviceId) {
        const cmd = this.stmt.lastSent.get(decoded.deviceId);
        if (cmd) this.stmt.markAcked.run(now, decoded.params, cmd.id);
        this.bus.emit('command', { deviceId: decoded.deviceId, commandId: cmd?.id ?? null, status: 'acked', params: decoded.params });
      }
      return { decoded, reply: null, frameId };
    }

    if (!decoded.ok) {
      const frameId = this.saveFrame(decoded, hex, ctx, now, err);
      this.bus.emit('frame', { id: frameId, deviceId: decoded.deviceId ?? null, ok: false, error: err, transport: ctx.transport, at: now });
      return { decoded, reply: null, frameId };
    }

    let reply = null;
    let frameId;
    const newAlarms = [];
    const closedAlarms = [];
    tx(this.db, () => {
      frameId = this.saveFrame(decoded, hex, ctx, now, null);
      this.applyUplink(decoded, ctx, now, newAlarms, closedAlarms);
      reply = this.buildReply(decoded.deviceId, ctx, now);
    });

    this.bus.emit('frame', {
      id: frameId, deviceId: decoded.deviceId, ok: true, transport: ctx.transport, at: now,
      typeCode: decoded.typeCode, realtime: decoded.realtime, alarmRaw: decoded.alarm.raw, records: decoded.count,
    });
    for (const a of newAlarms) this.bus.emit('alarm', { ...a, state: 'open' });
    for (const a of closedAlarms) this.bus.emit('alarm', { ...a, state: 'closed' });
    return { decoded, reply, frameId };
  }

  saveFrame(d, hex, ctx, now, err) {
    const r = this.stmt.insertFrame.run(
      d.deviceId || null, now, d.direction ?? 'up', ctx.transport, ctx.remote ?? null, hex,
      d.ok ? 1 : 0, d.crc ? (d.crc.ok ? 1 : 0) : null, err,
      d.typeCode ?? null, d.count ?? null, d.alarm?.raw ?? null,
    );
    return Number(r.lastInsertRowid);
  }

  applyUplink(d, ctx, now, newAlarms, closedAlarms) {
    const nowSec = Math.floor(now / 1000);
    // 设备时间偏差过大时，以平台接收时间为准
    let shift = 0;
    if (Math.abs(nowSec - d.utc) > this.config.maxClockSkewSec) {
      shift = nowSec - d.utc;
      d.warnings.push(`设备时间与平台相差 ${shift} 秒，已按平台接收时间校正`);
    }
    const def = getDeviceType(d.typeCode);
    let lat = null;
    let lng = null;
    if (def?.geo) {
      const [kLng, kLat] = def.geo;
      const vLng = d.realtime[kLng];
      const vLat = d.realtime[kLat];
      if (Number.isFinite(vLng) && Number.isFinite(vLat) && (vLng !== 0 || vLat !== 0) && Math.abs(vLat) <= 90 && Math.abs(vLng) <= 180) {
        lng = vLng;
        lat = vLat;
      }
    }
    this.stmt.upsertDevice.run(
      d.deviceId, d.typeCode, d.typeName, now, now, d.utc + shift, ctx.transport, ctx.remote ?? null,
      d.battery.raw, d.battery.level, d.battery.source, d.battery.mode, d.signal, d.interval, d.count,
      d.alarm.raw, JSON.stringify(d.alarm.bits), JSON.stringify(d.alarmParams), JSON.stringify(d.realtime), lat, lng,
    );

    const stripMeta = (v) => {
      if (!v._modbus) return v;
      const { _modbus, ...rest } = v;
      return rest;
    };
    if (d.records.length === 0) {
      this.stmt.insertReading.run(d.deviceId, d.utc + shift, JSON.stringify(stripMeta(d.realtime)), d.alarm.raw);
    } else {
      d.records.forEach((r, i) => {
        const last = i === d.records.length - 1;
        this.stmt.insertReading.run(d.deviceId, r.ts + shift, JSON.stringify(stripMeta(r.values)), last ? d.alarm.raw : 0);
      });
    }

    // 报警事件：按报警位跟踪开始 / 结束
    const open = this.stmt.openAlarms.all(d.deviceId);
    const openBits = new Map(open.map((a) => [a.bit, a.id]));
    const activeBits = new Map(d.alarm.bits.map((b) => [b.bit, b.label]));
    for (const [bit, label] of activeBits) {
      if (openBits.has(bit)) continue;
      const r = this.stmt.insertAlarm.run(d.deviceId, d.typeCode, bit, label, now, JSON.stringify(stripMeta(d.realtime)), JSON.stringify(d.alarmParams));
      newAlarms.push({ id: Number(r.lastInsertRowid), deviceId: d.deviceId, bit, label, at: now, typeCode: d.typeCode });
    }
    for (const [bit, id] of openBits) {
      if (activeBits.has(bit)) continue;
      this.stmt.closeAlarm.run(now, id);
      closedAlarms.push({ id, deviceId: d.deviceId, bit, at: now });
    }
  }

  buildReply(deviceId, ctx, now) {
    const mode = ctx.replyMode ?? 'always';
    if (mode === 'none') return null;
    const cmd = this.stmt.nextCommand.get(deviceId);
    if (cmd) {
      this.stmt.markSent.run(now, ctx.transport, cmd.id);
      this.bus.emit('command', { deviceId, commandId: cmd.id, status: 'sent' });
      return buildDownlink(deviceId, { utc: Math.floor(now / 1000), params: cmd.params_hex });
    }
    if (mode === 'always') return buildDownlink(deviceId, { utc: Math.floor(now / 1000) });
    return null;
  }

  /** 记录平台发出的下行帧 */
  logDownlink(buf, ctx) {
    const d = decodeFrame(buf);
    return this.saveFrame(d, buf.toString('hex'), ctx, ctx.now ?? Date.now(), null);
  }
}
