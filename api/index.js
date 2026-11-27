/**
 * Vercel 无服务器入口：在线演示版。
 *
 * - 无服务器环境不能长期监听 TCP / UDP / MQTT 端口，设备接入关闭（HTTP 推送接口仍可用）
 * - 每个实例启动时在 /tmp 生成一份演示数据（7 天历史），之后按经过的时间持续模拟设备上报
 * - 使用签名令牌登录，多个实例之间无需共享会话
 */
import { createPlatform } from '../server/src/app.js';
import { config as baseConfig } from '../server/src/config.js';
import { seedDemo, DemoRunner } from '../server/src/demo/demoData.js';
import fs from 'node:fs';

const logger = { info: (...a) => console.log(...a), warn: (...a) => console.warn(...a), error: (...a) => console.error(...a) };
let booting = null;

async function boot() {
  const dbFile = process.env.DEMO_DB_FILE || '/tmp/meokon-demo.db';
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
  const password = process.env.DEMO_PASSWORD || 'Demo1234';
  const config = {
    ...baseConfig,
    dbFile,
    photoDir: '/tmp/meokon-photos',
    demoMode: process.env.DEMO_MODE !== 'false',
    demoPassword: password,
    adminPassword: password,
    // 未配置时使用固定值：演示账号密码本身公开，令牌签名仅用于跨实例校验
    sessionSecret: process.env.SESSION_SECRET || 'meokon-public-demo',
    streamMaxMs: 45000,
    tcpEnabled: false, udpEnabled: false, mqttBrokerEnabled: false, mqttUrl: '',
    mapScreenStyle: process.env.MAP_SCREEN_STYLE || baseConfig.mapScreenStyle,
  };
  let runner = null;
  let last = 0;
  const t0 = Date.now();
  const ctx = await createPlatform(config, logger, {
    transports: false,
    serveWeb: false,
    beforeApi: ({ db, ingest }) => {
      const seeded = seedDemo({ db, ingest, days: Number(process.env.DEMO_DAYS || 7), count: 28, password, withAdmin: true });
      runner = new DemoRunner({ ingest, ...seeded });
      // 每次请求时补齐经过的时间（最多每 5 秒一次）
      return (req, res, next) => {
        const now = Date.now();
        if (now - last > 5000) {
          last = now;
          try { runner.catchUp(now); } catch (e) { logger.error('[demo]', e); }
        }
        next();
      };
    },
  });
  logger.info(`[demo] 演示数据已生成，用时 ${Date.now() - t0} ms`);
  return ctx;
}

export default async function handler(req, res) {
  booting ??= boot().catch((e) => { booting = null; throw e; });
  const ctx = await booting;
  // vercel.json 将 /api/xxx 改写为 /api/index?__p=xxx，这里还原为原始路径
  const u = new URL(req.url, 'http://localhost');
  const p = u.searchParams.get('__p');
  if (p !== null) {
    u.searchParams.delete('__p');
    const qs = u.searchParams.toString();
    req.url = `/api/${p}${qs ? `?${qs}` : ''}`;
  }
  ctx.app(req, res);
}
