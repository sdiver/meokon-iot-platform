import { crc16Modbus, crcBytes } from './crc16.js';
import { getDeviceType, SIZE, alarmLength } from './deviceTypes.js';
import { FRAME_HEAD, FRAME_TAIL, CMD_DOWNLINK, CMD_UPLINK } from './decoder.js';

function writeRaw(buf, off, type, v) {
  switch (type) {
    case 'u8': buf.writeUInt8(v & 0xff, off); break;
    case 'i16': buf.writeInt16BE(clamp(Math.round(v), -32768, 32767), off); break;
    case 'u16': buf.writeUInt16BE(clamp(Math.round(v), 0, 0xffff), off); break;
    case 'i32': buf.writeInt32BE(clamp(Math.round(v), -2147483648, 2147483647), off); break;
    case 'u32': buf.writeUInt32BE(clamp(Math.round(v), 0, 0xffffffff), off); break;
    case 'f32': buf.writeFloatBE(v, off); break;
    case 'f64': buf.writeDoubleBE(v, off); break;
    default: throw new Error(`unknown type ${type}`);
  }
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 工程值 → 原始值 */
function unscale(p, v) {
  if (p.type === 'f32' || p.type === 'f64' || p.kind !== 'num') return Number(v);
  return Number(v) / p.scale;
}

function idBytes(deviceId) {
  const b = Buffer.alloc(12, 0x30);
  Buffer.from(String(deviceId).slice(0, 12), 'latin1').copy(b);
  return b;
}

function finish(buf) {
  buf.writeUInt16BE(FRAME_HEAD, 0);
  buf.writeUInt16BE(buf.length, 3);
  const crc = crc16Modbus(buf, 0, buf.length - 4);
  const [a, b] = crcBytes(crc);
  buf[buf.length - 4] = a;
  buf[buf.length - 3] = b;
  buf.writeUInt16BE(FRAME_TAIL, buf.length - 2);
  return buf;
}

/**
 * 构造平台下行帧（默认应答 / 参数设置）。
 * @param {string} deviceId
 * @param {{utc?: number, params?: Buffer|string, cmd?: number}} [opts]
 */
export function buildDownlink(deviceId, opts = {}) {
  const params = opts.params ? (Buffer.isBuffer(opts.params) ? opts.params : Buffer.from(String(opts.params).replace(/\s+/g, ''), 'hex')) : Buffer.alloc(0);
  const utc = opts.utc ?? Math.floor(Date.now() / 1000);
  const buf = Buffer.alloc(2 + 1 + 2 + 12 + 4 + 2 + params.length + 2 + 2);
  buf[2] = opts.cmd ?? CMD_DOWNLINK;
  idBytes(deviceId).copy(buf, 5);
  buf.writeUInt32BE(utc >>> 0, 17);
  buf.writeUInt16BE(params.length, 21);
  params.copy(buf, 23);
  return finish(buf);
}

/** 读取所有配置命令的参数单元（文档范例 ff00） */
export const READ_ALL_CONFIG = 'ff00';

/** 电量状态字节 */
export function encodeBattery({ external = false, modeCode = 1, level = 100 } = {}) {
  return ((external ? 1 : 0) << 7) | ((modeCode & 3) << 5) | (Math.round(clamp(level, 0, 155) / 5) & 0x1f);
}

/**
 * 构造上行数据帧（用于设备模拟器与测试）。
 * @param {object} f
 * @param {string} f.deviceId
 * @param {number} f.typeCode
 * @param {number} [f.battery] 电量状态原始字节
 * @param {number} [f.signal] dBm
 * @param {number} [f.interval] 秒
 * @param {number} [f.alarmStatus]
 * @param {Array<{low:number,high:number}>} [f.alarmParams] 工程值
 * @param {Record<string,number>} f.realtime 工程值
 * @param {number} [f.utc]
 * @param {Array<Record<string,number>>} [f.records] 最早 → 最新
 */
export function buildUplink(f) {
  const def = getDeviceType(f.typeCode);
  if (!def || def.special) throw new Error(`不支持构造类型 ${f.typeCode} 的上行帧`);
  const recLen = def.params.reduce((s, p) => s + SIZE[p.type], 0);
  const records = f.records ?? [];
  const aLen = alarmLength(def);
  const total = 25 + aLen + recLen * (records.length + 1) + 8;
  const buf = Buffer.alloc(total);
  buf[2] = CMD_UPLINK;
  idBytes(f.deviceId).copy(buf, 5);
  buf[17] = f.battery ?? encodeBattery();
  buf.writeInt8(clamp(Math.round(f.signal ?? -70), -128, 127), 18);
  buf.writeUInt16BE(f.interval ?? 60, 19);
  buf.writeUInt16BE(records.length, 21);
  buf[23] = f.typeCode;
  buf[24] = f.alarmStatus ?? 0;
  let off = 25;
  for (let g = 0; g < def.alarmGroups; g++) {
    const p = def.params[g] ?? def.params[0];
    const a = f.alarmParams?.[g] ?? { low: 0, high: 0 };
    writeRaw(buf, off, p.type, unscale(p, a.low));
    writeRaw(buf, off + SIZE[p.type], p.type, unscale(p, a.high));
    off += 2 * SIZE[p.type];
  }
  const writeRec = (vals) => {
    for (const p of def.params) {
      writeRaw(buf, off, p.type, unscale(p, vals?.[p.key] ?? 0));
      off += SIZE[p.type];
    }
  };
  writeRec(f.realtime);
  buf.writeUInt32BE((f.utc ?? Math.floor(Date.now() / 1000)) >>> 0, off);
  off += 4;
  for (const r of records) writeRec(r);
  return finish(buf);
}
