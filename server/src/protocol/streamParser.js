import { FRAME_HEAD, FRAME_TAIL } from './decoder.js';

const MAX_FRAME = 0xffff;

/**
 * TCP 字节流分帧：查找 0xA55A 起始标记，按“帧总长度”截取，并校验 0x55AA 结尾。
 * 不完整的数据保留在缓冲区等待后续数据。
 */
export class FrameStreamParser {
  constructor() {
    this.buf = Buffer.alloc(0);
    this.dropped = 0;
  }

  /** @param {Buffer} chunk @returns {Buffer[]} */
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const frames = [];
    for (;;) {
      const start = this.indexOfHead();
      if (start < 0) {
        // 保留最后一个字节，防止起始标记被拆分
        this.dropped += Math.max(0, this.buf.length - 1);
        this.buf = this.buf.subarray(Math.max(0, this.buf.length - 1));
        break;
      }
      if (start > 0) {
        this.dropped += start;
        this.buf = this.buf.subarray(start);
      }
      if (this.buf.length < 5) break;
      const len = this.buf.readUInt16BE(3);
      if (len < 9 || len > MAX_FRAME) {
        this.buf = this.buf.subarray(2);
        this.dropped += 2;
        continue;
      }
      if (this.buf.length < len) break;
      if (this.buf.readUInt16BE(len - 2) !== FRAME_TAIL) {
        // 不是有效帧，跳过这个起始标记继续查找
        this.buf = this.buf.subarray(2);
        this.dropped += 2;
        continue;
      }
      frames.push(Buffer.from(this.buf.subarray(0, len)));
      this.buf = this.buf.subarray(len);
    }
    return frames;
  }

  indexOfHead() {
    for (let i = 0; i + 1 < this.buf.length; i++) {
      if (this.buf[i] === FRAME_HEAD >> 8 && this.buf[i + 1] === (FRAME_HEAD & 0xff)) return i;
    }
    return -1;
  }
}
