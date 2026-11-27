import { hashPassword } from '../services/auth.js';
import { makeDemoDevices } from './virtualDevice.js';

/**
 * 生成演示数据：若干天的设备上报（通过接入服务写库，与真实上报完全一致）、
 * 设备档案、项目、维保记录、报警处理记录与演示账号。
 * 返回虚拟设备（含状态），可继续用于实时模拟。
 */
export function seedDemo({ db, ingest, days = 7, count = 28, nowMs = Date.now(), password = 'Demo1234', withAdmin = false }) {
  const devices = makeDemoDevices(count, { interval: 600, batch: 3 });
  const names = ['一号泵房', '二号泵房', '东区管网', '西区管网', '南门消防', '北门消防', '污水处理站', '1#配电房', '仓库A', '仓库B', '办公楼', '地下车库'];
  const groups = ['供水管网', '消防系统', '环境监测', '能源计量'];

  const now = Math.floor(nowMs / 1000);
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
    VALUES ('SHMK24069999', 0, 0, ?, 8, '液位表 m', 0, '新建雨水井液位（待安装）', 'MD-S271U', '城区供水二期', '上海市徐汇区待安装点位', 31.205, 121.445, '供水管网')`).run(nowMs);
  // 项目档案
  const PROJECT_INFO = {
    城区供水一期: ['GS-2024-01', '张工', '13800001111', '上海市黄浦区', '城区供水管网压力、液位在线监测'],
    城区供水二期: ['GS-2024-02', '李工', '13800002222', '上海市徐汇区', '二期管网扩建及雨水井液位监测'],
    消防物联网改造: ['XF-2024-01', '王工', '13800003333', '上海市静安区', '消火栓压力、闷盖、倾斜监测'],
    园区环境监测: ['HJ-2024-01', '赵工', '13800004444', '上海市长宁区', '温湿度、空气质量、噪声监测'],
  };
  const insProj = db.prepare('INSERT OR IGNORE INTO projects (name, code, owner, contact, address, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const [name, [code, owner, contact, address, desc]] of Object.entries(PROJECT_INFO)) insProj.run(name, code, owner, contact, address, desc, start * 1000);
  // 演示账号（密码 Demo1234，无需首次改密）
  const insUser = db.prepare(`INSERT OR IGNORE INTO users (username, name, phone, role, all_projects, password_hash, must_change, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`);
  const pid = (n) => db.prepare('SELECT id FROM projects WHERE name = ?').get(n).id;
  const demoUsers = [
    ['zhanggong', '张工', '13800001111', 'operator', 0, ['城区供水一期', '城区供水二期']],
    ['wanggong', '王工', '13800003333', 'operator', 0, ['消防物联网改造']],
    ['leader', '项目经理', '13900009999', 'viewer', 1, []],
  ];
  for (const [u, n, phone, role, all, ps] of demoUsers) {
    insUser.run(u, n, phone, role, all, hashPassword(password), nowMs);
    const id = db.prepare('SELECT id FROM users WHERE username = ?').get(u).id;
    for (const p of ps) db.prepare('INSERT OR IGNORE INTO user_projects (user_id, project_id) VALUES (?, ?)').run(id, pid(p));
  }
  if (withAdmin) {
    db.prepare("INSERT OR IGNORE INTO users (username, name, role, all_projects, password_hash, must_change, created_at) VALUES ('admin', '系统管理员', 'admin', 1, ?, 0, ?)")
      .run(hashPassword(password), nowMs);
    // 已由启动流程创建的初始管理员：改为演示密码且无需改密
    db.prepare("UPDATE users SET password_hash = ?, must_change = 0, role = 'admin', all_projects = 1, enabled = 1 WHERE username = 'admin'").run(hashPassword(password));
  }
  return { devices, offline, frames, lastTs: now };
}

/**
 * 实时模拟：每次调用时补齐自上次以来经过的时间（每分钟一次上报），让演示数据持续“在线”。
 * 长时间无人访问后最多补 2 小时，之前的时间段视为设备未上报。
 */
export class DemoRunner {
  constructor({ ingest, devices, offline, lastTs }) {
    this.ingest = ingest;
    this.devices = devices;
    this.offline = offline;
    this.lastTs = lastTs;
    this.busy = false;
    for (const d of devices) {
      d.interval = 60;
      d.batch = 1;
    }
  }

  catchUp(nowMs = Date.now()) {
    if (this.busy) return 0;
    this.busy = true;
    let n = 0;
    try {
      const now = Math.floor(nowMs / 1000);
      if (now - this.lastTs > 7200) this.lastTs = now - 7200;
      const transports = ['tcp', 'udp', 'mqtt', 'aep', 'onenet'];
      for (let ts = this.lastTs + 60; ts <= now; ts += 60) {
        for (const d of this.devices) {
          if (this.offline.has(d.id)) continue;
          const frame = d.tick(ts);
          if (!frame) continue;
          const i = Number(d.id.slice(-4));
          this.ingest.handle(frame, { transport: transports[i % transports.length], remote: 'demo', replyMode: 'none', now: ts * 1000 + 800 });
          n++;
        }
        this.lastTs = ts;
      }
    } finally {
      this.busy = false;
    }
    return n;
  }
}

export const DEMO_ACCOUNTS = [
  { username: 'admin', roleName: '管理员', desc: '全部功能，含用户、项目、系统设置' },
  { username: 'zhanggong', roleName: '运维人员', desc: '城区供水一期、二期' },
  { username: 'wanggong', roleName: '运维人员', desc: '消防物联网改造' },
  { username: 'leader', roleName: '只读用户', desc: '查看全部项目' },
];
