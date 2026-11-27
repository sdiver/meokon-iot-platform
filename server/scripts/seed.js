#!/usr/bin/env node
/**
 * 生成演示历史数据：直接调用接入服务写库，模拟若干天的设备上报。
 *   node scripts/seed.js [天数=7] [设备数=28]
 */
import { EventEmitter } from 'node:events';
import { config } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { IngestService } from '../src/services/ingest.js';
import { seedDemo } from '../src/demo/demoData.js';

const days = Number(process.argv[2] || 7);
const count = Number(process.argv[3] || 28);
const db = openDatabase(config.dbFile);
const ingest = new IngestService(db, config, new EventEmitter());
const { devices, frames } = seedDemo({ db, ingest, days, count });
console.log(`已生成 ${devices.length} 台设备、${frames} 帧上报（${days} 天），数据库：${config.dbFile}`);
console.log('演示账号：zhanggong / wanggong（运维）、leader（只读），密码均为 Demo1234；管理员 admin 首次启动自动创建');
db.close();
