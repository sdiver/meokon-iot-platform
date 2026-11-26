import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFrame, hexToBuffer, parseBattery } from '../src/protocol/decoder.js';
import { buildDownlink, buildUplink, encodeBattery, READ_ALL_CONFIG } from '../src/protocol/encoder.js';
import { crc16Modbus, crcBytes } from '../src/protocol/crc16.js';
import { FrameStreamParser } from '../src/protocol/streamParser.js';
import { DEVICE_TYPES, recordLength } from '../src/protocol/deviceTypes.js';

// 协议文档中的范例
const DOC_UPLINK = 'a55a00003b53484d4b313930363030313334c8003c000a0102006401f4021a5d1966b60219021a0216021802180213021e021c021d021d7e0355aa';
const DOC_ACK = 'a55aff001b4a53534831393035303030355d19bbde0000a32b55aa';
const DOC_READ_ALL = 'a55aff001d4a53534831393035303030355d19bbde0002ff00dfd855aa';

test('文档上行范例解析', () => {
  const d = decodeFrame(hexToBuffer(DOC_UPLINK));
  assert.equal(d.ok, true, d.errors.join());
  assert.equal(d.direction, 'up');
  assert.equal(d.length, 59);
  assert.equal(d.deviceId, 'SHMK19060013');
  assert.deepEqual([d.battery.source, d.battery.mode, d.battery.level], ['电池', '单电池供电', 100]);
  assert.equal(d.signal, -56);
  assert.equal(d.interval, 60);
  assert.equal(d.count, 10);
  assert.equal(d.typeCode, 1);
  assert.equal(d.alarm.raw, 2);
  assert.deepEqual(d.alarm.bits, [{ bit: 1, label: '高报警' }]);
  assert.deepEqual(d.alarmParams.map((a) => [a.low, a.high]), [[0.1, 0.5]]);
  assert.equal(d.realtime.pressure, 0.538);
  assert.equal(d.utc, 1561945782);
  assert.equal(d.records.length, 10);
  assert.equal(d.records[0].values.pressure, 0.537);
  assert.equal(d.records[9].values.pressure, 0.541);
  // 最新一条的时间为 UTC，往前依次减去记录间隔
  assert.equal(d.records[9].ts, 1561945782);
  assert.equal(d.records[8].ts, 1561945782 - 60);
  assert.equal(d.crc.ok, true);
});

test('文档下行范例（默认应答 / 读取所有配置）可原样生成', () => {
  assert.equal(buildDownlink('JSSH19050005', { utc: 0x5d19bbde }).toString('hex'), DOC_ACK);
  assert.equal(buildDownlink('JSSH19050005', { utc: 0x5d19bbde, params: READ_ALL_CONFIG }).toString('hex'), DOC_READ_ALL);
  const d = decodeFrame(hexToBuffer(DOC_READ_ALL));
  assert.equal(d.direction, 'down');
  assert.equal(d.params, 'ff00');
});

test('CRC16 MODBUS', () => {
  const b = hexToBuffer(DOC_UPLINK);
  const crc = crc16Modbus(b, 0, b.length - 4);
  assert.equal(crc, 0x7e03);
  assert.deepEqual(crcBytes(crc), [0x7e, 0x03]);
});

test('CRC 错误被识别', () => {
  const b = hexToBuffer(DOC_UPLINK);
  b[30] ^= 0xff;
  const d = decodeFrame(b);
  assert.equal(d.ok, false);
  assert.equal(d.crc.ok, false);
});

test('电量状态位', () => {
  assert.deepEqual(parseBattery(0x34), { raw: 0x34, external: false, source: '电池', modeCode: 1, mode: '单电池供电', level: 100 });
  const b = parseBattery(encodeBattery({ external: true, modeCode: 2, level: 50 }));
  assert.equal(b.source, '外供电');
  assert.equal(b.mode, '单外供电');
  assert.equal(b.level, 50);
});

test('所有设备类型都能编码后正确解码', () => {
  for (const def of DEVICE_TYPES.values()) {
    if (def.special) continue;
    const vals = Object.fromEntries(def.params.map((p, i) => [p.key, p.kind === 'num' && p.type !== 'f32' && p.type !== 'f64' ? (i + 1) * 3 * p.scale : i + 1]));
    const alarms = Array.from({ length: def.alarmGroups }, () => ({ low: 0, high: 0 }));
    const frame = buildUplink({ deviceId: 'TEST00000001', typeCode: def.code, realtime: vals, records: [vals, vals], utc: 1700000000, interval: 30, alarmParams: alarms });
    const d = decodeFrame(frame);
    assert.equal(d.ok, true, `type ${def.code}: ${d.errors.join()}`);
    assert.equal(d.warnings.length, 0, `type ${def.code}: ${d.warnings.join()}`);
    assert.equal(d.recordBytes, recordLength(def));
    for (const p of def.params) {
      assert.ok(Math.abs(d.realtime[p.key] - vals[p.key]) < 1e-6, `type ${def.code} ${p.key}: ${d.realtime[p.key]} != ${vals[p.key]}`);
    }
    assert.equal(d.records[0].ts, 1700000000 - 30);
  }
});

test('双传感器类型报警参数为 8 字节', () => {
  const frame = buildUplink({ deviceId: 'SHMK00000018', typeCode: 18, realtime: { hum: 55.5, temp: 23.4 }, alarmParams: [{ low: 20, high: 80 }, { low: -10, high: 40 }], alarmStatus: 0x40 });
  const d = decodeFrame(frame);
  assert.equal(d.ok, true);
  assert.deepEqual(d.alarmParams.map((a) => [a.name, a.low, a.high]), [['湿度', 20, 80], ['温度', -10, 40]]);
  assert.deepEqual(d.alarm.bits.map((b) => b.label), ['第二传感器高报警']);
  assert.equal(d.realtime.temp, 23.4);
});

test('类型专属报警位含义（消火栓 24）', () => {
  const frame = buildUplink({ deviceId: 'SHMK00000024', typeCode: 24, realtime: { pressure: 0.3, tilt: 30 }, alarmStatus: 0b11000000 });
  const d = decodeFrame(frame);
  assert.deepEqual(d.alarm.bits.map((b) => b.label), ['放水报警', '倾斜报警']);
});

test('MODBUS 采集终端（类型 45）按帧长推算记录长度', () => {
  // 报警参数 4 字节 + 实时记录 + UTC + 1 条缓存
  const rec = Buffer.from('010304000a00141234', 'hex'); // 地址1 功能码3 4字节数据 CRC
  const body = Buffer.concat([Buffer.from('00010002', 'hex'), rec, Buffer.from('6553f100', 'hex'), rec]);
  const head = Buffer.alloc(25);
  head.writeUInt16BE(0xa55a, 0);
  Buffer.from('SHMK00000045').copy(head, 5);
  head[17] = 0x34; head[18] = 0xc0; head.writeUInt16BE(60, 19); head.writeUInt16BE(1, 21); head[23] = 45;
  const frame = Buffer.concat([head, body, Buffer.alloc(4)]);
  frame.writeUInt16BE(frame.length, 3);
  const crc = crc16Modbus(frame, 0, frame.length - 4);
  frame.writeUInt16BE(crc, frame.length - 4);
  frame.writeUInt16BE(0x55aa, frame.length - 2);
  const d = decodeFrame(frame);
  assert.equal(d.ok, true, d.errors.join());
  assert.equal(d.recordBytes, 9);
  assert.equal(d.realtime._modbus.func, 3);
  assert.equal(d.realtime.reg0, 10);
  assert.equal(d.realtime.reg1, 20);
  assert.equal(d.alarmParams[0].name, 'MODBUS地址');
});

test('未知设备类型按通用格式解析', () => {
  const frame = buildUplink({ deviceId: 'SHMK00000001', typeCode: 1, realtime: { pressure: 1 } });
  frame[23] = 200;
  frame.writeUInt16BE(crc16Modbus(frame, 0, frame.length - 4), frame.length - 4);
  const d = decodeFrame(frame);
  assert.equal(d.ok, true);
  assert.equal(d.realtime.v0, 1000);
  assert.ok(d.warnings.length > 0);
});

test('TCP 分帧：粘包、拆包、前导垃圾', () => {
  const a = hexToBuffer(DOC_UPLINK);
  const b = buildUplink({ deviceId: 'SHMK00000002', typeCode: 11, realtime: { temp: 12.3 } });
  const stream = Buffer.concat([Buffer.from([1, 2, 3, 0xa5]), a, b]);
  const p = new FrameStreamParser();
  const out = [];
  for (let i = 0; i < stream.length; i += 7) out.push(...p.push(stream.subarray(i, i + 7)));
  assert.equal(out.length, 2);
  assert.equal(out[0].toString('hex'), DOC_UPLINK);
  assert.equal(decodeFrame(out[1]).realtime.temp, 12.3);
});
