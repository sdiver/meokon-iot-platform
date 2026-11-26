import net from 'node:net';
import { FrameStreamParser } from '../protocol/streamParser.js';

/**
 * 1.1 TCP：设备为 socket 客户端，上报后平台需 5 秒内下发应答；
 * 设备上报后 5 秒内无新数据，平台主动断开连接。
 */
export function startTcpServer({ port, ingest, logger, idleCloseMs = 5000 }) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    const parser = new FrameStreamParser();
    let timer = null;
    const armIdle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => socket.end(), idleCloseMs);
    };
    armIdle();
    socket.on('data', (chunk) => {
      armIdle();
      for (const frame of parser.push(chunk)) {
        try {
          const { decoded, reply } = ingest.handle(frame, { transport: 'tcp', remote, replyMode: 'always' });
          if (reply) {
            socket.write(reply);
            ingest.logDownlink(reply, { transport: 'tcp', remote });
          }
          if (!decoded.ok) logger.warn(`[tcp] ${remote} 无效帧: ${decoded.errors.join('; ')}`);
        } catch (e) {
          logger.error(`[tcp] ${remote} 处理失败`, e);
        }
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(timer);
      sockets.delete(socket);
    });
  });
  server.listen(port, () => logger.info(`[tcp] 设备接入端口 ${port}`));
  return {
    server,
    close: () => new Promise((r) => {
      for (const s of sockets) s.destroy();
      server.close(() => r());
    }),
  };
}
