const pad = (n) => String(n).padStart(2, '0');

export function fmtTime(ms, withSec = true) {
  if (ms == null) return '-';
  const d = new Date(ms);
  const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSec ? `${s}:${pad(d.getSeconds())}` : s;
}
export const fmtSec = (s, withSec) => (s == null ? '-' : fmtTime(s * 1000, withSec));

export function fmtAgo(ms) {
  if (ms == null) return '-';
  const diff = Math.max(0, Date.now() - ms) / 1000;
  if (diff < 60) return `${Math.floor(diff)} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

export function fmtDuration(ms) {
  if (ms == null) return '-';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  if (s < 3600) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`;
  return `${Math.floor(s / 86400)} 天 ${Math.floor((s % 86400) / 3600)} 小时`;
}

export function fmtNum(v, digits) {
  if (v == null || Number.isNaN(v)) return '-';
  if (typeof v !== 'number') return String(v);
  if (digits !== undefined) return v.toFixed(digits);
  if (Number.isInteger(v)) return v.toLocaleString('zh-CN');
  return String(Number(v.toPrecision(7)));
}

export const fmtPct = (r, d = 1) => (r == null ? '-' : `${(r * 100).toFixed(d)}%`);

export function decimalsOf(scale) {
  if (!scale || scale >= 1) return 0;
  return Math.max(0, Math.round(-Math.log10(scale)));
}

/** 按参数定义格式化数值 */
export function fmtParam(p, v) {
  if (v == null) return '-';
  if (!p) return fmtNum(v);
  if (p.kind === 'enum') return p.enum?.[v] ?? String(v);
  if (p.kind === 'bits') return `0x${(v >>> 0).toString(16).toUpperCase().padStart(p.bits > 16 ? 8 : 4, '0')}`;
  if (p.type === 'f64') return v.toFixed(6);
  if (p.type === 'f32') return fmtNum(v);
  return Number(v).toFixed(decimalsOf(p.scale));
}

/** 开关量通道：返回已闭合通道号数组 */
export function closedChannels(v, n) {
  const out = [];
  for (let i = 0; i < n; i++) if ((v >>> i) & 1) out.push(i + 1);
  return out;
}

export const STATUS = {
  online: { text: '在线', type: 'success' },
  alarm: { text: '报警', type: 'danger' },
  offline: { text: '离线', type: 'info' },
};

export const TRANSPORT = { tcp: 'TCP', udp: 'UDP', mqtt: 'MQTT', aep: '电信 AEP', onenet: '移动 OneNET', http: 'HTTP', test: '测试' };

export function signalLevel(s) {
  if (s == null) return { text: '-', bars: 0 };
  if (s >= -85) return { text: '强', bars: 4 };
  if (s >= -95) return { text: '良', bars: 3 };
  if (s >= -105) return { text: '弱', bars: 2 };
  return { text: '差', bars: 1 };
}

export const hex = (n, w = 2) => (n == null ? '-' : `0x${n.toString(16).toUpperCase().padStart(w, '0')}`);
