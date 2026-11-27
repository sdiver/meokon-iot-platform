# MEOKON 物联网设备监测平台

基于《智能无线终端通讯协议 V3.3》（上海铭控 MEOKON）实现的物联网设备接入、信息展示、数据展示与统计平台。

- **设备接入**：UDP / TCP（二进制）、MQTT（十六进制字符串，内置 Broker）、电信 AEP、移动 OneNET、通用 HTTP
- **协议解析**：上行数据帧 0x00、平台下行帧 0xFF、设备应答 0x04；表一 电量状态、表二 设备类型（0 ~ 102）、表三 报警状态、表四 报警参数、表五 数据记录；CRC16/MODBUS 校验
- **数据概览**：设备 / 告警 KPI、设备分布地图、待处理告警、按告警类型的历史趋势、上报量、类型 / 电量 / 信号分布、实时上报流
- **数据大屏**：1920×1080 等比缩放的深色大屏（设备概况、在线率、分组、告警概况 / 类型 / 趋势、滚动告警列表、夜间地图），手机上自动改为纵向布局
- **设备管理**
  - 设备列表：首次上报自动登记，支持预先登记、CSV 批量导入 / 导出（兼容 Excel GBK 编码）
  - 设备档案：照片、产品型号 / 别名、项目、分组、负责人、联系方式、资产编号、IMEI、ICCID、软硬件版本、通讯方式、告警推送开关、地图选点
  - 设备详情：实时数据（报警范围标尺）、采集数据（列表 / 曲线切换、导出）、统计分析、关于设备、运行信息（上发次数、成功率、历史最低信号、平均上报间隔等）、告警历史、设备轨迹、维保记录、原始报文、下行命令
  - 设备分布：全屏地图 + 可搜索设备列表 + 状态统计，点击定位并查看设备卡片
  - 维保记录：更换 SIM 卡（修改 ICCID 自动记录）、更换电池（电量由低跳高自动识别）、维修、安装、巡检
- **远程配置**：配置记录、批量下发（按全部 / 在线 / 设备类型快速选设备）、批量取消 / 删除，随下次上报的应答帧下发并记录设备 0x04 应答
- **告警管理**
  - 告警监控：高 / 中 / 低级别、告警统计、待处理时间线（点击在地图上定位）、告警分布地图、类型与时段分布
  - 告警列表：未处理 → 已记录 → 已处理 的处理流程、告警编号、批量处理、处理说明、详情时间线、CSV 导出
  - 告警推送：企业微信 / 钉钉 / 飞书群机器人（支持加签）或自定义 Webhook，可推送恢复消息，设备级开关
  - 报警提示音、消息中心、实时弹窗
- **统计分析**：每日趋势、报警类型 / 设备类型 / 时段分布、Top 报警设备、设备类型汇总、设备活跃度与成功率
- **登录与权限**：账号密码登录（scrypt 加密存储，连续失败 5 次锁定 10 分钟，可选 7 天免登录）；首次登录 / 重置密码后强制修改密码；三种角色——管理员（全部权限）、运维人员（所属项目内维护设备、处理告警、下发配置）、只读用户（仅查看）
- **用户管理**：新建 / 编辑 / 停用 / 删除用户，重置密码（立即强制下线），按项目分配访问权限；至少保留一个可用管理员
- **项目管理**：项目档案（编号、负责人、地址、说明）、设备数 / 在线 / 报警统计、批量分配设备、改名自动同步设备档案；**数据按项目隔离**——用户只能看到所属项目的设备、报警、统计和实时推送；页面顶部可切换当前项目
- **操作留痕**：告警处理人、配置下发人、维保登记人自动记录
- **系统设置**：接入端口、MQTT、平台名称、大屏标题、地图底图（高德 / OSM / 自定义瓦片）、在线判定、数据保留、访问令牌、告警推送等均可在页面修改并即时生效；数据管理可清空演示数据
- **手机适配**：底部导航 + 卡片列表布局，可“添加到主屏幕”像 App 一样使用；支持深色模式

- **公开 GIS 底图**：高德地图 / 高德卫星、天地图矢量 / 影像（需免费申请浏览器端 Key）、Esri 街道图 / 卫星影像 / 深色底图、OpenStreetMap、自定义瓦片；所有地图右下角可切换“地图 / 卫星”，数据大屏默认使用 Esri 深色底图；底图无法访问时自动回退（卫星 → Esri 影像，其他 → 高德）

> 地图坐标统一以 WGS84 存储（与 GPS 一致）；使用高德（GCJ-02）底图时自动换算显示，地图选点时自动换算回 WGS84；天地图、Esri、OSM 直接使用 WGS84。

## 快速开始

需要 Node.js ≥ 22.13（使用内置 `node:sqlite`，无需安装数据库）。

```bash
npm run install:all
```

```bash
npm run build
```

```bash
npm run seed        # 可选：生成 28 台演示设备、7 天历史数据
```

```bash
npm start           # http://localhost:8080
```

首次启动会自动创建管理员账号 **admin / admin123**（可用环境变量 `ADMIN_PASSWORD` 指定），首次登录必须修改密码。
执行过 `npm run seed` 的演示库另有演示账号：`zhanggong`、`wanggong`（运维人员，分别负责不同项目）、`leader`（只读，全部项目），密码均为 `Demo1234`。

另开终端运行设备模拟器，通过 TCP / UDP / MQTT 实时上报：

```bash
npm run simulate -- --devices 10 --period 5 --transport mix
```

开发模式（前端热更新，`/api` 代理到 8080）：

```bash
npm run dev:server
```

```bash
npm run dev:web     # http://localhost:5173
```

Docker：

```bash
docker compose up -d --build
```

## 端口与接入方式

| 方式 | 默认地址 | 说明 |
|---|---|---|
| Web / API | `:8080` | 管理界面、REST API、第三方推送 |
| TCP | `:9000` | 二进制帧，支持粘包/拆包；每帧 5 秒内应答，5 秒无数据主动断开 |
| UDP | `:9001` | 二进制帧，回复下行应答 |
| MQTT | `:1883`（内置 Broker） | 设备发布 `GIOT-GW/UL/<设备ID>`，平台订阅 `GIOT-GW/UL/#`；有下行命令时发布到 `GIOT-GW/DL/<设备ID>` |
| 电信 AEP | `POST /api/push/aep` | 订阅推送，`payload.APPdata` 为 base64 报文 |
| 移动 OneNET | `GET/POST /api/push/onenet` | GET 用于 URL 验证；`msg.value` 为十六进制报文 |
| 通用 HTTP | `POST /api/push/raw` | `{"hex":"a55a..."}` 或 `{"base64":"..."}` |

## 从演示切换到正式运行

1. 停止设备模拟器（`npm run simulate` 只用于演示）。
2. 打开【系统设置】→ 数据管理 →“清空全部（含设备档案）”，删除演示数据。
3. 在【系统设置】中按实际情况修改接入端口、MQTT 用户名密码、访问令牌等，保存即生效。
4. 将设备的服务器地址指向平台所在服务器 IP 和对应端口；设备首次上报后自动出现在设备列表中，可再编辑名称、位置和分组。

## 配置（环境变量）

以下环境变量为默认值；【系统设置】页面中修改的值保存在数据库中，优先于环境变量，可随时“恢复默认”。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `HTTP_PORT` | 8080 | Web/API 端口 |
| `TCP_PORT` / `UDP_PORT` | 9000 / 9001 | 设备接入端口 |
| `TCP_ENABLED` / `UDP_ENABLED` | true | 是否启用 |
| `MQTT_BROKER_ENABLED` / `MQTT_BROKER_PORT` | true / 1883 | 内置 Broker（端口设为 0 同样表示关闭） |
| `MQTT_BROKER_USERNAME` / `MQTT_BROKER_PASSWORD` | 空 | 设备连接内置 Broker 的认证，为空不校验 |
| `MQTT_URL` | 空 | 外部 Broker，如 `mqtt://host:1883`（为空时连接内置 Broker） |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | 空 | 平台连接外部 Broker 的认证 |
| `MQTT_UPLINK_TOPIC` / `MQTT_DOWNLINK_PREFIX` | `GIOT-GW/UL/#` / `GIOT-GW/DL/` | 主题 |
| `DB_FILE` | `server/data/iot.db` | SQLite 数据文件 |
| `FRAME_RETENTION_DAYS` | 90 | 原始报文保留天数，0 永久 |
| `READING_RETENTION_DAYS` | 0 | 采集数据保留天数，0 永久 |
| `MAX_CLOCK_SKEW_SEC` | 3600 | 设备时间与平台相差超过该值时以平台接收时间为准 |
| `OFFLINE_MIN_SEC` / `OFFLINE_FACTOR` | 1800 / 2.5 | 离线判定：超过 max(最小值, 上报周期 × 系数) 未上报 |
| `TZ_OFFSET_HOURS` | 8 | 统计按日分组使用的时区 |
| `PLATFORM_NAME` / `SCREEN_TITLE` | 物联网设备监测平台 / 设备监测数据大屏 | 平台名称、大屏标题 |
| `MAP_PROVIDER` / `MAP_TILE_URL` | amap / 空 | 地图底图：amap、amap_sat、tianditu_vec、tianditu_img、esri_street、esri_img、osm、custom |
| `MAP_TIANDITU_KEY` | 空 | 天地图浏览器端 Key（lbs.tianditu.gov.cn 免费申请） |
| `MAP_SCREEN_STYLE` | esri_dark | 数据大屏底图：esri_dark、night（当前底图 + 夜间滤镜）、esri_img |
| `MAP_CENTER_LNG` / `MAP_CENTER_LAT` / `MAP_ZOOM` | 121.4737 / 31.2304 / 12 | 无设备坐标时的默认视野 |
| `NOTIFY_ENABLED` / `NOTIFY_TYPE` / `NOTIFY_URL` / `NOTIFY_SECRET` | false / wecom / 空 / 空 | 告警推送（wecom、dingtalk、feishu、webhook） |
| `PHOTO_DIR` | 数据库同目录 `photos/` | 设备照片存放目录 |
| `ADMIN_PASSWORD` | admin123 | 初始管理员 admin 的密码（仅在没有可用管理员时创建） |
| `AUTH_TOKEN` | 空 | API 访问令牌：第三方系统以 `Authorization: Bearer 令牌` 调用接口，拥有管理员权限 |
| `LOGIN_SLOGAN` / `COPYRIGHT` / `ICP_NO` | — | 登录页标语、版权信息、ICP 备案号 |
| `PUSH_TOKEN` | 空 | 设置后推送接口需带 `?token=` |

## 协议实现要点

- 全部字段大端；CRC16/MODBUS（初始值 0xFFFF，多项式 0x8005）覆盖帧起始标记到最后一条数据，**CRC 字段按大端写入**（文档三个范例 `7e03`、`a32b`、`dfd8` 均已验证），校验时也兼容低字节在前的写法。
- 缓存数据 1 为最早一条、n 为最新一条；最新一条的采集时间为帧中的 UTC 时间戳，其余依次减去记录间隔。缓存数据按 (设备, 采集时间) 去重，设备因未收到应答而重发时不会产生重复数据。
- 报警参数长度由帧总长反推（`总长 = 25 + 报警参数 + (n+1) × 记录长度 + 8`），并与表四预期长度核对；对文档中存在歧义的类型（如 43、63 报警组个数大于参数个数，81 字节数与类型不符）会自动适配并在解析结果中给出提示。
- MODBUS 采集终端（类型 45）记录长度可变，按帧长推算并解析地址 / 功能码 / 数据 / CRC。
- 未知类型按 16 位有符号整型通用格式解析，不会丢弃数据。
- 表三报警位按类型使用专属含义（24、34、36、39、40、58、67 等）。

## 目录结构

```
server/
  src/protocol/   协议：CRC、设备类型表、上下行编解码、TCP 分帧
  src/services/   接入入库、查询、统计
  src/transports/ TCP / UDP / MQTT
  src/api/        REST API、第三方推送、SSE
  scripts/        设备模拟器、演示数据生成
  test/           协议、端到端与设置测试（npm test）
web/              Vue 3 + Element Plus + ECharts 前端
```

## 主要 API

| 接口 | 说明 |
|---|---|
| `POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/logout`、`POST /api/auth/password` | 登录、当前用户、退出、修改密码；其余接口需 `Authorization: Bearer <令牌>`，可用 `X-Project` 头限定项目 |
| `GET/POST/PUT/DELETE /api/users`、`POST /api/users/:id/reset-password` | 用户管理（管理员） |
| `GET/POST/PUT/DELETE /api/projects`、`PUT /api/projects/:id/devices` | 项目管理、分配设备 |
| `GET /api/devices` | 设备列表（keyword、status=online/offline/alarm/lowBattery、type、category、group、分页） |
| `POST /api/devices`、`POST /api/devices/import`、`GET /api/devices/export.csv` | 预先登记 / 批量导入 / 导出设备档案 |
| `GET/PUT/DELETE /api/devices/:id` | 设备详情 / 编辑档案 / 删除（`?purge=1` 同时删除历史数据） |
| `GET /api/devices/:id/runtime`、`/locations`、`POST /photo` | 运行信息、设备轨迹、上传照片 |
| `GET/POST /api/maintenance` | 维保记录 |
| `GET /api/commands`、`POST /api/commands/batch`、`/cancel`、`/delete` | 远程配置记录与批量操作 |
| `GET /api/devices/:id/readings` | 采集数据（from、to 秒级时间戳，分页） |
| `GET /api/devices/:id/series` | 曲线数据（params、bucket=auto/0/秒） |
| `GET /api/devices/:id/stats` | 参数统计 |
| `GET /api/devices/:id/export.csv` | 导出 CSV |
| `GET/POST /api/devices/:id/commands` | 下行命令队列（`{"params":"ff00"}` 或 `{"preset":"readAll"}`） |
| `GET /api/alarms`、`/alarms/summary`、`/alarms/export.csv` | 报警事件（`handle=0/1/2/all`、`level`、`keyword` 等筛选）、汇总、导出 |
| `POST /api/alarms/handle` | 处理报警：`{"ids":[1,2],"status":1或2,"note":"..."}` |
| `GET /api/frames` | 原始报文 |
| `GET /api/stats/overview` `trend` `hourly` `alarms` `alarm-trend` `types` `activity` | 统计 |
| `GET /api/ui-config`、`POST /api/settings/notify-test` | 界面配置（平台名称、地图）、发送测试推送 |
| `POST /api/tools/decode`、`/api/tools/downlink` | 报文解析 / 生成下行帧 |
| `GET /api/stream` | SSE 实时事件（frame / alarm / command） |
| `GET/PUT /api/settings`、`POST /api/settings/reset` | 系统设置读取 / 修改 / 恢复默认 |
| `GET /api/admin/data-summary`、`POST /api/admin/purge` | 数据统计 / 清空（需 `{"scope":"all或data","confirm":"确认清空"}`） |
