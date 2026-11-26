import dgram from 'node:dgram';
import { FrameStreamParser } from '../protocol/streamParser.js';

/** 1.1 UDP：每个数据报包含一帧或多帧二进制数据，平台回复下行应答 */
export function startUdpServer({ port, ingest, logger }) {
  const sock = dgram.createSocket('udp4');
  sock.on('message', (msg, rinfo) => {
    const remote = `${rinfo.address}:${rinfo.port}`;
    const parser = new FrameStreamParser();
    for (const frame of parser.push(msg)) {
      try {
        const { decoded, reply } = ingest.handle(frame, { transport: 'udp', remote, replyMode: 'always' });
        if (reply) {
          sock.send(reply, rinfo.port, rinfo.address);
          ingest.logDownlink(reply, { transport: 'udp', remote });
        }
        if (!decoded.ok) logger.warn(`[udp] ${remote} 无效帧: ${decoded.errors.join('; ')}`);
      } catch (e) {
        logger.error(`[udp] ${remote} 处理失败`, e);
      }
    }
  });
  sock.on('error', (e) => logger.error('[udp] error', e));
  sock.bind(port, () => logger.info(`[udp] 设备接入端口 ${port}`));
  return { socket: sock, close: () => new Promise((r) => sock.close(() => r())) };
}
