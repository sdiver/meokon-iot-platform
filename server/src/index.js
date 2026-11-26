import { config } from './config.js';
import { startPlatform } from './app.js';

const platform = await startPlatform(config);

const shutdown = async () => {
  console.log('正在关闭...');
  await platform.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
