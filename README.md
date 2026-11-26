# MEOKON 物联网设备监测平台

基于《智能无线终端通讯协议 V3.3》（上海铭控 MEOKON）实现的物联网设备接入、信息展示、数据展示与统计平台。

- **设备接入**：UDP / TCP（二进制）、MQTT（十六进制字符串，内置 Broker）、电信 AEP、移动 OneNET、通用 HTTP
- **协议解析**：上行数据帧 0x00、平台下行帧 0xFF、设备应答 0x04；表一 电量状态、表二 设备类型（0 ~ 102）、表三 报警状态、表四 报警参数、表五 数据记录；CRC16/MODBUS 校验
- **设备展示**：设备自动注册、在线/离线/报警状态、实时数据、电量与信号、开关量通道、坐标
- **数据展示**：历史曲线（按单位分组、自动聚合、报警上下限标线）、数据记录分页与 CSV 导出、原始报文逐字段解析
- **统计分析**：总览看板、每日/每小时上报趋势、报警类型/设备类型/时段分布、Top 报警设备、设备类型汇总、设备活跃度与成功率、单设备参数统计（最值/均值/变化量/超限次数/数据完整率）
- **报警中心**：按报警位生成报警事件，自动恢复，支持确认与处理说明，实时弹窗提醒
- **下行命令**：命令队列，随下次上报的应答帧下发（TCP/UDP/MQTT），记录设备 0x04 应答
- **实时推送**：SSE 推送新报文与报警，页面自动刷新

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

## 配置（环境变量）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `HTTP_PORT` | 8080 | Web/API 端口 |
| `TCP_PORT` / `UDP_PORT` | 9000 / 9001 | 设备接入端口 |
| `TCP_ENABLED` / `UDP_ENABLED` | true | 是否启用 |
| `MQTT_BROKER_PORT` | 1883 | 内置 Broker 端口，0 关闭 |
| `MQTT_URL` | 空 | 外部 Broker，如 `mqtt://host:1883`（为空时连接内置 Broker） |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | 空 | Broker 认证（内置 Broker 同样生效） |
| `MQTT_UPLINK_TOPIC` / `MQTT_DOWNLINK_PREFIX` | `GIOT-GW/UL/#` / `GIOT-GW/DL/` | 主题 |
| `DB_FILE` | `server/data/iot.db` | SQLite 数据文件 |
| `FRAME_RETENTION_DAYS` | 90 | 原始报文保留天数，0 永久 |
| `READING_RETENTION_DAYS` | 0 | 采集数据保留天数，0 永久 |
| `MAX_CLOCK_SKEW_SEC` | 3600 | 设备时间与平台相差超过该值时以平台接收时间为准 |
| `OFFLINE_MIN_SEC` / `OFFLINE_FACTOR` | 1800 / 2.5 | 离线判定：超过 max(最小值, 上报周期 × 系数) 未上报 |
| `TZ_OFFSET_HOURS` | 8 | 统计按日分组使用的时区 |
| `AUTH_TOKEN` | 空 | 设置后 Web/API 需要访问令牌 |
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
  test/           协议与端到端测试（npm test）
web/              Vue 3 + Element Plus + ECharts 前端
```

## 主要 API

| 接口 | 说明 |
|---|---|
| `GET /api/devices` | 设备列表（keyword、status=online/offline/alarm/lowBattery、type、category、group、分页） |
| `GET/PUT/DELETE /api/devices/:id` | 设备详情 / 编辑名称位置分组坐标 / 删除 |
| `GET /api/devices/:id/readings` | 采集数据（from、to 秒级时间戳，分页） |
| `GET /api/devices/:id/series` | 曲线数据（params、bucket=auto/0/秒） |
| `GET /api/devices/:id/stats` | 参数统计 |
| `GET /api/devices/:id/export.csv` | 导出 CSV |
| `GET/POST /api/devices/:id/commands` | 下行命令队列（`{"params":"ff00"}` 或 `{"preset":"readAll"}`） |
| `GET /api/alarms`、`POST /api/alarms/:id/ack` | 报警事件、确认 |
| `GET /api/frames` | 原始报文 |
| `GET /api/stats/overview` `trend` `hourly` `alarms` `types` `activity` | 统计 |
| `POST /api/tools/decode`、`/api/tools/downlink` | 报文解析 / 生成下行帧 |
| `GET /api/stream` | SSE 实时事件（frame / alarm / command） |
