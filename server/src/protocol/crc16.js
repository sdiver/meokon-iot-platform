/**
 * CRC16 / MODBUS：初始值 0xFFFF，多项式 0x8005（反射实现 0xA001）。
 * @param {Uint8Array} buf
 * @param {number} [start]
 * @param {number} [end] 不含
 * @returns {number}
 */
export function crc16Modbus(buf, start = 0, end = buf.length) {
  let crc = 0xffff;
  for (let i = start; i < end; i++) {
    crc ^= buf[i];
    for (let b = 0; b < 8; b++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

/**
 * 协议中 CRC 字段按大端写入（文档三个范例 7e03 / a32b / dfd8 均已验证）。
 * 为兼容个别按 MODBUS 低字节在前写入的固件，校验时两种字节序都接受。
 */
export function crcBytes(crc) {
  return [(crc >> 8) & 0xff, crc & 0xff];
}

export function crcMatches(buf, start, end, b0, b1) {
  const crc = crc16Modbus(buf, start, end);
  const lo = crc & 0xff;
  const hi = (crc >> 8) & 0xff;
  if (b0 === hi && b1 === lo) return { ok: true, order: 'BE', crc };
  if (b0 === lo && b1 === hi) return { ok: true, order: 'LE', crc };
  return { ok: false, order: null, crc };
}
