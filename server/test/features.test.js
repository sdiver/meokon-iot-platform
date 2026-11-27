import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { startPlatform } from '../src/app.js';
import { buildUplink, encodeBattery } from '../src/protocol/encoder.js';
import { openDatabase } from '../src/db/index.js';

const silent = { info() {}, warn() {}, error() {} };
const base = 25000 + Math.floor(Math.random() * 10000);
const config = {
  httpPort: base, tcpPort: base + 1, udpPort: base + 2, mqttBrokerPort: base + 3, mqttBrokerEnabled: false,
  mqttBrokerUsername: '', mqttBrokerPassword: '', mqttUsername: '', mqttPassword: '',
  tcpEnabled: false, udpEnabled: false, tcpIdleCloseMs: 5000,
  mqttUrl: '', mqttUplinkTopic: 'GIOT-GW/UL/#', mqttDownlinkPrefix: 'GIOT-GW/DL/',
  dbFile: ':memory:', frameRetentionDays: 0, readingRetentionDays: 0,
  maxClockSkewSec: 3600, offlineMinSec: 1800, offlineFactor: 2.5, tzOffsetHours: 8,
  authToken: 'test-api-token', pushToken: '', webDist: '/nonexistent',
  platformName: '测试平台', screenTitle: '测试大屏', mapProvider: 'amap', mapTileUrl: '', mapTiandituKey: '', mapScreenStyle: 'esri_dark', mapCenterLng: 121.47, mapCenterLat: 31.23, mapZoom: 12,
  notifyEnabled: false, notifyType: 'wecom', notifyUrl: '', notifySecret: '', notifyRecover: false, photoDir: '',
};

let p;
const api = async (path, init = {}) => {
  const r = await fetch(`http://127.0.0.1:${config.httpPort}/api${path}`, {
    ...init,
    body: init.body ? JSON.stringify(init.body) : undefined,
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-api-token' },
  });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text(), headers: r.headers };
};
const nowSec = () => Math.floor(Date.now() / 1000);
const up = (id, f, ctx = {}) => p.ingest.handle(buildUplink({ deviceId: id, utc: nowSec(), ...f }), { transport: 'test', replyMode: 'none', ...ctx });

test.before(async () => { p = await startPlatform(config, silent); });
test.after(async () => { await p.close(); });

test('旧数据库自动迁移到新结构', () => {
  const db = openDatabase(':memory:');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  const cols = db.prepare('PRAGMA table_info(alarms)').all().map((c) => c.name);
  assert.ok(cols.includes('status') && cols.includes('level'));
  db.close();
});

test('预先登记设备：未上线 → 首次上报后在线，档案保留', async () => {
  let r = await api('/devices', { method: 'POST', body: { id: 'PRE000000001', name: '1号泵房压力', model: 'MD-S271', project: '一期', owner: '张工', contact: '13800000000', lat: 31.2, lng: 121.5, typeCode: 1 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'inactive');
  assert.equal(r.body.typeName, '压力表 MPa');
  r = await api('/devices', { method: 'POST', body: { id: 'PRE000000001' } });
  assert.equal(r.status, 409);
  r = await api('/devices', { method: 'POST', body: { id: '' } });
  assert.equal(r.status, 400);
  up('PRE000000001', { typeCode: 1, realtime: { pressure: 0.4 } });
  const d = (await api('/devices/PRE000000001')).body;
  assert.equal(d.status, 'online');
  assert.equal(d.name, '1号泵房压力');
  assert.equal(d.owner, '张工');
  assert.ok(d.firstSeen > 0, '首次上报时间被记录');
  const locs = (await api('/devices/PRE000000001/locations')).body;
  assert.equal(locs.length, 1);
  assert.equal(locs[0].source, 'manual');
});

test('批量导入档案：新增 + 更新 + 错误行', async () => {
  const r = await api('/devices/import', { method: 'POST', body: { rows: [
    { id: 'IMP000000001', name: '导入1', project: '二期', alarmPush: '关' },
    { id: 'PRE000000001', assetNo: 'ZC-001' },
    { id: 'BAD ID WITH SPACE', name: 'x' },
    { id: 'IMP000000002', lat: 999 },
  ] } });
  assert.equal(r.body.created, 1);
  assert.equal(r.body.updated, 1);
  assert.equal(r.body.errors.length, 2);
  assert.equal((await api('/devices/PRE000000001')).body.assetNo, 'ZC-001');
  assert.equal((await api('/devices/IMP000000001')).body.alarmPush, false);
  assert.deepEqual((await api('/device-projects')).body, ['一期', '二期']);
  const csv = (await api('/devices/export.csv')).body;
  assert.match(csv, /IMP000000001,导入1/);
});

test('修改 ICCID 自动生成换卡记录；登记维保', async () => {
  await api('/devices/PRE000000001', { method: 'PUT', body: { iccid: '89860000000000000001' } });
  await api('/devices/PRE000000001', { method: 'PUT', body: { iccid: '89860000000000000002' } });
  let m = (await api('/maintenance?type=更换SIM卡')).body;
  assert.equal(m.total, 1);
  assert.equal(m.items[0].oldValue, '89860000000000000001');
  const r = await api('/maintenance', { method: 'POST', body: { deviceId: 'PRE000000001', type: '更换SIM卡', newValue: '89860000000000000003', note: '卡损坏' } });
  assert.equal(r.status, 200);
  assert.equal((await api('/devices/PRE000000001')).body.iccid, '89860000000000000003');
  m = (await api('/maintenance?deviceId=PRE000000001')).body;
  assert.equal(m.total, 2);
  assert.equal(m.items[0].oldValue, '89860000000000000002');
  assert.equal((await api('/maintenance', { method: 'POST', body: { deviceId: 'NOPE', type: '维修' } })).status, 400);
  assert.equal((await api('/maintenance', { method: 'POST', body: { deviceId: 'PRE000000001', type: '乱写' } })).status, 400);
});

test('电量由低跳高自动识别为更换电池', async () => {
  up('BAT000000001', { typeCode: 11, realtime: { temp: 20 }, battery: encodeBattery({ level: 15 }) });
  up('BAT000000001', { typeCode: 11, realtime: { temp: 20 }, battery: encodeBattery({ level: 100 }) });
  const m = (await api('/maintenance?deviceId=BAT000000001')).body;
  assert.equal(m.total, 1);
  assert.equal(m.items[0].type, '更换电池');
  assert.equal(m.items[0].auto, true);
});

test('定位设备记录轨迹，运行信息统计', async () => {
  up('GPS000000001', { typeCode: 32, realtime: { lng: 121.5, lat: 31.2 }, signal: -70 });
  up('GPS000000001', { typeCode: 32, realtime: { lng: 121.5, lat: 31.2 }, signal: -90 }); // 未移动
  up('GPS000000001', { typeCode: 32, realtime: { lng: 121.51, lat: 31.2 }, signal: -80 });
  const locs = (await api('/devices/GPS000000001/locations')).body;
  assert.equal(locs.length, 2);
  const rt = (await api('/devices/GPS000000001/runtime')).body;
  assert.equal(rt.uploads, 3);
  assert.equal(rt.successRate, 1);
  assert.equal(rt.minSignal, -90);
});

test('报警处理流程：未处理 → 已记录 → 已处理，汇总与导出', async () => {
  const id = 'ALM000000001';
  const f = (status, temp) => ({ typeCode: 18, realtime: { hum: 50, temp }, alarmStatus: status, alarmParams: [{ low: 10, high: 90 }, { low: 0, high: 40 }] });
  up(id, f(0x02 | 0x04, 45)); // 高报警 + 电量报警
  let s = (await api('/alarms/summary')).body;
  assert.equal(s.pending, 2);
  assert.equal(s.levels.high, 1);
  assert.equal(s.levels.low, 1);
  assert.equal(s.upper, 1);
  let list = (await api(`/alarms?deviceId=${id}&handle=0`)).body;
  assert.equal(list.total, 2);
  assert.match(list.items[0].code, /^ALM\d{8}\d{6}$/);
  assert.equal(list.items[0].deviceStatus, 'alarm');
  assert.equal(list.items[0].deviceRealtime.temp, 45);
  const [a1, a2] = list.items.map((a) => a.id);
  await api('/alarms/handle', { method: 'POST', body: { ids: [a1], status: 1, note: '已通知现场' } });
  await api('/alarms/handle', { method: 'POST', body: { ids: [a2], status: 2, note: '已更换电池' } });
  assert.equal((await api('/alarms/handle', { method: 'POST', body: { ids: [a1], status: 9 } })).status, 400);
  s = (await api('/alarms/summary')).body;
  assert.equal(s.pending, 0);
  assert.equal(s.recorded, 1);
  assert.equal(s.handled, 1);
  list = (await api(`/alarms?deviceId=${id}&handle=2`)).body;
  assert.equal(list.items[0].note, '已更换电池');
  const csv = (await api(`/alarms/export.csv?deviceId=${id}`)).body;
  assert.match(csv, /告警编号/);
  assert.match(csv, /已更换电池/);
  const trend = (await api('/stats/alarm-trend?days=7')).body;
  assert.equal(trend.dates.length, 7);
  assert.ok(trend.series.find((x) => x.name === '高报警').total >= 1);
});

test('远程配置：批量下发、取消、记录列表', async () => {
  const r = await api('/commands/batch', { method: 'POST', body: { deviceIds: ['PRE000000001', 'IMP000000001'], preset: 'readAll', note: '批量读取' } });
  assert.equal(r.body.ids.length, 2);
  await api('/commands/cancel', { method: 'POST', body: { ids: [r.body.ids[1]] } });
  const list = (await api('/commands')).body;
  assert.equal(list.total, 2);
  assert.equal(list.counts.pending, 1);
  assert.equal(list.counts.cancelled, 1);
  assert.equal(list.items.find((c) => c.deviceId === 'PRE000000001').deviceStatus, 'online');
  assert.equal((await api('/commands/batch', { method: 'POST', body: { deviceIds: [], params: 'ff00' } })).status, 400);
});

test('设备照片上传与读取', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const r = await api('/devices/PRE000000001/photo', { method: 'POST', body: { dataUrl: png } });
  assert.equal(r.status, 200);
  assert.ok(r.body.photo);
  const img = await fetch(`http://127.0.0.1:${config.httpPort}${r.body.photo}&token=test-api-token`);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal((await api('/devices/PRE000000001/photo', { method: 'POST', body: { dataUrl: 'data:text/html;base64,AAAA' } })).status, 400);
  await api('/devices/PRE000000001/photo', { method: 'DELETE' });
  assert.equal((await api('/devices/PRE000000001')).body.photo, null);
});

test('告警推送：钉钉加签、设备推送开关、恢复推送', async () => {
  const got = [];
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => { got.push({ url: req.url, body: JSON.parse(b) }); res.setHeader('content-type', 'application/json'); res.end('{"errcode":0}'); });
  });
  await new Promise((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}/robot/send?access_token=x`;
  await api('/settings', { method: 'PUT', body: { notifyEnabled: true, notifyType: 'dingtalk', notifyUrl: url, notifySecret: 'SECxyz', notifyRecover: true } });
  const t = (await api('/settings/notify-test', { method: 'POST' })).body;
  assert.equal(t.ok, true);
  up('PRE000000001', { typeCode: 1, realtime: { pressure: 0.9 }, alarmStatus: 0x02, alarmParams: [{ low: 0.1, high: 0.6 }] });
  up('IMP000000001', { typeCode: 1, realtime: { pressure: 0.9 }, alarmStatus: 0x02 }); // 推送已关闭
  up('PRE000000001', { typeCode: 1, realtime: { pressure: 0.4 }, alarmStatus: 0 });
  for (let i = 0; i < 30 && got.length < 3; i++) await new Promise((r) => setTimeout(r, 50));
  srv.close();
  assert.equal(got.length, 3, JSON.stringify(got.map((g) => g.body.text?.content)));
  const u = new URL(got[1].url, 'http://x');
  const ts = u.searchParams.get('timestamp');
  const sign = crypto.createHmac('sha256', 'SECxyz').update(`${ts}\nSECxyz`).digest('base64');
  assert.equal(u.searchParams.get('sign'), sign);
  assert.match(got[1].body.text.content, /设备报警·高.*高报警/s);
  assert.match(got[1].body.text.content, /1号泵房压力/);
  assert.match(got[1].body.text.content, /负责人：张工/);
  assert.match(got[2].body.text.content, /报警恢复/);
  const st = (await api('/settings')).body;
  assert.equal(st.items.find((i) => i.key === 'notifyUrl').value, '******');
  assert.equal(st.notify.sent, 3);
  await api('/settings/reset', { method: 'POST', body: { keys: ['notifyEnabled', 'notifyType', 'notifyUrl', 'notifySecret', 'notifyRecover'] } });
});

test('界面配置与选择类设置校验', async () => {
  const ui = (await api('/ui-config')).body;
  assert.equal(ui.platformName, '测试平台');
  assert.equal(ui.map.provider, 'amap');
  assert.equal(ui.map.screenStyle, 'esri_dark');
  assert.equal((await api('/settings', { method: 'PUT', body: { mapProvider: 'google' } })).status, 400);
  assert.equal((await api('/settings', { method: 'PUT', body: { mapProvider: 'esri_img', mapTiandituKey: 'abc123' } })).status, 200);
  assert.equal((await api('/ui-config')).body.map.tiandituKey, 'abc123');
  await api('/settings/reset', { method: 'POST', body: { keys: ['mapTiandituKey'] } });
  assert.equal((await api('/settings', { method: 'PUT', body: { notifyUrl: 'ftp://x' } })).status, 400);
  await api('/settings', { method: 'PUT', body: { mapProvider: 'osm', platformName: '新名称' } });
  assert.equal((await api('/ui-config')).body.platformName, '新名称');
  await api('/settings/reset', { method: 'POST', body: { keys: ['mapProvider', 'platformName'] } });
});

test('总览包含报警处理汇总与分组统计', async () => {
  const o = (await api('/stats/overview')).body;
  assert.ok('pending' in o.alarms && 'recorded' in o.alarms && 'handled' in o.alarms);
  assert.ok(o.devices.located >= 2);
  assert.ok(o.byProject.find((x) => x.name === '一期'));
});
