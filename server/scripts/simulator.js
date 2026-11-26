#!/usr/bin/env node
/**
 * 设备模拟器：按协议构造上行帧，通过 TCP / UDP / MQTT 实时发送到平台，并打印平台下行应答。
 *
 *   node scripts/simulator.js [--host 127.0.0.1] [--transport tcp|udp|mqtt|mix] [--devices 10] [--period 5]
 *
 * period：每台设备每隔多少秒上报一次（演示用，设备内部采集间隔仍按 60 秒标记）。
 */
import net from 'node:net';
import dgram from 'node:dgram';
import mqtt from 'mqtt';
import { makeDemoDevices } from './virtualDevice.js';
import { decodeFrame } from '../src/protocol/decoder.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));
const host = args.host || '127.0.0.1';
const tcpPort = Number(args['tcp-port'] || 9000);
const udpPort = Number(args['udp-port'] || 9001);
const mqttUrl = args.mqtt || `mqtt://${host}:1883`;
const transport = args.transport || 'mix';
const period = Number(args.period || 5);
const devices = makeDemoDevices(Number(args.devices || 10), { interval: 60, batch: 1 });

let mq = null;
if (transport === 'mqtt' || transport === 'mix') {
  mq = mqtt.connect(mqttUrl, { clientId: `meokon-sim-${process.pid}` });
  mq.on('connect', () => {
    console.log(`[mqtt] 已连接 ${mqttUrl}`);
    mq.subscribe('GIOT-GW/DL/#');
  });
  mq.on('message', (t, p) => console.log(`[mqtt] ← ${t} ${p.toString()}`));
  mq.on('error', (e) => console.error('[mqtt]', e.message));
}
const udp = dgram.createSocket('udp4');
udp.on('message', (m) => log('udp', m));

function log(tag, buf) {
  const d = decodeFrame(buf);
  console.log(`[${tag}] ← 下行 ${d.deviceId} 参数 ${d.paramLength ? d.params : '(默认应答)'}`);
}

function sendTcp(frame) {
  const s = net.connect(tcpPort, host, () => s.write(frame));
  s.on('data', (b) => { log('tcp', b); s.end(); });
  s.on('error', (e) => console.error('[tcp]', e.message));
  s.setTimeout(6000, () => s.destroy());
}

function pick(i) {
  if (transport !== 'mix') return transport;
  return ['tcp', 'udp', 'mqtt'][i % 3];
}

console.log(`模拟 ${devices.length} 台设备，每 ${period} 秒上报，方式：${transport}`);
devices.forEach((d, i) => {
  const run = () => {
    const frame = d.tick(Math.floor(Date.now() / 1000));
    if (!frame) return;
    const t = pick(i);
    if (t === 'tcp') sendTcp(frame);
    else if (t === 'udp') udp.send(frame, udpPort, host);
    else if (mq?.connected) mq.publish(`GIOT-GW/UL/${d.id}`, frame.toString('hex'));
    console.log(`[${t}] → ${d.id} 类型${d.typeCode} ${frame.length}B`);
  };
  setTimeout(() => { run(); setInterval(run, period * 1000); }, Math.random() * period * 1000);
});
