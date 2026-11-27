import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

export const config = {
  root,
  /** HTTP / Web 端口 */
  httpPort: num(env.HTTP_PORT, 8080),
  /** 设备 TCP 接入端口（二进制） */
  tcpPort: num(env.TCP_PORT, 9000),
  /** 设备 UDP 接入端口（二进制） */
  udpPort: num(env.UDP_PORT, 9001),
  /** 是否启用 TCP / UDP */
  tcpEnabled: bool(env.TCP_ENABLED, true),
  udpEnabled: bool(env.UDP_ENABLED, true),
  /** 上报后无新数据多少毫秒后主动断开 TCP（协议要求 5 秒） */
  tcpIdleCloseMs: num(env.TCP_IDLE_CLOSE_MS, 5000),

  /** MQTT：外部 Broker 地址，例如 mqtt://127.0.0.1:1883；为空则不连接 */
  mqttUrl: env.MQTT_URL || '',
  /** 平台连接外部 Broker 的用户名 / 密码 */
  mqttUsername: env.MQTT_USERNAME || '',
  mqttPassword: env.MQTT_PASSWORD || '',
  /** 内置 MQTT Broker；未配置外部 MQTT_URL 时平台自动连接内置 Broker（MQTT_BROKER_PORT=0 同样表示不启用） */
  mqttBrokerEnabled: bool(env.MQTT_BROKER_ENABLED, true) && num(env.MQTT_BROKER_PORT, 1883) !== 0,
  mqttBrokerPort: num(env.MQTT_BROKER_PORT, 1883) || 1883,
  /** 设备连接内置 Broker 的用户名 / 密码，为空不校验 */
  mqttBrokerUsername: env.MQTT_BROKER_USERNAME || '',
  mqttBrokerPassword: env.MQTT_BROKER_PASSWORD || '',
  mqttUplinkTopic: env.MQTT_UPLINK_TOPIC || 'GIOT-GW/UL/#',
  mqttDownlinkPrefix: env.MQTT_DOWNLINK_PREFIX || 'GIOT-GW/DL/',

  /** SQLite 数据文件 */
  dbFile: env.DB_FILE || path.join(root, 'data', 'iot.db'),
  /** 原始报文保留天数，0 表示永久 */
  frameRetentionDays: num(env.FRAME_RETENTION_DAYS, 90),
  /** 采集数据保留天数，0 表示永久 */
  readingRetentionDays: num(env.READING_RETENTION_DAYS, 0),

  /** 设备时间与平台时间相差超过该秒数时，以平台接收时间为准 */
  maxClockSkewSec: num(env.MAX_CLOCK_SKEW_SEC, 3600),
  /** 离线判定：超过 max(本值, 上报周期 × OFFLINE_FACTOR) 秒未上报即视为离线 */
  offlineMinSec: num(env.OFFLINE_MIN_SEC, 1800),
  offlineFactor: num(env.OFFLINE_FACTOR, 2.5),
  /** 统计使用的时区偏移（小时），默认北京时间 */
  tzOffsetHours: num(env.TZ_OFFSET_HOURS, 8),

  /** 若设置，则 /api 接口需要 Authorization: Bearer <token>（推送接口除外） */
  authToken: env.AUTH_TOKEN || '',
  /** 第三方平台推送接口的校验 token（OneNET / AEP），为空不校验 */
  pushToken: env.PUSH_TOKEN || '',

  /** 演示环境：开启后账号、项目与系统设置只读，登录页显示演示账号 */
  demoMode: bool(env.DEMO_MODE, false),
  demoPassword: env.DEMO_PASSWORD || 'Demo1234',
  /** 设置后使用签名令牌（无状态会话），适用于多实例部署 */
  sessionSecret: env.SESSION_SECRET || '',
  /** SSE 连接最长保持时间（毫秒），0 表示不限；无服务器环境需设置 */
  streamMaxMs: num(env.STREAM_MAX_MS, 0),
  /** 初始管理员 admin 的密码（仅在没有任何用户时使用；默认 admin123，首次登录强制修改） */
  adminPassword: env.ADMIN_PASSWORD || '',
  /** 登录页 */
  loginSlogan: env.LOGIN_SLOGAN || '设备接入 · 实时监测 · 告警处置 · 数据分析',
  copyright: env.COPYRIGHT || '',
  icpNo: env.ICP_NO || '',
  /** 平台与地图 */
  platformName: env.PLATFORM_NAME || '物联网设备监测平台',
  screenTitle: env.SCREEN_TITLE || '设备监测数据大屏',
  mapProvider: env.MAP_PROVIDER || 'amap',
  mapTileUrl: env.MAP_TILE_URL || '',
  mapTiandituKey: env.MAP_TIANDITU_KEY || '',
  mapScreenStyle: env.MAP_SCREEN_STYLE || 'esri_dark',
  mapCenterLng: num(env.MAP_CENTER_LNG, 121.4737),
  mapCenterLat: num(env.MAP_CENTER_LAT, 31.2304),
  mapZoom: num(env.MAP_ZOOM, 12),
  /** 告警推送 */
  notifyEnabled: bool(env.NOTIFY_ENABLED, false),
  notifyType: env.NOTIFY_TYPE || 'wecom',
  notifyUrl: env.NOTIFY_URL || '',
  notifySecret: env.NOTIFY_SECRET || '',
  notifyRecover: bool(env.NOTIFY_RECOVER, false),
  /** 设备照片目录 */
  photoDir: env.PHOTO_DIR || '',

  webDist: env.WEB_DIST || path.resolve(root, '..', 'web', 'dist'),
};
