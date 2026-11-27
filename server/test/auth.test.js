import test from 'node:test';
import assert from 'node:assert/strict';
import { startPlatform } from '../src/app.js';
import { buildUplink } from '../src/protocol/encoder.js';
import { hashPassword, verifyPassword, checkPasswordStrength } from '../src/services/auth.js';

const silent = { info() {}, warn() {}, error() {} };
const base = 35000 + Math.floor(Math.random() * 5000);
const config = {
  httpPort: base, tcpPort: base + 1, udpPort: base + 2, mqttBrokerPort: base + 3, mqttBrokerEnabled: false,
  mqttBrokerUsername: '', mqttBrokerPassword: '', mqttUsername: '', mqttPassword: '',
  tcpEnabled: false, udpEnabled: false, tcpIdleCloseMs: 5000,
  mqttUrl: '', mqttUplinkTopic: 'GIOT-GW/UL/#', mqttDownlinkPrefix: 'GIOT-GW/DL/',
  dbFile: ':memory:', frameRetentionDays: 0, readingRetentionDays: 0,
  maxClockSkewSec: 3600, offlineMinSec: 1800, offlineFactor: 2.5, tzOffsetHours: 8,
  authToken: '', pushToken: '', webDist: '/nonexistent', adminPassword: '',
  platformName: '测试平台', screenTitle: '测试大屏', mapProvider: 'amap', mapTileUrl: '', mapTiandituKey: '', mapScreenStyle: 'esri_dark', mapCenterLng: 121.47, mapCenterLat: 31.23, mapZoom: 12,
  notifyEnabled: false, notifyType: 'wecom', notifyUrl: '', notifySecret: '', notifyRecover: false, photoDir: '',
  loginSlogan: '标语', copyright: '© 测试', icpNo: '',
};

let p;
const call = async (path, { token, method = 'GET', body, headers = {} } = {}) => {
  const r = await fetch(`http://127.0.0.1:${config.httpPort}/api${path}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() };
};
const login = async (username, password, extra = {}) => (await call('/auth/login', { method: 'POST', body: { username, password, ...extra } }));
const up = (id, typeCode = 1) => p.ingest.handle(buildUplink({ deviceId: id, typeCode, realtime: { pressure: 0.3 }, alarmStatus: 0x02, utc: Math.floor(Date.now() / 1000) }), { transport: 'test', replyMode: 'none' });

let admin; // 管理员令牌

test.before(async () => { p = await startPlatform(config, silent); });
test.after(async () => { await p.close(); });

test('密码哈希与强度校验', () => {
  const h = hashPassword('abc12345');
  assert.ok(h.startsWith('scrypt$'));
  assert.equal(verifyPassword('abc12345', h), true);
  assert.equal(verifyPassword('abc12346', h), false);
  assert.ok(checkPasswordStrength('short1'));
  assert.ok(checkPasswordStrength('allletters'));
  assert.equal(checkPasswordStrength('good1234'), null);
});

test('未登录访问被拒绝，公开接口可访问', async () => {
  assert.equal((await call('/devices')).status, 401);
  assert.equal((await call('/health')).status, 200);
  const ui = await call('/ui-config');
  assert.equal(ui.status, 200);
  assert.equal(ui.body.login.copyright, '© 测试');
});

test('初始管理员：首次登录必须修改密码', async () => {
  let r = await login('admin', 'wrong');
  assert.equal(r.status, 401);
  r = await login('admin', 'admin123');
  assert.equal(r.status, 200);
  assert.equal(r.body.user.mustChange, true);
  const t = r.body.token;
  assert.equal((await call('/devices', { token: t })).status, 403, '未改密码前不能访问业务接口');
  assert.equal((await call('/auth/password', { token: t, method: 'POST', body: { oldPassword: 'admin123', newPassword: 'weak' } })).status, 400);
  r = await call('/auth/password', { token: t, method: 'POST', body: { oldPassword: 'admin123', newPassword: 'Admin2026x' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.mustChange, false);
  assert.equal((await call('/devices', { token: t })).status, 200);
  admin = t;
  assert.equal((await login('admin', 'admin123')).status, 401, '旧密码失效');
});

test('连续登录失败锁定', async () => {
  p.auth.failures.clear();
  for (let i = 0; i < 4; i++) assert.equal((await login('admin', `bad${i}`)).status, 401);
  const r = await login('admin', 'bad5');
  assert.equal(r.status, 401);
  assert.match(r.body.error, /锁定/);
  assert.equal((await login('admin', 'Admin2026x')).status, 429, '锁定期间正确密码也不能登录');
  p.auth.failures.clear();
});

test('项目管理：新建、改名同步设备、分配设备', async () => {
  let r = await call('/projects', { token: admin, method: 'POST', body: { name: '一期', owner: '张工' } });
  const p1 = r.body.id;
  r = await call('/projects', { token: admin, method: 'POST', body: { name: '二期' } });
  const p2 = r.body.id;
  assert.equal((await call('/projects', { token: admin, method: 'POST', body: { name: '一期' } })).status, 409);
  up('PRJ000000001'); up('PRJ000000002'); up('PRJ000000003');
  await call(`/projects/${p1}/devices`, { token: admin, method: 'PUT', body: { deviceIds: ['PRJ000000001', 'PRJ000000002'] } });
  await call(`/projects/${p2}/devices`, { token: admin, method: 'PUT', body: { deviceIds: ['PRJ000000003'] } });
  await call(`/projects/${p1}`, { token: admin, method: 'PUT', body: { name: '一期工程' } });
  const d = (await call('/devices/PRJ000000001', { token: admin })).body;
  assert.equal(d.project, '一期工程', '改名同步到设备档案');
  const list = (await call('/projects', { token: admin })).body;
  assert.equal(list.find((x) => x.id === p1).devices, 2);
  assert.equal(list.find((x) => x.id === p1).alarming, 2);
});

test('用户管理：创建、角色、项目权限与数据隔离', async () => {
  const projects = (await call('/projects', { token: admin })).body;
  const p1 = projects.find((x) => x.name === '一期工程');
  let r = await call('/users', { token: admin, method: 'POST', body: { username: 'op1', name: '运维甲', role: 'operator', password: 'Pass1234', projectIds: [p1.id] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.mustChange, true);
  assert.equal((await call('/users', { token: admin, method: 'POST', body: { username: 'op1', password: 'Pass1234' } })).status, 409);
  assert.equal((await call('/users', { token: admin, method: 'POST', body: { username: 'x', password: 'Pass1234' } })).status, 400);
  // 运维人员登录并修改初始密码
  let t = (await login('op1', 'Pass1234')).body.token;
  await call('/auth/password', { token: t, method: 'POST', body: { oldPassword: 'Pass1234', newPassword: 'Op1pass2026' } });
  // 只能看到所属项目的设备、报警、统计
  const devs = (await call('/devices?size=100', { token: t })).body;
  assert.deepEqual(devs.items.map((d) => d.id).sort(), ['PRJ000000001', 'PRJ000000002']);
  assert.equal((await call('/devices/PRJ000000003', { token: t })).status, 404);
  assert.equal((await call('/devices/PRJ000000003/readings', { token: t })).status, 404);
  const alarms = (await call('/alarms?handle=all', { token: t })).body;
  assert.ok(alarms.items.every((a) => a.deviceId !== 'PRJ000000003'));
  assert.equal((await call('/alarms/summary', { token: t })).body.devices, 2);
  assert.equal((await call('/stats/overview', { token: t })).body.devices.total, 2);
  assert.deepEqual((await call('/projects', { token: t })).body.map((x) => x.name), ['一期工程']);
  // 处理报警记录操作人
  const a = alarms.items[0];
  await call('/alarms/handle', { token: t, method: 'POST', body: { ids: [a.id], status: 2, note: '已处理' } });
  const h = (await call(`/alarms?deviceId=${a.deviceId}&handle=2`, { token: t })).body.items[0];
  assert.equal(h.handledBy, '运维甲（op1）');
  // 无权处理其他项目的报警
  const other = (await call('/alarms?deviceId=PRJ000000003&handle=0', { token: admin })).body.items[0];
  await call('/alarms/handle', { token: t, method: 'POST', body: { ids: [other.id], status: 2 } });
  assert.equal((await call('/alarms?deviceId=PRJ000000003&handle=0', { token: admin })).body.total, 1, '其他项目报警未被修改');
  // 运维人员不能管理用户、修改设置；不能把设备移到无权限的项目
  assert.equal((await call('/users', { token: t })).status, 403);
  assert.equal((await call('/settings', { token: t })).status, 403);
  assert.equal((await call('/devices/PRJ000000001', { token: t, method: 'PUT', body: { project: '二期' } })).status, 400);
  // 新增设备自动归入其项目
  r = await call('/devices', { token: t, method: 'POST', body: { id: 'PRJ000000009', name: '新设备' } });
  assert.equal(r.body.project, '一期工程');
  // 顶部项目切换：管理员选择某个项目后只看该项目
  const scoped = (await call('/devices?size=100', { token: admin, headers: { 'x-project': encodeURIComponent('二期') } })).body;
  assert.deepEqual(scoped.items.map((d) => d.id), ['PRJ000000003']);
});

test('只读用户不能修改数据；停用后立即失效', async () => {
  let r = await call('/users', { token: admin, method: 'POST', body: { username: 'viewer1', role: 'viewer', allProjects: true, password: 'View1234' } });
  const id = r.body.id;
  let t = (await login('viewer1', 'View1234')).body.token;
  await call('/auth/password', { token: t, method: 'POST', body: { oldPassword: 'View1234', newPassword: 'View2026x' } });
  assert.equal((await call('/devices?size=100', { token: t })).body.total >= 4, true, '可访问全部项目');
  assert.equal((await call('/devices/PRJ000000001', { token: t, method: 'PUT', body: { name: 'x' } })).status, 403);
  assert.equal((await call('/alarms/handle', { token: t, method: 'POST', body: { ids: [1], status: 1 } })).status, 403);
  await call(`/users/${id}`, { token: admin, method: 'PUT', body: { enabled: false } });
  assert.equal((await call('/devices', { token: t })).status, 401);
  assert.equal((await login('viewer1', 'View2026x')).status, 403);
});

test('管理员保护：不能删除 / 停用自己，至少保留一个管理员', async () => {
  const me = (await call('/auth/me', { token: admin })).body.user;
  assert.equal((await call(`/users/${me.id}`, { token: admin, method: 'DELETE' })).status, 400);
  assert.equal((await call(`/users/${me.id}`, { token: admin, method: 'PUT', body: { enabled: false } })).status, 400);
  assert.equal((await call(`/users/${me.id}`, { token: admin, method: 'PUT', body: { role: 'viewer' } })).status, 400);
  // 重置他人密码后其会话失效
  const op = (await call('/users', { token: admin })).body.find((u) => u.username === 'op1');
  const t = (await login('op1', 'Op1pass2026')).body.token;
  await call(`/users/${op.id}/reset-password`, { token: admin, method: 'POST', body: { password: 'Reset1234' } });
  assert.equal((await call('/devices', { token: t })).status, 401);
  assert.equal((await login('op1', 'Reset1234')).body.user.mustChange, true);
});

test('删除项目：设备保留并移出项目', async () => {
  const p2 = (await call('/projects', { token: admin })).body.find((x) => x.name === '二期');
  await call(`/projects/${p2.id}`, { token: admin, method: 'DELETE' });
  const d = (await call('/devices/PRJ000000003', { token: admin })).body;
  assert.equal(d.project, null);
});

test('已有普通用户但没有管理员时仍会创建初始管理员', async () => {
  const { openDatabase } = await import('../src/db/index.js');
  const { AuthService, hashPassword: hp } = await import('../src/services/auth.js');
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO users (username, role, password_hash, created_at) VALUES ('op', 'operator', ?, 0)").run(hp('Pass1234'));
  const a = new AuthService(db, { adminPassword: '' }, null);
  const r = a.login({ username: 'admin', password: 'admin123' }, {});
  assert.equal(r.user.role, 'admin');
  assert.equal(r.user.mustChange, true);
  db.close();
});

test('退出登录后令牌失效', async () => {
  const t = (await login('admin', 'Admin2026x')).body.token;
  assert.equal((await call('/auth/me', { token: t })).status, 200);
  await call('/auth/logout', { token: t, method: 'POST' });
  assert.equal((await call('/auth/me', { token: t })).status, 401);
});
