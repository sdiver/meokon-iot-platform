/**
 * 平台设置：在环境变量（默认值）之上，允许通过 Web 界面修改并持久化到数据库。
 * 优先级：数据库中保存的值 > 环境变量 > 内置默认值。
 *
 * apply 字段说明修改后的生效方式：
 *   runtime  —— 立即生效
 *   tcp/udp/mqtt —— 自动重启对应的接入服务
 *   restart  —— 需要重启进程（只读展示）
 */

const int = (min, max) => ({ type: 'int', min, max });
const num = (min, max) => ({ type: 'number', min, max });

const select = (options) => ({ type: 'select', options });

export const SETTING_GROUPS = [
  { key: 'display', title: '平台与地图', desc: '平台名称、数据大屏标题与地图底图。高德底图使用 GCJ-02 坐标，平台会自动从 WGS84 换算' },
  { key: 'notify', title: '告警推送', desc: '新报警推送到企业微信 / 钉钉 / 飞书群机器人或自定义 Webhook；设备档案中可单独关闭某台设备的推送' },
  { key: 'tcp', title: 'TCP 接入', desc: '设备作为 socket 客户端，以二进制报文上报；平台在 5 秒内应答' },
  { key: 'udp', title: 'UDP 接入', desc: '二进制报文，平台回复下行应答帧' },
  { key: 'mqtt', title: 'MQTT 接入', desc: '报文为十六进制字符串。可使用内置 Broker 让设备直连平台，或连接外部 Broker 订阅设备数据' },
  { key: 'runtime', title: '运行参数', desc: '在线判定、时间校正与统计时区' },
  { key: 'retention', title: '数据保留', desc: '过期数据每 6 小时自动清理一次' },
  { key: 'security', title: '访问安全', desc: '访问令牌与第三方推送校验' },
];

export const SETTING_DEFS = [
  { key: 'platformName', group: 'display', label: '平台名称', type: 'string', apply: 'runtime', required: true },
  { key: 'screenTitle', group: 'display', label: '数据大屏标题', type: 'string', apply: 'runtime', required: true },
  { key: 'mapProvider', group: 'display', label: '地图底图', ...select([
    ['amap', '高德地图（国内推荐）'], ['amap_sat', '高德卫星图'], ['tianditu_vec', '天地图（需申请 Key）'], ['tianditu_img', '天地图影像（需申请 Key）'],
    ['esri_street', 'Esri 街道图'], ['esri_img', 'Esri 卫星影像'], ['osm', 'OpenStreetMap'], ['custom', '自定义瓦片'],
  ]), apply: 'runtime', help: '所有地图均可在右下角切换“地图 / 卫星”；底图无法访问时自动回退到高德地图' },
  { key: 'mapTiandituKey', group: 'display', label: '天地图 Key', type: 'string', apply: 'runtime', placeholder: '浏览器端 Key', help: '在 lbs.tianditu.gov.cn 免费申请“浏览器端”Key；未填写时天地图选项回退为高德' },
  { key: 'mapTileUrl', group: 'display', label: '自定义瓦片地址', type: 'string', apply: 'runtime', placeholder: 'https://.../{z}/{x}/{y}.png', help: '仅“自定义瓦片”时使用，支持 {s} {z} {x} {y}；坐标按 WGS84 处理' },
  { key: 'mapScreenStyle', group: 'display', label: '数据大屏底图', ...select([
    ['esri_dark', 'Esri 深色底图'], ['night', '当前底图 + 夜间滤镜'], ['esri_img', 'Esri 卫星影像'],
  ]), apply: 'runtime' },
  { key: 'mapCenterLng', group: 'display', label: '默认中心经度', ...num(-180, 180), apply: 'runtime', help: '无设备坐标时地图的默认中心（WGS84）' },
  { key: 'mapCenterLat', group: 'display', label: '默认中心纬度', ...num(-90, 90), apply: 'runtime' },
  { key: 'mapZoom', group: 'display', label: '默认缩放级别', ...int(3, 18), apply: 'runtime' },

  { key: 'notifyEnabled', group: 'notify', label: '启用告警推送', type: 'bool', apply: 'runtime' },
  { key: 'notifyType', group: 'notify', label: '推送渠道', ...select([['wecom', '企业微信群机器人'], ['dingtalk', '钉钉群机器人'], ['feishu', '飞书群机器人'], ['webhook', '自定义 Webhook（JSON）']]), apply: 'runtime' },
  { key: 'notifyUrl', group: 'notify', label: 'Webhook 地址', type: 'string', secret: true, apply: 'runtime', help: '机器人的完整 Webhook 地址（含 key / access_token）' },
  { key: 'notifySecret', group: 'notify', label: '加签密钥', type: 'string', secret: true, apply: 'runtime', help: '钉钉 / 飞书机器人开启“加签”时填写，其他留空' },
  { key: 'notifyRecover', group: 'notify', label: '推送报警恢复', type: 'bool', apply: 'runtime', help: '报警位清除时也推送一条恢复消息' },

  { key: 'tcpEnabled', group: 'tcp', label: '启用 TCP', type: 'bool', apply: 'tcp' },
  { key: 'tcpPort', group: 'tcp', label: 'TCP 端口', ...int(1, 65535), apply: 'tcp' },
  { key: 'tcpIdleCloseMs', group: 'tcp', label: '空闲断开时间', unit: '毫秒', ...int(1000, 600000), apply: 'runtime', help: '设备上报后无新数据多长时间主动断开连接（协议要求 5 秒）' },

  { key: 'udpEnabled', group: 'udp', label: '启用 UDP', type: 'bool', apply: 'udp' },
  { key: 'udpPort', group: 'udp', label: 'UDP 端口', ...int(1, 65535), apply: 'udp' },

  { key: 'mqttBrokerEnabled', group: 'mqtt', label: '启用内置 Broker', type: 'bool', apply: 'mqtt' },
  { key: 'mqttBrokerPort', group: 'mqtt', label: '内置 Broker 端口', ...int(1, 65535), apply: 'mqtt' },
  { key: 'mqttBrokerUsername', group: 'mqtt', label: '设备连接用户名', type: 'string', apply: 'mqtt', help: '设备连接内置 Broker 时使用；留空则不校验' },
  { key: 'mqttBrokerPassword', group: 'mqtt', label: '设备连接密码', type: 'string', secret: true, apply: 'mqtt' },
  { key: 'mqttUrl', group: 'mqtt', label: '外部 Broker 地址', type: 'string', apply: 'mqtt', placeholder: 'mqtt://host:1883', help: '留空则连接内置 Broker；填写后平台连接该地址订阅设备数据' },
  { key: 'mqttUsername', group: 'mqtt', label: '外部 Broker 用户名', type: 'string', apply: 'mqtt' },
  { key: 'mqttPassword', group: 'mqtt', label: '外部 Broker 密码', type: 'string', secret: true, apply: 'mqtt' },
  { key: 'mqttUplinkTopic', group: 'mqtt', label: '上行订阅主题', type: 'string', apply: 'mqtt', required: true },
  { key: 'mqttDownlinkPrefix', group: 'mqtt', label: '下行主题前缀', type: 'string', apply: 'mqtt', required: true, help: '下行主题 = 前缀 + 设备编号' },

  { key: 'offlineMinSec', group: 'runtime', label: '离线判定最短时间', unit: '秒', ...int(60, 30 * 86400), apply: 'runtime', help: '超过 max(本值, 上报周期 × 系数) 未上报视为离线' },
  { key: 'offlineFactor', group: 'runtime', label: '离线判定系数', ...num(1, 100), apply: 'runtime' },
  { key: 'maxClockSkewSec', group: 'runtime', label: '设备时间最大偏差', unit: '秒', ...int(0, 365 * 86400), apply: 'runtime', help: '设备 UTC 与平台时间相差超过该值时，以平台接收时间为准' },
  { key: 'tzOffsetHours', group: 'runtime', label: '统计时区', unit: '小时', ...num(-12, 14), apply: 'runtime', help: '按日统计使用的时区偏移，北京时间为 8' },

  { key: 'frameRetentionDays', group: 'retention', label: '原始报文保留', unit: '天', ...int(0, 36500), apply: 'runtime', help: '0 表示永久保留' },
  { key: 'readingRetentionDays', group: 'retention', label: '采集数据保留', unit: '天', ...int(0, 36500), apply: 'runtime', help: '0 表示永久保留' },

  { key: 'authToken', group: 'security', label: '平台访问令牌', type: 'string', secret: true, apply: 'runtime', help: '设置后访问 Web 与 API 需要输入该令牌；留空表示不校验' },
  { key: 'pushToken', group: 'security', label: '推送接口令牌', type: 'string', secret: true, apply: 'runtime', help: '设置后第三方推送地址需带 ?token=该值' },
];

const DEFS = new Map(SETTING_DEFS.map((d) => [d.key, d]));
const SECRET_MASK = '******';

export class SettingsError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function coerce(def, raw) {
  if (def.type === 'bool') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true' || raw === 1 || raw === '1') return true;
    if (raw === 'false' || raw === 0 || raw === '0') return false;
    throw new SettingsError(`${def.label} 必须为开或关`);
  }
  if (def.type === 'int' || def.type === 'number') {
    const v = Number(raw);
    if (raw === '' || raw === null || !Number.isFinite(v)) throw new SettingsError(`${def.label} 必须是数字`);
    if (def.type === 'int' && !Number.isInteger(v)) throw new SettingsError(`${def.label} 必须是整数`);
    if (v < def.min || v > def.max) throw new SettingsError(`${def.label} 取值范围 ${def.min} ~ ${def.max}`);
    return v;
  }
  if (def.type === 'select') {
    const v = String(raw ?? '');
    if (!def.options.some(([k]) => k === v)) throw new SettingsError(`${def.label} 取值无效`);
    return v;
  }
  const s = raw == null ? '' : String(raw).trim();
  if (s.length > 500) throw new SettingsError(`${def.label} 过长`);
  if (def.required && !s) throw new SettingsError(`${def.label} 不能为空`);
  if ((def.key === 'notifyUrl' || def.key === 'mapTileUrl') && s && !/^https?:\/\/[^\s]+$/i.test(s)) throw new SettingsError(`${def.label} 应以 http:// 或 https:// 开头`);
  if (def.key === 'mqttUrl' && s && !/^(mqtts?|wss?|tcp|ssl):\/\/[^\s]+$/i.test(s)) throw new SettingsError('外部 Broker 地址格式应为 mqtt://host:port');
  return s;
}

export class SettingsStore {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   * @param {object} config 运行中的配置对象（会被原地更新，各服务读取的都是同一个对象）
   */
  constructor(db, config) {
    this.db = db;
    this.config = config;
    db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    // 启动时的配置（环境变量 + 默认值），用于“恢复默认”
    this.base = Object.fromEntries(SETTING_DEFS.map((d) => [d.key, config[d.key]]));
    this.overrides = {};
    for (const row of db.prepare('SELECT key, value FROM settings').all()) {
      const def = DEFS.get(row.key);
      if (!def) continue;
      try {
        this.overrides[row.key] = coerce(def, JSON.parse(row.value));
      } catch {
        /* 忽略无效的历史值 */
      }
    }
    Object.assign(config, this.overrides);
  }

  /** 供界面展示的设置列表（密码类字段不回显） */
  list() {
    return {
      groups: SETTING_GROUPS,
      items: SETTING_DEFS.map((d) => {
        const v = this.config[d.key];
        return {
          ...d,
          value: d.secret ? (v ? SECRET_MASK : '') : v,
          isSet: d.secret ? Boolean(v) : undefined,
          source: d.key in this.overrides ? 'platform' : 'env',
          defaultValue: d.secret ? (this.base[d.key] ? SECRET_MASK : '') : this.base[d.key],
        };
      }),
      readonly: [
        { label: 'Web / API 端口', value: this.config.httpPort, help: '通过环境变量 HTTP_PORT 修改，需重启' },
        { label: '数据库文件', value: this.config.dbFile, help: '通过环境变量 DB_FILE 修改，需重启' },
      ],
    };
  }

  /**
   * 校验并保存。密码类字段提交 ****** 表示不修改。
   * @returns {{changed: string[], applyGroups: Set<string>}}
   */
  update(patch) {
    const next = {};
    for (const [key, raw] of Object.entries(patch || {})) {
      const def = DEFS.get(key);
      if (!def) throw new SettingsError(`未知设置项 ${key}`);
      if (def.secret && raw === SECRET_MASK) continue;
      next[key] = coerce(def, raw);
    }
    // 跨字段校验：端口冲突
    const merged = { ...this.config, ...next };
    const ports = [];
    if (merged.tcpEnabled) ports.push(['TCP', merged.tcpPort]);
    if (merged.mqttBrokerEnabled) ports.push(['MQTT Broker', merged.mqttBrokerPort]);
    ports.push(['Web', merged.httpPort]);
    const seen = new Map();
    for (const [name, p] of ports) {
      if (seen.has(p)) throw new SettingsError(`${name} 端口 ${p} 与 ${seen.get(p)} 端口冲突`);
      seen.set(p, name);
    }

    const changed = Object.keys(next).filter((k) => next[k] !== this.config[k]);
    const now = Date.now();
    const stmt = this.db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
    for (const k of Object.keys(next)) {
      stmt.run(k, JSON.stringify(next[k]), now);
      this.overrides[k] = next[k];
    }
    Object.assign(this.config, next);
    return { changed, applyGroups: new Set(changed.map((k) => DEFS.get(k).apply)) };
  }

  /** 恢复为环境变量 / 默认值 */
  reset(keys) {
    const list = keys?.length ? keys : Object.keys(this.overrides);
    const changed = [];
    for (const k of list) {
      if (!DEFS.has(k)) throw new SettingsError(`未知设置项 ${k}`);
      this.db.prepare('DELETE FROM settings WHERE key = ?').run(k);
      delete this.overrides[k];
      if (this.config[k] !== this.base[k]) changed.push(k);
      this.config[k] = this.base[k];
    }
    return { changed, applyGroups: new Set(changed.map((k) => DEFS.get(k).apply)) };
  }
}
