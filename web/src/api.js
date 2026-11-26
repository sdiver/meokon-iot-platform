import { ElMessage, ElMessageBox } from 'element-plus';

const TOKEN_KEY = 'meokon.token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function setToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
}

let asking = null;
async function askToken() {
  if (!asking) {
    asking = ElMessageBox.prompt('平台已开启访问控制，请输入访问令牌（AUTH_TOKEN）', '需要登录', {
      inputType: 'password', confirmButtonText: '确定', showCancelButton: false, closeOnClickModal: false,
    }).then(({ value }) => setToken(value)).finally(() => { asking = null; });
  }
  return asking;
}

export async function request(path, { method = 'GET', body, query, silent } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const headers = { 'Content-Type': 'application/json' };
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`/api${path}${qs}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) {
      await askToken();
      continue;
    }
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    if (!res.ok) {
      const msg = data?.error || `请求失败 (${res.status})`;
      if (!silent) ElMessage.error(msg);
      throw new Error(msg);
    }
    return data;
  }
  throw new Error('未授权');
}

/** 带 token 的下载 / SSE 地址 */
export function withToken(url) {
  const t = getToken();
  return t ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}` : url;
}

export const api = {
  system: () => request('/system'),
  deviceTypes: () => request('/device-types'),
  devices: (q) => request('/devices', { query: q }),
  groups: () => request('/device-groups'),
  device: (id) => request(`/devices/${encodeURIComponent(id)}`),
  updateDevice: (id, body) => request(`/devices/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteDevice: (id, purge) => request(`/devices/${encodeURIComponent(id)}`, { method: 'DELETE', query: { purge: purge ? 1 : undefined } }),
  readings: (id, q) => request(`/devices/${encodeURIComponent(id)}/readings`, { query: q }),
  series: (id, q) => request(`/devices/${encodeURIComponent(id)}/series`, { query: q }),
  deviceStats: (id, q) => request(`/devices/${encodeURIComponent(id)}/stats`, { query: q }),
  exportUrl: (id, q) => withToken(`/api/devices/${encodeURIComponent(id)}/export.csv?${new URLSearchParams(q)}`),
  commands: (id) => request(`/devices/${encodeURIComponent(id)}/commands`),
  addCommand: (id, body) => request(`/devices/${encodeURIComponent(id)}/commands`, { method: 'POST', body }),
  cancelCommand: (cid) => request(`/commands/${cid}`, { method: 'DELETE' }),
  frames: (q) => request('/frames', { query: q }),
  alarms: (q) => request('/alarms', { query: q }),
  ackAlarm: (id, note) => request(`/alarms/${id}/ack`, { method: 'POST', body: { note } }),
  ackAll: (deviceId) => request('/alarms/ack-all', { method: 'POST', body: { deviceId } }),
  overview: () => request('/stats/overview'),
  trend: (days) => request('/stats/trend', { query: { days } }),
  hourly: () => request('/stats/hourly'),
  alarmStats: (q) => request('/stats/alarms', { query: q }),
  typeStats: () => request('/stats/types'),
  activity: (q) => request('/stats/activity', { query: q }),
  decode: (hex) => request('/tools/decode', { method: 'POST', body: { hex } }),
  downlink: (body) => request('/tools/downlink', { method: 'POST', body }),
};

// 设备类型字典缓存
let typesPromise = null;
export function loadTypes() {
  if (!typesPromise) typesPromise = api.deviceTypes().then((list) => new Map(list.map((t) => [t.code, t]))).catch((e) => { typesPromise = null; throw e; });
  return typesPromise;
}
