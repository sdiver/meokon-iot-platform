import { ElMessage } from 'element-plus';
import { reactive } from 'vue';

const TOKEN_KEY = 'meokon.token';
const PROJECT_KEY = 'meokon.project';
const store = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* ignore */ } };
const load = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };

/** 登录状态（全局共享） */
export const session = reactive({
  token: load(TOKEN_KEY),
  user: null,
  /** 顶部选择的项目，空字符串表示全部 */
  project: load(PROJECT_KEY),
  mustChange: false,
});

export function getToken() { return session.token; }
export function setToken(t) {
  session.token = t || '';
  store(TOKEN_KEY, session.token);
}
export function setProject(p) {
  session.project = p || '';
  store(PROJECT_KEY, session.project);
}

/** 401 时由路由层处理跳转登录页 */
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function request(path, { method = 'GET', body, query, silent, noProject } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
  const headers = { 'Content-Type': 'application/json' };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (session.project && !noProject) headers['X-Project'] = encodeURIComponent(session.project);
  const res = await fetch(`/api${path}${qs}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (res.status === 401 && path !== '/auth/login') {
    setToken('');
    session.user = null;
    onUnauthorized();
    throw new Error(data?.error || '未登录');
  }
  if (res.status === 403 && data?.code === 'MUST_CHANGE_PASSWORD') {
    session.mustChange = true;
    throw new Error(data.error);
  }
  if (!res.ok) {
    const msg = data?.error || `请求失败 (${res.status})`;
    if (!silent) ElMessage.error(msg);
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return data;
}

/** 带登录令牌与当前项目的下载 / 图片 / SSE 地址 */
export function withToken(url) {
  if (!url) return url;
  const parts = [];
  if (session.token) parts.push(`token=${encodeURIComponent(session.token)}`);
  if (session.project) parts.push(`_project=${encodeURIComponent(session.project)}`);
  return parts.length ? `${url}${url.includes('?') ? '&' : '?'}${parts.join('&')}` : url;
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
  createDevice: (body) => request('/devices', { method: 'POST', body }),
  importDevices: (rows) => request('/devices/import', { method: 'POST', body: { rows } }),
  devicesExportUrl: (q = {}) => withToken(`/api/devices/export.csv?${new URLSearchParams(q)}`),
  projects: () => request('/device-projects'),
  runtime: (id) => request(`/devices/${encodeURIComponent(id)}/runtime`),
  locations: (id) => request(`/devices/${encodeURIComponent(id)}/locations`),
  uploadPhoto: (id, dataUrl) => request(`/devices/${encodeURIComponent(id)}/photo`, { method: 'POST', body: { dataUrl } }),
  deletePhoto: (id) => request(`/devices/${encodeURIComponent(id)}/photo`, { method: 'DELETE' }),
  maintenance: (q) => request('/maintenance', { query: q }),
  addMaintenance: (body) => request('/maintenance', { method: 'POST', body }),
  deleteMaintenance: (id) => request(`/maintenance/${id}`, { method: 'DELETE' }),
  maintenanceExportUrl: (q = {}) => withToken(`/api/maintenance/export.csv?${new URLSearchParams(q)}`),
  commandList: (q) => request('/commands', { query: q }),
  batchCommands: (body) => request('/commands/batch', { method: 'POST', body }),
  cancelCommands: (ids) => request('/commands/cancel', { method: 'POST', body: { ids } }),
  deleteCommands: (ids) => request('/commands/delete', { method: 'POST', body: { ids } }),
  alarmSummary: () => request('/alarms/summary'),
  handleAlarms: (ids, status, note) => request('/alarms/handle', { method: 'POST', body: { ids, status, note } }),
  alarmsExportUrl: (q = {}) => withToken(`/api/alarms/export.csv?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v != null))}`),
  alarmTrend: (days) => request('/stats/alarm-trend', { query: { days } }),
  uiConfig: () => request('/ui-config', { silent: true }),
  notifyTest: () => request('/settings/notify-test', { method: 'POST' }),
  login: (body) => request('/auth/login', { method: 'POST', body, silent: true }),
  me: () => request('/auth/me', { silent: true }),
  logout: () => request('/auth/logout', { method: 'POST', silent: true }),
  changePassword: (oldPassword, newPassword) => request('/auth/password', { method: 'POST', body: { oldPassword, newPassword } }),
  users: (q) => request('/users', { query: q }),
  createUser: (body) => request('/users', { method: 'POST', body }),
  updateUser: (id, body) => request(`/users/${id}`, { method: 'PUT', body }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  resetUserPassword: (id, password) => request(`/users/${id}/reset-password`, { method: 'POST', body: { password } }),
  projectList: (all = false) => request('/projects', { noProject: all }),
  project: (id) => request(`/projects/${id}`),
  createProject: (body) => request('/projects', { method: 'POST', body }),
  updateProject: (id, body) => request(`/projects/${id}`, { method: 'PUT', body }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  setProjectDevices: (id, deviceIds) => request(`/projects/${id}/devices`, { method: 'PUT', body: { deviceIds } }),
  frames: (q) => request('/frames', { query: q }),
  alarms: (q) => request('/alarms', { query: q }),
  ackAlarm: (id, note) => request(`/alarms/${id}/ack`, { method: 'POST', body: { note } }),
  ackAll: (deviceId, status = 1) => request('/alarms/ack-all', { method: 'POST', body: { deviceId, status } }),
  overview: () => request('/stats/overview'),
  trend: (days) => request('/stats/trend', { query: { days } }),
  hourly: () => request('/stats/hourly'),
  alarmStats: (q) => request('/stats/alarms', { query: q }),
  typeStats: () => request('/stats/types'),
  activity: (q) => request('/stats/activity', { query: q }),
  settings: () => request('/settings'),
  saveSettings: (body) => request('/settings', { method: 'PUT', body }),
  resetSettings: (keys) => request('/settings/reset', { method: 'POST', body: { keys } }),
  dataSummary: () => request('/admin/data-summary'),
  purge: (scope, confirm) => request('/admin/purge', { method: 'POST', body: { scope, confirm } }),
  decode: (hex) => request('/tools/decode', { method: 'POST', body: { hex } }),
  downlink: (body) => request('/tools/downlink', { method: 'POST', body }),
};

// 界面配置（平台名称、地图），全局共享
export const ui = reactive({
  loaded: false,
  platformName: '物联网设备监测平台',
  screenTitle: '设备监测数据大屏',
  tzOffsetHours: 8,
  map: { provider: 'amap', tileUrl: '', tiandituKey: '', screenStyle: 'esri_dark', center: [31.2304, 121.4737], zoom: 12 },
  login: { slogan: '', copyright: '', icp: '' },
});
export async function loadUiConfig() {
  try {
    Object.assign(ui, await api.uiConfig(), { loaded: true });
  } catch { /* 使用默认值 */ }
  return ui;
}

// 设备类型字典缓存
let typesPromise = null;
export function loadTypes() {
  if (!typesPromise) typesPromise = api.deviceTypes().then((list) => new Map(list.map((t) => [t.code, t]))).catch((e) => { typesPromise = null; throw e; });
  return typesPromise;
}

// ---------------- 登录用户与权限 ----------------
const LEVEL = { admin: 3, operator: 2, viewer: 1 };
/** 当前用户角色等级：1 只读 / 2 运维 / 3 管理员 */
export const roleLevel = () => LEVEL[session.user?.role] ?? 0;
export const canWrite = () => roleLevel() >= 2;
export const isAdmin = () => roleLevel() >= 3;

export async function loadMe() {
  if (!session.token) return null;
  try {
    const r = await api.me();
    session.user = r.user;
    session.mustChange = !!r.user?.mustChange;
    // 已选项目不在可访问范围内时清除
    if (session.project && !r.user.allProjects && !r.user.projects.some((p) => p.name === session.project)) setProject('');
    return r.user;
  } catch {
    return null;
  }
}

export async function logout() {
  try { await api.logout(); } catch { /* ignore */ }
  setToken('');
  session.user = null;
}
