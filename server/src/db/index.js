import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,           -- 12 位设备编号
  name          TEXT,
  location      TEXT,
  group_name    TEXT,
  remark        TEXT,
  lat           REAL,
  lng           REAL,
  type_code     INTEGER,
  type_name     TEXT,
  first_seen    INTEGER NOT NULL,           -- 毫秒
  last_seen     INTEGER NOT NULL,           -- 毫秒，平台接收时间
  last_utc      INTEGER,                    -- 秒，设备上报的 UTC
  transport     TEXT,
  remote        TEXT,
  battery_raw   INTEGER,
  battery_level INTEGER,
  power_source  TEXT,
  power_mode    TEXT,
  signal        INTEGER,
  interval_sec  INTEGER,
  record_count  INTEGER,
  alarm_raw     INTEGER DEFAULT 0,
  alarm_bits    TEXT,                       -- JSON
  alarm_params  TEXT,                       -- JSON
  realtime      TEXT,                       -- JSON
  frame_count   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS frames (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id    TEXT,
  received_at  INTEGER NOT NULL,            -- 毫秒
  direction    TEXT NOT NULL,               -- up | down | ack
  transport    TEXT,
  remote       TEXT,
  raw_hex      TEXT NOT NULL,
  ok           INTEGER NOT NULL,
  crc_ok       INTEGER,
  error        TEXT,
  type_code    INTEGER,
  record_count INTEGER,
  alarm_raw    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_frames_device ON frames(device_id, received_at);
CREATE INDEX IF NOT EXISTS idx_frames_time ON frames(received_at);

CREATE TABLE IF NOT EXISTS readings (
  device_id TEXT NOT NULL,
  ts        INTEGER NOT NULL,               -- 秒，采集时间
  vals      TEXT NOT NULL,                  -- JSON {key: value}
  alarm_raw INTEGER DEFAULT 0,
  PRIMARY KEY (device_id, ts)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts);

CREATE TABLE IF NOT EXISTS alarms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id  TEXT NOT NULL,
  type_code  INTEGER,
  bit        INTEGER NOT NULL,
  label      TEXT NOT NULL,
  start_ts   INTEGER NOT NULL,              -- 毫秒
  end_ts     INTEGER,                       -- 毫秒，为空表示仍在报警
  snapshot   TEXT,                          -- 触发时的实时数据 JSON
  thresholds TEXT,                          -- 触发时的报警参数 JSON
  acked      INTEGER DEFAULT 0,
  acked_at   INTEGER,
  note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_alarms_device ON alarms(device_id, start_ts);
CREATE INDEX IF NOT EXISTS idx_alarms_open ON alarms(end_ts);
CREATE INDEX IF NOT EXISTS idx_alarms_time ON alarms(start_ts);

CREATE TABLE IF NOT EXISTS commands (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id  TEXT NOT NULL,
  params_hex TEXT NOT NULL,
  note       TEXT,
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | sent | acked | cancelled
  created_at INTEGER NOT NULL,
  sent_at    INTEGER,
  sent_via   TEXT,
  ack_at     INTEGER,
  ack_hex    TEXT
);
CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_id, status);
`;

/** 报警严重程度：high 越限/安全事件，mid 传感器/硬件异常，low 电量 */
export const ALARM_LEVEL_SQL = `CASE
  WHEN label IN ('电量报警') THEN 'low'
  WHEN label IN ('传感器异常', '硬件异常') THEN 'mid'
  ELSE 'high' END`;

/** 版本化迁移：已有数据库启动时自动升级 */
const MIGRATIONS = [
  // v1：初始结构（SCHEMA）
  () => {},
  // v2：设备档案、报警处理流程、设备轨迹、维保记录
  (db) => {
    const addCols = (table, cols) => {
      const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
      for (const [name, def] of cols) if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
    };
    addCols('devices', [
      ['model', 'TEXT'], ['alias', 'TEXT'], ['project', 'TEXT'], ['owner', 'TEXT'], ['contact', 'TEXT'],
      ['asset_no', 'TEXT'], ['imei', 'TEXT'], ['iccid', 'TEXT'], ['hw_version', 'TEXT'], ['sw_version', 'TEXT'],
      ['comm_type', 'TEXT'], ['photo', 'TEXT'], ['alarm_push', 'INTEGER DEFAULT 1'], ['min_signal', 'INTEGER'],
      ['created_at', 'INTEGER'],
    ]);
    db.exec('UPDATE devices SET created_at = first_seen WHERE created_at IS NULL');
    // 报警处理状态：0 未处理 / 1 已记录 / 2 已处理
    addCols('alarms', [['status', 'INTEGER DEFAULT 0'], ['handled_at', 'INTEGER'], ['level', 'TEXT']]);
    db.exec('UPDATE alarms SET status = 1, handled_at = acked_at WHERE acked = 1 AND status = 0');
    db.exec(`UPDATE alarms SET level = ${ALARM_LEVEL_SQL} WHERE level IS NULL`);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_alarms_status ON alarms(status, start_ts);
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        ts INTEGER NOT NULL,            -- 毫秒
        lat REAL NOT NULL,
        lng REAL NOT NULL,              -- WGS84
        source TEXT,                    -- gps | manual
        address TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_locations_device ON locations(device_id, ts);
      CREATE TABLE IF NOT EXISTS maintenance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        type TEXT NOT NULL,             -- 更换SIM卡 | 更换电池 | 维修 | 安装 | 其他
        old_value TEXT,
        new_value TEXT,
        note TEXT,
        ts INTEGER NOT NULL,            -- 毫秒
        auto INTEGER DEFAULT 0          -- 1 = 平台自动识别
      );
      CREATE INDEX IF NOT EXISTS idx_maintenance_device ON maintenance(device_id, ts);
      CREATE INDEX IF NOT EXISTS idx_maintenance_time ON maintenance(ts);
    `);
  },
];

function migrate(db) {
  const v = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try {
      MIGRATIONS[i](db);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** @returns {DatabaseSync} */
export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** 事务封装（使用 SAVEPOINT，可嵌套在外层事务中） */
let spSeq = 0;
export function tx(db, fn) {
  const sp = `sp_${++spSeq}`;
  db.exec(`SAVEPOINT ${sp}`);
  try {
    const r = fn();
    db.exec(`RELEASE ${sp}`);
    return r;
  } catch (e) {
    db.exec(`ROLLBACK TO ${sp}`);
    db.exec(`RELEASE ${sp}`);
    throw e;
  }
}
