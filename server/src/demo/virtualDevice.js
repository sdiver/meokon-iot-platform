import { getDeviceType } from '../protocol/deviceTypes.js';
import { buildUplink, encodeBattery } from '../protocol/encoder.js';

/** 按参数 key / 单位给出一个合理的基准值和波动幅度 */
function profile(p) {
  const k = p.key;
  const u = p.unit;
  if (/^t\d|temp/.test(k)) return { base: 22, amp: 6 };
  if (k === 'hum') return { base: 60, amp: 15 };
  if (u === 'MPa') return { base: 0.45, amp: 0.12 };
  if (u === 'kPa') return { base: 50, amp: 15 };
  if (u === 'Pa') return { base: 300, amp: 80 };
  if (/level|probe|ultra|distance/.test(k)) return { base: u === 'mm' ? 800 : u === 'cm' ? 150 : 2.2, amp: u === 'mm' ? 200 : u === 'cm' ? 40 : 0.6 };
  if (k === 'ph') return { base: 7.2, amp: 0.6 };
  if (k === 'lel') return { base: 3, amp: 3 };
  if (/pm1|pm25/.test(k)) return { base: 35, amp: 25 };
  if (k === 'pm10') return { base: 60, amp: 30 };
  if (k === 'co2') return { base: 600, amp: 200 };
  if (k === 'noise') return { base: 55, amp: 15 };
  if (k === 'tilt') return { base: 2, amp: 2 };
  if (k === 'flow' || k === 'stdFlow' || k === 'workFlow') return { base: 12, amp: 6 };
  if (k === 'velocity') return { base: 1.2, amp: 0.5 };
  if (/Total|total|energy/.test(k)) return { base: 1000, amp: 0, inc: 0.8 };
  if (/^u[abc]$/.test(k)) return { base: 220, amp: 6 };
  if (/^i[abc]$/.test(k)) return { base: 12, amp: 5 };
  if (k === 'power') return { base: 7.5, amp: 2 };
  if (k === 'pf') return { base: 0.92, amp: 0.04 };
  if (/^ai\d/.test(k)) return { base: 12, amp: 6 };
  if (k === 'lux') return { base: 3000, amp: 2500 };
  if (k === 'cod') return { base: 30, amp: 10 };
  if (k === 'nh3n' || k === 'no3n') return { base: 1.5, amp: 0.8 };
  if (k === 'do') return { base: 7, amp: 1.5 };
  if (k === 'turbidity') return { base: 5, amp: 3 };
  if (k === 'ec') return { base: 450, amp: 100 };
  if (k === 'vibration') return { base: 2.5, amp: 1.5 };
  if (k === 'water' || k === 'switch' || k === 'cover') return { base: 0, amp: 0 };
  if (k === 'count') return { base: 0, amp: 0, inc: 0.3 };
  return { base: 50, amp: 20 };
}

let seq = 0;
const rand = (a, b) => a + Math.random() * (b - a);

export class VirtualDevice {
  /**
   * @param {object} o
   * @param {string} o.id 12 位编号
   * @param {number} o.typeCode
   * @param {number} [o.interval] 采集间隔秒
   * @param {number} [o.batch] 每次上报包含的缓存记录条数
   * @param {boolean} [o.external] 是否外供电
   */
  constructor({ id, typeCode, interval = 300, batch = 3, external = false, signal }) {
    this.def = getDeviceType(typeCode);
    if (!this.def || this.def.special) throw new Error(`模拟器不支持类型 ${typeCode}`);
    this.id = id;
    this.typeCode = typeCode;
    this.interval = interval;
    this.batch = batch;
    this.external = external;
    this.battery = external ? 100 : Math.round(rand(35, 100));
    this.signal = signal ?? Math.round(rand(-108, -60));
    this.phase = Math.random() * Math.PI * 2;
    this.seed = seq++;
    this.acc = {};
    this.buffer = [];
    this.alarmProb = Math.random() < 0.3 ? 0.08 : 0.01;
    this.spike = 0;
    // 报警阈值：基准 ± 1.6 倍幅度
    this.thresholds = [];
    for (let g = 0; g < this.def.alarmGroups; g++) {
      const p = this.def.params[g] ?? this.def.params[0];
      const pr = profile(p);
      const span = Math.max(pr.amp * 1.6, Math.abs(pr.base) * 0.3, 1 * (p.scale || 1));
      this.thresholds.push({ low: round(pr.base - span, p), high: round(pr.base + span, p) });
    }
  }

  /** 生成 ts 时刻的数据 */
  sample(ts) {
    const v = {};
    const day = ((ts % 86400) / 86400) * Math.PI * 2;
    if (this.spike > 0) this.spike--;
    else if (Math.random() < this.alarmProb / 4) this.spike = Math.round(rand(2, 8));
    for (const p of this.def.params) {
      if (p.kind === 'bits') {
        v[p.key] = Math.random() < 0.1 ? Math.floor(Math.random() * 2 ** Math.min(p.bits, 16)) : (this.acc[p.key] ??= (1 << (this.seed % p.bits)));
        continue;
      }
      if (p.kind === 'enum') {
        v[p.key] = Number(Object.keys(p.enum)[0]);
        continue;
      }
      const pr = profile(p);
      if (p.key === 'lng') { v[p.key] = 121.47 + (this.seed % 10) * 0.02; continue; }
      if (p.key === 'lat') { v[p.key] = 31.23 + (this.seed % 7) * 0.015; continue; }
      if (pr.inc) {
        this.acc[p.key] = (this.acc[p.key] ?? pr.base) + pr.inc * rand(0.5, 1.5) * (this.interval / 300);
        v[p.key] = round(this.acc[p.key], p);
        continue;
      }
      let x = pr.base + pr.amp * 0.7 * Math.sin(day + this.phase) + pr.amp * 0.3 * (Math.random() - 0.5);
      if (this.spike > 0 && p === this.def.params[0]) x = pr.base + pr.amp * 2.2;
      v[p.key] = round(x, p);
    }
    return v;
  }

  alarmStatus(v) {
    let s = 0;
    this.thresholds.forEach((th, g) => {
      const p = this.def.params[g] ?? this.def.params[0];
      const x = v[p.key];
      if (typeof x !== 'number' || p.kind !== 'num') return;
      if (g === 0) {
        if (x < th.low) s |= 1;
        if (x > th.high) s |= 2;
      } else if (g === 1) {
        if (x < th.low) s |= 1 << 5;
        if (x > th.high) s |= 1 << 6;
      }
    });
    if (!this.external && this.battery <= 20) s |= 1 << 2;
    return s;
  }

  /** 推进到 ts，若累计到一批则返回待发送的上行帧 */
  tick(ts) {
    this.buffer.push({ ts, values: this.sample(ts) });
    if (this.buffer.length < this.batch) return null;
    return this.flush(ts);
  }

  flush(ts) {
    if (!this.buffer.length) return null;
    const records = this.buffer.splice(0);
    const last = records[records.length - 1];
    if (!this.external && Math.random() < 0.02) this.battery = Math.max(0, this.battery - 5);
    this.signal = Math.max(-115, Math.min(-50, this.signal + Math.round(rand(-3, 3))));
    const realtime = this.sample(ts);
    return buildUplink({
      deviceId: this.id,
      typeCode: this.typeCode,
      battery: encodeBattery({ external: this.external, modeCode: this.external ? 2 : 1, level: this.battery }),
      signal: this.signal,
      interval: this.interval,
      alarmStatus: this.alarmStatus(last.values),
      alarmParams: this.thresholds,
      realtime,
      utc: last.ts,
      records: records.map((r) => r.values),
    });
  }
}

function round(x, p) {
  if (p.type === 'f32' || p.type === 'f64') return Number(x.toFixed(3));
  const s = p.scale || 1;
  return Math.round(x / s) * s;
}

/** 默认演示设备清单 */
export const DEMO_TYPES = [1, 1, 1, 8, 8, 11, 18, 18, 17, 24, 27, 31, 33, 34, 40, 47, 54, 60, 65, 72, 72, 88, 92, 93, 30, 41, 20, 89];

export function makeDemoDevices(count = DEMO_TYPES.length, { interval = 300, batch = 3 } = {}) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const typeCode = DEMO_TYPES[i % DEMO_TYPES.length];
    const id = `SHMK2406${String(i + 1).padStart(4, '0')}`;
    list.push(new VirtualDevice({ id, typeCode, interval, batch, external: [60, 72, 27, 89].includes(typeCode) }));
  }
  return list;
}
