#!/usr/bin/env node
/**
 * 生成演示历史数据：直接调用接入服务写库，模拟若干天的设备上报。
 *   node scripts/seed.js [天数=7] [设备数=28]
 */
import { EventEmitter } from 'node:events';
import { config } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { IngestService } from '../src/services/ingest.js';
import { makeDemoDevices } from './virtualDevice.js';

const days = Number(process.argv[2] || 7);
const count = Number(process.argv[3] || 28);
const db = openDatabase(config.dbFile);
const ingest = new IngestService(db, config, new EventEmitter());
const devices = makeDemoDevices(count, { interval: 600, batch: 3 });
const names = ['一号泵房', '二号泵房', '东区管网', '西区管网', '南门消防', '北门消防', '污水处理站', '1#配电房', '仓库A', '仓库B', '办公楼', '地下车库'];
const groups = ['供水管网', '消防系统', '环境监测', '能源计量'];

const now = Math.floor(Date.now() / 1000);
const start = now - days * 86400;
const transports = ['tcp', 'udp', 'mqtt', 'aep', 'onenet'];
let frames = 0;
// 让少数设备在最近几小时“离线”
const offline = new Set(devices.filter((_, i) => i % 9 === 8).map((d) => d.id));
for (let ts = start; ts <= now; ts += 600) {
  db.exec('BEGIN');
  for (const d of devices) {
    if (offline.has(d.id) && ts > now - 6 * 3600) continue;
    const frame = d.tick(ts);
    if (!frame) continue;
    const i = Number(d.id.slice(-4));
    ingest.handle(frame, { transport: transports[i % transports.length], remote: 'seed', replyMode: 'none', now: ts * 1000 + 1500 });
    frames++;
  }
  db.exec('COMMIT');
}
// 补充设备名称、位置、分组
const upd = db.prepare('UPDATE devices SET name = COALESCE(name, ?), location = COALESCE(location, ?), group_name = COALESCE(group_name, ?) WHERE id = ?');
devices.forEach((d, i) => upd.run(`${d.def.name.replace(/（.*?）|\(.*?\)/g, '')}-${String(i + 1).padStart(2, '0')}`, names[i % names.length], groups[i % groups.length], d.id));
console.log(`已生成 ${devices.length} 台设备、${frames} 帧上报（${days} 天），数据库：${config.dbFile}`);
db.close();
