/**
 * WGS84 ↔ GCJ-02 坐标换算（高德等国内地图使用 GCJ-02）。
 * 平台统一以 WGS84 存储坐标，仅在使用高德底图显示 / 拾取时换算。
 */
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function tLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return r;
}
function tLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return r;
}

export function wgs84ToGcj02(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  let dLat = tLat(lng - 105, lat - 35);
  let dLng = tLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sq)) * Math.PI);
  dLng = (dLng * 180) / ((A / sq) * Math.cos(radLat) * Math.PI);
  return [lat + dLat, lng + dLng];
}

/** 迭代求逆，误差 < 1e-7 度 */
export function gcj02ToWgs84(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  let wLat = lat;
  let wLng = lng;
  for (let i = 0; i < 10; i++) {
    const [gLat, gLng] = wgs84ToGcj02(wLat, wLng);
    const dLat = gLat - lat;
    const dLng = gLng - lng;
    wLat -= dLat;
    wLng -= dLng;
    if (Math.abs(dLat) < 1e-8 && Math.abs(dLng) < 1e-8) break;
  }
  return [wLat, wLng];
}
