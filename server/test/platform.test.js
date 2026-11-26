import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import dgram from 'node:dgram';
import mqtt from 'mqtt';
import { startPlatform } from '../src/app.js';
import { buildUplink } from '../src/protocol/encoder.js';
import { decodeFrame, hexToBuffer } from '../src/protocol/decoder.js';
import { crc16Modbus } from '../src/protocol/crc16.js';

const silent = { info() {}, warn() {}, error() {} };
const base = 20000 + Math.floor(Math.random() * 20000);
const config = {
  httpPort: base, tcpPort: base + 1, udpPort: base + 2, mqttBrokerPort: base + 3,
  tcpEnabled: true, udpEnabled: true, tcpIdleCloseMs: 5000,
  mqttUrl: '', mqttUplinkTopic: 'GIOT-GW/UL/#', mqttDownlinkPrefix: 'GIOT-GW/DL/',
  dbFile: ':memory:', frameRetentionDays: 0, readingRetentionDays: 0,
  maxClockSkewSec: 3600, offlineMinSec: 1800, offlineFactor: 2.5, tzOffsetHours: 8,
  authToken: '', pushToken: '', webDist: '/nonexistent',
};

let p;
const api = async (path, init) => {
  const r = await fetch(`http://127.0.0.1:${config.httpPort}/api${path}`, {
    ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.text();
};
const nowSec = () => Math.floor(Date.now() / 1000);

test.before(async () => { p = await startPlatform(config, silent); });
test.after(async () => { await p.close(); });

test('TCP 上报：平台下发默认应答并入库', async () => {
  const frame = buildUplink({ deviceId: 'SHMK24060001', typeCode: 1, realtime: { pressure: 0.42 }, records: [{ pressure: 0.4 }, { pressure: 0.41 }], utc: nowSec(), alarmParams: [{ low: 0.1, high: 0.6 }] });
  const reply = await new Promise((resolve, reject) => {
    const s = net.connect(config.tcpPort, '127.0.0.1', () => s.write(frame));
    s.on('data', (b) => { resolve(b); s.destroy(); });
    s.on('error', reject);
  });
  const d = decodeFrame(reply);
  assert.equal(d.direction, 'down');
  assert.equal(d.deviceId, 'SHMK24060001');
  assert.equal(d.paramLength, 0);

  const dev = await api('/devices/SHMK24060001');
  assert.equal(dev.typeCode, 1);
  assert.equal(dev.realtime.pressure, 0.42);
  assert.equal(dev.online, true);
  const rd = await api('/devices/SHMK24060001/readings');
  assert.equal(rd.total, 2);
});

test('重复上报的缓存数据不会重复入库', async () => {
  const utc = nowSec() - 10;
  const f = buildUplink({ deviceId: 'SHMK24060002', typeCode: 11, realtime: { temp: 20 }, records: [{ temp: 19 }, { temp: 20 }], utc, interval: 60 });
  p.ingest.handle(f, { transport: 'test', replyMode: 'none' });
  p.ingest.handle(f, { transport: 'test', replyMode: 'none' });
  const rd = await api('/devices/SHMK24060002/readings');
  assert.equal(rd.total, 2);
});

test('报警事件的产生、确认与恢复', async () => {
  const id = 'SHMK24060003';
  const mk = (status, v) => buildUplink({ deviceId: id, typeCode: 18, realtime: { hum: 50, temp: v }, utc: nowSec(), alarmStatus: status, alarmParams: [{ low: 10, high: 90 }, { low: 0, high: 40 }] });
  p.ingest.handle(mk(0x40, 45), { transport: 'test', replyMode: 'none' });
  let list = await api(`/alarms?deviceId=${id}`);
  assert.equal(list.total, 1);
  assert.equal(list.items[0].label, '第二传感器高报警');
  assert.equal(list.items[0].open, true);
  await api(`/alarms/${list.items[0].id}/ack`, { method: 'POST', body: JSON.stringify({ note: '已处理' }) });
  p.ingest.handle(mk(0x40, 46), { transport: 'test', replyMode: 'none' }); // 持续报警不产生新事件
  p.ingest.handle(mk(0x00, 25), { transport: 'test', replyMode: 'none' });
  list = await api(`/alarms?deviceId=${id}`);
  assert.equal(list.total, 1);
  assert.equal(list.items[0].open, false);
  assert.equal(list.items[0].acked, true);
  const dev = await api(`/devices/${id}`);
  assert.equal(dev.status, 'online');
});

test('UDP 上报 + 下行命令随应答下发 + 设备应答', async () => {
  const id = 'SHMK24060004';
  const cmd = await api(`/devices/${id}/commands`, { method: 'POST', body: JSON.stringify({ preset: 'readAll' }) });
  assert.ok(cmd.id);
  const frame = buildUplink({ deviceId: id, typeCode: 8, realtime: { level: 1.23 }, utc: nowSec() });
  const sock = dgram.createSocket('udp4');
  const reply = await new Promise((resolve) => {
    sock.on('message', (m) => resolve(m));
    sock.send(frame, config.udpPort, '127.0.0.1');
  });
  const d = decodeFrame(reply);
  assert.equal(d.params, 'ff00');
  // 设备应答（命令类型 0x04）
  const ack = Buffer.from(reply);
  ack[2] = 0x04;
  ack.writeUInt16BE(crc16Modbus(ack, 0, ack.length - 4), ack.length - 4);
  sock.send(ack, config.udpPort, '127.0.0.1');
  await new Promise((r) => setTimeout(r, 200));
  sock.close();
  const cmds = await api(`/devices/${id}/commands`);
  assert.equal(cmds[0].status, 'acked');
});

test('MQTT 十六进制字符串上报', async () => {
  const id = 'SHMK24060005';
  const c = mqtt.connect(`mqtt://127.0.0.1:${config.mqttBrokerPort}`);
  await new Promise((r) => c.on('connect', r));
  await new Promise((r) => setTimeout(r, 300)); // 等待平台订阅完成
  c.publish(`GIOT-GW/UL/${id}`, buildUplink({ deviceId: id, typeCode: 72, realtime: { temp: 23.5, pm25: 18 }, utc: nowSec() }).toString('hex'));
  let dev;
  for (let i = 0; i < 30 && !dev?.id; i++) {
    await new Promise((r) => setTimeout(r, 100));
    dev = await api(`/devices/${id}`);
  }
  await new Promise((r) => c.end(false, {}, r));
  assert.equal(dev.transport, 'mqtt');
  assert.equal(dev.realtime.pm25, 18);
});

test('AEP / OneNET 推送接口', async () => {
  const f1 = buildUplink({ deviceId: 'SHMK24060006', typeCode: 11, realtime: { temp: 30 }, utc: nowSec() });
  const r1 = await api('/push/aep', { method: 'POST', body: JSON.stringify({ messageType: 'dataReport', IMEI: '86000', payload: { APPdata: f1.toString('base64') } }) });
  assert.equal(r1.ok, true);
  const f2 = buildUplink({ deviceId: 'SHMK24060007', typeCode: 11, realtime: { temp: 31 }, utc: nowSec() });
  const r2 = await api('/push/onenet', { method: 'POST', body: JSON.stringify({ msg: JSON.stringify({ imei: '86001', value: f2.toString('hex') }) }) });
  assert.equal(r2.results[0].ok, true);
  assert.equal(await api('/push/onenet?msg=abc'), 'abc');
  const d = await api('/devices/SHMK24060007');
  assert.equal(d.transport, 'onenet');
});

test('统计接口', async () => {
  const o = await api('/stats/overview');
  assert.ok(o.devices.total >= 5);
  assert.ok(o.today.frames >= 5);
  const t = await api('/stats/trend?days=7');
  assert.equal(t.length, 7);
  assert.ok(t[6].frames >= 5);
  const a = await api('/stats/alarms');
  assert.ok(a.summary.total >= 1);
  const ty = await api('/stats/types');
  assert.ok(ty.find((x) => x.code === 1));
  const s = await api('/devices/SHMK24060001/stats');
  assert.equal(s.params[0].key, 'pressure');
  assert.equal(s.params[0].max, 0.41);
  const ser = await api('/devices/SHMK24060001/series?bucket=0');
  assert.equal(ser.points.length, 2);
  const csv = await api('/devices/SHMK24060001/export.csv');
  assert.match(csv, /压力\(MPa\)/);
});

test('报文解析工具', async () => {
  const r = await api('/tools/decode', { method: 'POST', body: JSON.stringify({ hex: 'a55a00003b53484d4b313930363030313334c8003c000a0102006401f4021a5d1966b60219021a0216021802180213021e021c021d021d7e0355aa' }) });
  assert.equal(r.deviceId, 'SHMK19060013');
  const dl = await api('/tools/downlink', { method: 'POST', body: JSON.stringify({ deviceId: 'JSSH19050005', utc: 0x5d19bbde }) });
  assert.equal(dl.hex, 'a55aff001b4a53534831393035303030355d19bbde0000a32b55aa');
  assert.ok(hexToBuffer(dl.hex).length === 27);
});
