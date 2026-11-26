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

/** @returns {DatabaseSync} */
export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
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
