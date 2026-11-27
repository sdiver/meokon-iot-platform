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
// 补充设备档案：名称、位置、坐标（WGS84，上海市中心周边）、分组、型号、负责人等
const MODELS = { 1: 'MD-S271', 8: 'MD-S271U', 11: 'MD-T110', 18: 'MD-HT20', 17: 'MD-PT30', 24: 'MD-S960', 27: 'MD-F350', 31: 'MD-G210',
  33: 'MD-LP40', 34: 'MD-S961', 40: 'MD-S982', 47: 'MD-W101', 54: 'MD-W301', 60: 'MD-E300', 65: 'MD-T330', 72: 'MD-A800', 88: 'MD-P410',
  92: 'MD-T340', 93: 'MD-LH50', 30: 'MD-S271U', 41: 'MD-N100', 20: 'MD-W200', 89: 'MD-F360G' };
const OWNERS = [['张工', '13800001111'], ['李工', '13800002222'], ['王工', '13800003333'], ['赵工', '13800004444']];
const PROJECTS = ['城区供水一期', '城区供水二期', '消防物联网改造', '园区环境监测'];
const upd = db.prepare(`UPDATE devices SET name = COALESCE(name, ?), location = COALESCE(location, ?), group_name = COALESCE(group_name, ?),
  lat = COALESCE(lat, ?), lng = COALESCE(lng, ?), model = COALESCE(model, ?), alias = COALESCE(alias, ?), project = COALESCE(project, ?),
  owner = COALESCE(owner, ?), contact = COALESCE(contact, ?), asset_no = COALESCE(asset_no, ?), comm_type = COALESCE(comm_type, ?),
  imei = COALESCE(imei, ?), iccid = COALESCE(iccid, ?), hw_version = COALESCE(hw_version, 'HW_V4.2'), sw_version = COALESCE(sw_version, 'FW_V2.4.1'),
  created_at = ? WHERE id = ?`);
const insLoc = db.prepare("INSERT INTO locations (device_id, ts, lat, lng, source, address) VALUES (?, ?, ?, ?, 'manual', ?)");
const insMaint = db.prepare('INSERT INTO maintenance (device_id, type, old_value, new_value, note, ts, auto) VALUES (?, ?, ?, ?, ?, ?, 0)');
const rnd = (a, b) => a + Math.random() * (b - a);
const comm = ['4G', 'NB-IoT', '4G', 'NB-IoT', 'Cat.1'];
devices.forEach((d, i) => {
  const lat = 31.2304 + rnd(-0.045, 0.045);
  const lng = 121.4737 + rnd(-0.06, 0.06);
  const [owner, contact] = OWNERS[i % OWNERS.length];
  const iccid = `8986${String(1124200085669000 + i * 37).padStart(16, '0')}`;
  const loc = `上海市${['黄浦区', '静安区', '徐汇区', '长宁区'][i % 4]}${names[i % names.length]}`;
  upd.run(`${d.def.name.replace(/（.*?）|\(.*?\)/g, '')}-${String(i + 1).padStart(2, '0')}`, loc, groups[i % groups.length],
    Number(lat.toFixed(6)), Number(lng.toFixed(6)), MODELS[d.typeCode] ?? 'MD-S900', d.def.name.replace(/（.*?）|\(.*?\)/g, ''),
    PROJECTS[i % PROJECTS.length], owner, contact, `ZC-${String(1001 + i)}`, comm[i % comm.length],
    `8672440853${String(31173 + i).padStart(5, '0')}`, iccid, start * 1000 - 86400000 * 3, d.id);
  insLoc.run(d.id, start * 1000 - 86400000 * 3, Number(lat.toFixed(6)), Number(lng.toFixed(6)), loc);
  if (i % 5 === 1) insMaint.run(d.id, '更换SIM卡', iccid.replace(/\d{4}$/, '0000'), iccid, '原卡信号差，更换运营商', (start + 86400 * 1.5) * 1000);
  if (i % 6 === 2) insMaint.run(d.id, '维修', null, null, '传感器接头松动，已紧固', (start + 86400 * 3.2) * 1000);
  if (i % 7 === 3) insMaint.run(d.id, '巡检', null, null, '季度巡检，外观及读数正常', (start + 86400 * 5) * 1000);
});
// 历史报警：一天前的大部分已处理 / 已记录，最近的保持未处理
const dayAgo = Date.now() - 86400000;
db.prepare("UPDATE alarms SET status = 2, acked = 1, handled_at = COALESCE(end_ts, start_ts) + 1800000, acked_at = COALESCE(end_ts, start_ts) + 1800000, note = '已现场核查，读数恢复正常' WHERE start_ts < ? AND end_ts IS NOT NULL AND id % 4 <> 0").run(dayAgo);
db.prepare("UPDATE alarms SET status = 1, acked = 1, handled_at = start_ts + 600000, acked_at = start_ts + 600000, note = '已知悉，安排巡检' WHERE start_ts < ? AND status = 0 AND id % 3 = 0").run(dayAgo);
// 预先登记一台尚未上报的设备
db.prepare(`INSERT OR IGNORE INTO devices (id, first_seen, last_seen, created_at, type_code, type_name, frame_count, name, model, project, location, lat, lng, group_name)
  VALUES ('SHMK24069999', 0, 0, ?, 8, '液位表 m', 0, '新建雨水井液位（待安装）', 'MD-S271U', '城区供水二期', '上海市徐汇区待安装点位', 31.205, 121.445, '供水管网')`).run(Date.now());
console.log(`已生成 ${devices.length} 台设备、${frames} 帧上报（${days} 天），数据库：${config.dbFile}`);
db.close();
