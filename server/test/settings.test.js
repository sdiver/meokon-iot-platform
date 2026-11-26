import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import mqtt from 'mqtt';
import { startPlatform } from '../src/app.js';
import { SettingsStore } from '../src/settings.js';
import { buildUplink } from '../src/protocol/encoder.js';
import { decodeFrame } from '../src/protocol/decoder.js';

const silent = { info() {}, warn() {}, error() {} };
const base = 40000 + Math.floor(Math.random() * 15000);
const config = {
  httpPort: base, tcpPort: base + 1, udpPort: base + 2, mqttBrokerPort: base + 3, mqttBrokerEnabled: true,
  mqttBrokerUsername: '', mqttBrokerPassword: '', mqttUsername: '', mqttPassword: '',
  tcpEnabled: true, udpEnabled: true, tcpIdleCloseMs: 5000,
  mqttUrl: '', mqttUplinkTopic: 'GIOT-GW/UL/#', mqttDownlinkPrefix: 'GIOT-GW/DL/',
  dbFile: ':memory:', frameRetentionDays: 0, readingRetentionDays: 0,
  maxClockSkewSec: 3600, offlineMinSec: 1800, offlineFactor: 2.5, tzOffsetHours: 8,
  authToken: '', pushToken: '', webDist: '/nonexistent',
};

let p;
let token = '';
const api = async (path, init = {}) => {
  const r = await fetch(`http://127.0.0.1:${config.httpPort}/api${path}`, {
    ...init,
    body: init.body ? JSON.stringify(init.body) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  return { status: r.status, body: await r.json() };
};
const tcpSend = (port, frame) => new Promise((resolve, reject) => {
  const s = net.connect(port, '127.0.0.1', () => s.write(frame));
  s.on('data', (b) => { resolve(b); s.destroy(); });
  s.on('error', reject);
});
const mqttConnect = (opts) => new Promise((resolve) => {
  const c = mqtt.connect(`mqtt://127.0.0.1:${config.mqttBrokerPort}`, { reconnectPeriod: 0, ...opts });
  c.on('connect', () => { c.end(true); resolve(true); });
  c.on('error', () => { c.end(true); resolve(false); });
});

test.before(async () => { p = await startPlatform(config, silent); });
test.after(async () => { await p.close(); });

test('读取设置：密码类不回显，标明来源', async () => {
  const { body } = await api('/settings');
  const item = (k) => body.items.find((i) => i.key === k);
  assert.equal(item('tcpPort').value, config.tcpPort);
  assert.equal(item('tcpPort').source, 'env');
  assert.equal(body.transports.tcp.running, true);
  await api('/settings', { method: 'PUT', body: { pushToken: 'secret-1' } });
  const after = (await api('/settings')).body.items.find((i) => i.key === 'pushToken');
  assert.equal(after.value, '******');
  assert.equal(after.isSet, true);
  // 提交 ****** 表示不修改
  await api('/settings', { method: 'PUT', body: { pushToken: '******' } });
  assert.equal(config.pushToken, 'secret-1');
  await api('/settings/reset', { method: 'POST', body: { keys: ['pushToken'] } });
  assert.equal(config.pushToken, '');
});

test('校验：非法值与端口冲突被拒绝', async () => {
  let r = await api('/settings', { method: 'PUT', body: { tcpPort: 70000 } });
  assert.equal(r.status, 400);
  r = await api('/settings', { method: 'PUT', body: { tcpPort: config.mqttBrokerPort } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /冲突/);
  r = await api('/settings', { method: 'PUT', body: { mqttUrl: 'not a url' } });
  assert.equal(r.status, 400);
  r = await api('/settings', { method: 'PUT', body: { nope: 1 } });
  assert.equal(r.status, 400);
});

test('修改 TCP 端口后立即在新端口接入', async () => {
  const oldPort = config.tcpPort;
  const newPort = base + 10;
  const r = await api('/settings', { method: 'PUT', body: { tcpPort: newPort } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.restarted, ['tcp']);
  assert.equal(r.body.transports.tcp.port, newPort);
  const reply = await tcpSend(newPort, buildUplink({ deviceId: 'SHMK00000101', typeCode: 1, realtime: { pressure: 0.3 }, utc: Math.floor(Date.now() / 1000) }));
  assert.equal(decodeFrame(reply).deviceId, 'SHMK00000101');
  await assert.rejects(tcpSend(oldPort, Buffer.from('x')));
  await api('/settings/reset', { method: 'POST', body: { keys: ['tcpPort'] } });
  assert.equal(config.tcpPort, oldPort);
});

test('端口被占用时记录错误而不崩溃', async () => {
  const blocker = net.createServer();
  const busy = base + 20;
  await new Promise((r) => blocker.listen(busy, r));
  const r = await api('/settings', { method: 'PUT', body: { tcpPort: busy } });
  assert.equal(r.body.transports.tcp.running, false);
  assert.match(r.body.transports.tcp.error, /已被占用/);
  blocker.close();
  await api('/settings/reset', { method: 'POST', body: { keys: ['tcpPort'] } });
  assert.equal((await api('/settings')).body.transports.tcp.running, true);
});

test('运行参数立即生效（离线判定）', async () => {
  await api('/settings', { method: 'PUT', body: { offlineMinSec: 7200 } });
  const d = (await api('/devices/SHMK00000101')).body;
  assert.equal(d.offlineAfter, 7200);
  await api('/settings/reset', { method: 'POST', body: { keys: ['offlineMinSec'] } });
});

test('内置 Broker 设备认证', async () => {
  const r = await api('/settings', { method: 'PUT', body: { mqttBrokerUsername: 'dev', mqttBrokerPassword: 'pw' } });
  assert.deepEqual(r.body.restarted, ['mqtt']);
  assert.equal(r.body.transports.mqtt.connected, true, '平台应使用新凭据连回内置 Broker');
  assert.equal(await mqttConnect({}), false);
  assert.equal(await mqttConnect({ username: 'dev', password: 'pw' }), true);
  await api('/settings/reset', { method: 'POST', body: { keys: ['mqttBrokerUsername', 'mqttBrokerPassword'] } });
  assert.equal(await mqttConnect({}), true);
});

test('设置访问令牌后接口需要授权', async () => {
  await api('/settings', { method: 'PUT', body: { authToken: 'tk-123' } });
  assert.equal((await api('/devices')).status, 401);
  token = 'tk-123';
  assert.equal((await api('/devices')).status, 200);
  await api('/settings/reset', { method: 'POST', body: { keys: ['authToken'] } });
  token = '';
  assert.equal((await api('/devices')).status, 200);
});

test('设置持久化：重新加载后仍然生效', async () => {
  await api('/settings', { method: 'PUT', body: { frameRetentionDays: 30 } });
  const cfg2 = { ...config, frameRetentionDays: 90 };
  const s2 = new SettingsStore(p.db, cfg2);
  assert.equal(cfg2.frameRetentionDays, 30);
  assert.equal(s2.list().items.find((i) => i.key === 'frameRetentionDays').source, 'platform');
  await api('/settings/reset', { method: 'POST', body: { keys: ['frameRetentionDays'] } });
});

test('数据清空需要确认', async () => {
  let r = await api('/admin/purge', { method: 'POST', body: { scope: 'data' } });
  assert.equal(r.status, 400);
  r = await api('/admin/purge', { method: 'POST', body: { scope: 'data', confirm: '确认清空' } });
  assert.equal(r.status, 200);
  let s = (await api('/admin/data-summary')).body;
  assert.equal(s.readings, 0);
  assert.equal(s.devices, 1, '仅清空数据时保留设备档案');
  await api('/admin/purge', { method: 'POST', body: { scope: 'all', confirm: '确认清空' } });
  s = (await api('/admin/data-summary')).body;
  assert.equal(s.devices, 0);
});
