import { crcMatches } from './crc16.js';
import { getDeviceType, recordLength, alarmLength, SIZE } from './deviceTypes.js';

export const FRAME_HEAD = 0xa55a;
export const FRAME_TAIL = 0x55aa;
export const CMD_UPLINK = 0x00;
export const CMD_DOWNLINK = 0xff;
export const CMD_DEVICE_ACK = 0x04;

/** 上行帧固定头部长度：起始2+命令1+长度2+编号12+电量1+信号1+间隔2+条数2+类型1+报警状态1 */
export const UPLINK_HEADER_LEN = 25;
/** 固定尾部：UTC4 + CRC2 + 结尾2 */
const UPLINK_FIXED_TAIL = 8;

/** 表三 默认报警位含义 */
export const ALARM_BITS = {
  7: '第三传感器报警',
  6: '第二传感器高报警',
  5: '第二传感器低报警',
  4: '硬件异常',
  3: '传感器异常',
  2: '电量报警',
  1: '高报警',
  0: '低报警',
};

const POWER_MODE = { 0: '双供电', 1: '单电池供电', 2: '单外供电', 3: '保留' };

export function parseBattery(b) {
  const level = Math.min(100, (b & 0x1f) * 5);
  const modeCode = (b >> 5) & 0x03;
  return {
    raw: b,
    external: Boolean(b & 0x80),
    source: b & 0x80 ? '外供电' : '电池',
    modeCode,
    mode: POWER_MODE[modeCode],
    level,
  };
}

export function parseAlarmStatus(byte, def) {
  const labels = { ...ALARM_BITS, ...(def?.alarmNote ?? {}) };
  const active = [];
  for (let bit = 7; bit >= 0; bit--) {
    if (byte & (1 << bit)) active.push({ bit, label: labels[bit] });
  }
  return { raw: byte, active: active.length > 0, bits: active };
}

function readRaw(buf, off, type) {
  switch (type) {
    case 'u8': return buf.readUInt8(off);
    case 'i16': return buf.readInt16BE(off);
    case 'u16': return buf.readUInt16BE(off);
    case 'i32': return buf.readInt32BE(off);
    case 'u32': return buf.readUInt32BE(off);
    case 'f32': return buf.readFloatBE(off);
    case 'f64': return buf.readDoubleBE(off);
    default: throw new Error(`unknown type ${type}`);
  }
}

function decimals(scale) {
  if (scale >= 1) return 0;
  return Math.max(0, Math.ceil(-Math.log10(scale) - 1e-9));
}

/** 原始值 → 工程值 */
export function scaleValue(p, raw) {
  if (p.type === 'f32') return Number(raw.toPrecision(7));
  if (p.type === 'f64') return raw;
  if (p.kind !== 'num') return raw;
  const v = raw * p.scale;
  return Number(v.toFixed(decimals(p.scale)));
}

function decodeRecord(buf, off, def) {
  const values = {};
  for (const p of def.params) {
    values[p.key] = scaleValue(p, readRaw(buf, off, p.type));
    off += SIZE[p.type];
  }
  return values;
}

function decodeModbusRecord(buf, off, len) {
  const rec = buf.subarray(off, off + len);
  const out = { addr: rec[0], func: rec[1], n: rec[2], data: rec.subarray(3, 3 + rec[2]).toString('hex') };
  out.crc = rec.length >= 5 + rec[2] ? rec.readUInt16BE(3 + rec[2]).toString(16).padStart(4, '0') : null;
  // 默认按 16 位有符号寄存器展开，方便曲线显示
  const regs = {};
  for (let i = 0; i + 1 < rec[2]; i += 2) regs[`reg${i / 2}`] = rec.readInt16BE(3 + i);
  return { ...regs, _modbus: out };
}

/** 无法匹配类型表时的兜底：按 16 位有符号整数拆分 */
function genericDef(recLen) {
  const params = [];
  if (recLen === 1) params.push({ key: 'v0', name: '数值', type: 'u8', scale: 1, unit: '', kind: 'num' });
  else for (let i = 0; i < Math.floor(recLen / 2); i++) params.push({ key: `v${i}`, name: `参数${i + 1}`, type: 'i16', scale: 1, unit: '', kind: 'num' });
  return { params };
}

/**
 * 从帧总长反推报警参数长度和记录长度：
 *   total = 25 + alarmLen + (n+1)*recLen + 8
 */
function resolveLayout(total, count, def) {
  const body = total - UPLINK_HEADER_LEN - UPLINK_FIXED_TAIL;
  const warnings = [];
  if (def && def.special === 'modbus') {
    for (const a of [4, 6, 2, 8, 0]) {
      const rest = body - a;
      if (rest > 0 && rest % (count + 1) === 0) return { alarmLen: a, recLen: rest / (count + 1), recDef: null, modbus: true, warnings };
    }
    return { error: 'MODBUS 帧长度无法解析' };
  }
  if (def) {
    const recLen = recordLength(def);
    const expA = alarmLength(def);
    const a = body - (count + 1) * recLen;
    if (a === expA) return { alarmLen: a, recLen, recDef: def, warnings };
    // 记录长度符合但报警结构不同：按实际长度解析报警参数
    if (a >= 0 && a <= 32 && a % 2 === 0) {
      warnings.push(`报警参数长度 ${a} 字节与表四预期 ${expA} 字节不一致，已按实际长度解析`);
      return { alarmLen: a, recLen, recDef: def, warnings };
    }
    // 记录长度不符：以预期报警长度反推记录长度
    const rest = body - expA;
    if (rest > 0 && rest % (count + 1) === 0) {
      const rl = rest / (count + 1);
      warnings.push(`记录长度 ${rl} 字节与表二定义 ${recLen} 字节不一致，已按通用格式解析`);
      return { alarmLen: expA, recLen: rl, recDef: genericDef(rl), warnings };
    }
    return { error: `帧长度 ${total} 与设备类型 ${def.code} 的数据结构不匹配` };
  }
  // 未知类型：假设报警为 1 组 16 位
  for (const a of [4, 8, 0]) {
    const rest = body - a;
    if (rest > 0 && rest % (count + 1) === 0) {
      const rl = rest / (count + 1);
      warnings.push('未知设备类型，按 16 位整型通用格式解析');
      return { alarmLen: a, recLen: rl, recDef: genericDef(rl), warnings };
    }
  }
  return { error: '未知设备类型且帧长度无法推算' };
}

function decodeAlarmParams(buf, off, len, def, recDef) {
  const out = [];
  if (len === 0) return out;
  if (def?.special === 'modbus') {
    const names = ['MODBUS地址', '读取寄存器个数N/2', '读取寄存器起始地址', '波动报警值'];
    for (let i = 0; i * 2 < len; i++) out.push({ group: i + 1, key: `m${i}`, name: names[i] ?? `参数${i + 1}`, unit: '', value: buf.readUInt16BE(off + i * 2) });
    return out;
  }
  const params = recDef?.params?.length ? recDef.params : [{ key: 'v0', name: '参数1', type: 'i16', scale: 1, unit: '', kind: 'num' }];
  let o = off;
  const end = off + len;
  let g = 0;
  const expected = def ? alarmLength(def) === len : false;
  while (o < end) {
    let p = expected ? (params[g] ?? params[0]) : null;
    if (!p) p = { key: `g${g}`, name: `报警组${g + 1}`, type: 'i16', scale: params[g]?.scale ?? 1, unit: params[g]?.unit ?? '', kind: 'num' };
    const sz = SIZE[p.type];
    if (o + 2 * sz > end) break;
    out.push({
      group: g + 1,
      key: p.key,
      name: p.name,
      unit: p.unit,
      low: scaleValue(p, readRaw(buf, o, p.type)),
      high: scaleValue(p, readRaw(buf, o + sz, p.type)),
    });
    o += 2 * sz;
    g++;
  }
  return out;
}

function deviceIdOf(buf, off) {
  return buf.subarray(off, off + 12).toString('latin1').replace(/\0+$/, '').trim();
}

/**
 * 校验帧外框：起止标记、长度、CRC。
 * @returns {{ok:boolean, error?:string, crc?:object}}
 */
export function checkEnvelope(buf) {
  if (buf.length < 9) return { ok: false, error: '帧长度过短' };
  if (buf.readUInt16BE(0) !== FRAME_HEAD) return { ok: false, error: '帧起始标记错误' };
  const len = buf.readUInt16BE(3);
  if (len !== buf.length) return { ok: false, error: `帧总长度字段 ${len} 与实际长度 ${buf.length} 不一致` };
  if (buf.readUInt16BE(len - 2) !== FRAME_TAIL) return { ok: false, error: '帧结尾标记错误' };
  const crc = crcMatches(buf, 0, len - 4, buf[len - 4], buf[len - 3]);
  return { ok: true, crc };
}

/**
 * 解析上行数据帧（命令类型 0x00）。
 * @param {Buffer} buf 完整一帧
 * @param {{now?: number}} [opts]
 */
export function decodeUplink(buf) {
  const env = checkEnvelope(buf);
  const result = { ok: false, cmd: buf.length > 2 ? buf[2] : null, errors: [], warnings: [] };
  if (!env.ok) {
    result.errors.push(env.error);
    return result;
  }
  result.crc = { ok: env.crc.ok, order: env.crc.order, expected: env.crc.crc.toString(16).padStart(4, '0') };
  if (!env.crc.ok) result.errors.push('CRC 校验失败');
  if (buf.length < UPLINK_HEADER_LEN + UPLINK_FIXED_TAIL) {
    result.errors.push('上行帧长度不足');
    return result;
  }
  const total = buf.length;
  result.length = total;
  result.deviceId = deviceIdOf(buf, 5);
  result.battery = parseBattery(buf[17]);
  result.signal = buf.readInt8(18);
  result.interval = buf.readUInt16BE(19);
  result.count = buf.readUInt16BE(21);
  result.typeCode = buf[23];
  const def = getDeviceType(result.typeCode);
  result.typeName = def?.name ?? `未知类型(${result.typeCode})`;
  result.alarm = parseAlarmStatus(buf[24], def);

  const layout = resolveLayout(total, result.count, def);
  if (layout.error) {
    result.errors.push(layout.error);
    return result;
  }
  result.warnings.push(...layout.warnings);
  let off = UPLINK_HEADER_LEN;
  result.alarmParams = decodeAlarmParams(buf, off, layout.alarmLen, def, layout.recDef);
  off += layout.alarmLen;

  const readRec = () => {
    const v = layout.modbus ? decodeModbusRecord(buf, off, layout.recLen) : decodeRecord(buf, off, layout.recDef);
    off += layout.recLen;
    return v;
  };
  result.realtime = readRec();
  result.utc = buf.readUInt32BE(off);
  off += 4;
  result.records = [];
  for (let i = 0; i < result.count; i++) {
    // 缓存数据 1 为最早一条，n 为最新一条，最新一条的采集时间即 UTC 时间戳
    const ts = result.utc - (result.count - 1 - i) * result.interval;
    result.records.push({ ts, values: readRec() });
  }
  result.recordBytes = layout.recLen;
  result.generic = layout.recDef && layout.recDef !== def && !layout.modbus;
  result.ok = result.errors.length === 0;
  return result;
}

/** 解析平台下行帧(0xFF)或设备应答帧(0x04) */
export function decodeDownlink(buf) {
  const env = checkEnvelope(buf);
  const result = { ok: false, cmd: buf.length > 2 ? buf[2] : null, errors: [], warnings: [] };
  if (!env.ok) {
    result.errors.push(env.error);
    return result;
  }
  result.crc = { ok: env.crc.ok, order: env.crc.order, expected: env.crc.crc.toString(16).padStart(4, '0') };
  if (!env.crc.ok) result.errors.push('CRC 校验失败');
  if (buf.length < 27) {
    result.errors.push('下行帧长度不足');
    return result;
  }
  result.length = buf.length;
  result.deviceId = deviceIdOf(buf, 5);
  result.utc = buf.readUInt32BE(17);
  result.paramLength = buf.readUInt16BE(21);
  result.params = buf.subarray(23, 23 + result.paramLength).toString('hex');
  if (23 + result.paramLength + 4 !== buf.length) result.warnings.push('参数设置数据单元长度与帧长度不一致');
  result.ok = result.errors.length === 0;
  return result;
}

/** 根据命令类型自动选择解析方式 */
export function decodeFrame(buf) {
  if (buf.length >= 3 && (buf[2] === CMD_DOWNLINK || buf[2] === CMD_DEVICE_ACK)) {
    return { direction: buf[2] === CMD_DOWNLINK ? 'down' : 'ack', ...decodeDownlink(buf) };
  }
  return { direction: 'up', ...decodeUplink(buf) };
}

/** 把十六进制字符串（允许空格、0x 前缀）转为 Buffer */
export function hexToBuffer(hex) {
  const clean = String(hex).replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) throw new Error('十六进制字符串长度必须为偶数');
  return Buffer.from(clean, 'hex');
}
