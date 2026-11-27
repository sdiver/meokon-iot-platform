import L from 'leaflet';

/**
 * 公开 GIS 底图。
 *   gcj   —— 瓦片使用 GCJ-02 坐标（国内地图），设备 WGS84 坐标需换算后显示
 *   night —— 用于深色大屏时是否需要 CSS 夜间滤镜（自带深色的底图不需要）
 */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_CANVAS = 'https://services.arcgisonline.com/arcgis/rest/services/Canvas';
const TDT = (layer, key) => `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${encodeURIComponent(key || '')}`;

export const BASEMAPS = {
  amap: {
    name: '高德地图', gcj: true, satellite: 'amap_sat',
    layers: [{ url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', subdomains: '1234', maxNativeZoom: 18 }],
    attribution: '© 高德地图',
  },
  amap_sat: {
    name: '高德卫星', gcj: true, satellite: null, street: 'amap',
    layers: [
      { url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', subdomains: '1234', maxNativeZoom: 18 },
      { url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}', subdomains: '1234', maxNativeZoom: 18 },
    ],
    attribution: '© 高德地图',
  },
  tianditu_vec: {
    name: '天地图', gcj: false, satellite: 'tianditu_img', needsKey: true,
    layers: (key) => [{ url: TDT('vec', key), subdomains: '01234567', maxNativeZoom: 18 }, { url: TDT('cva', key), subdomains: '01234567', maxNativeZoom: 18 }],
    attribution: '© 天地图',
  },
  tianditu_img: {
    name: '天地图影像', gcj: false, satellite: null, street: 'tianditu_vec', needsKey: true,
    layers: (key) => [{ url: TDT('img', key), subdomains: '01234567', maxNativeZoom: 18 }, { url: TDT('cia', key), subdomains: '01234567', maxNativeZoom: 18 }],
    attribution: '© 天地图',
  },
  esri_street: {
    name: 'Esri 街道图', gcj: false, satellite: 'esri_img',
    layers: [{ url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 19 }],
    attribution: '© Esri',
  },
  esri_img: {
    name: 'Esri 卫星影像', gcj: false, satellite: null, street: 'esri_street',
    layers: [
      { url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 19 },
      { url: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 19 },
    ],
    attribution: '© Esri, Maxar, Earthstar Geographics',
  },
  esri_dark: {
    name: 'Esri 深色底图', gcj: false, satellite: 'esri_img', dark: true,
    layers: [
      { url: `${ESRI_CANVAS}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 16 },
      { url: `${ESRI_CANVAS}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 16 },
    ],
    attribution: '© Esri',
  },
  osm: {
    name: 'OpenStreetMap', gcj: false, satellite: 'esri_img',
    layers: [{ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxNativeZoom: 19 }],
    attribution: '© OpenStreetMap',
  },
};

/** 根据界面配置得到底图定义；自定义瓦片按 WGS84 处理 */
export function resolveBasemap(key, cfg) {
  if (key === 'custom') {
    if (!cfg.tileUrl) return { key: 'amap', ...BASEMAPS.amap };
    return { key, name: '自定义底图', gcj: false, satellite: 'esri_img', layers: [{ url: cfg.tileUrl, subdomains: 'abc', maxNativeZoom: 19 }], attribution: '' };
  }
  const b = BASEMAPS[key] ?? BASEMAPS.amap;
  if (b.needsKey && !cfg.tiandituKey) return { key: 'amap', ...BASEMAPS.amap };
  return { key: BASEMAPS[key] ? key : 'amap', ...b };
}

/** 卫星影像对应的底图 */
export function satelliteOf(key) {
  return BASEMAPS[key]?.satellite ?? (key === 'custom' ? 'esri_img' : null);
}
export function streetOf(key) {
  return BASEMAPS[key]?.street ?? null;
}

/**
 * 创建底图图层组。若开始的若干瓦片全部加载失败（网络无法访问该底图），回调 onFail 以便切换备用底图。
 */
export function createBasemapLayer(bm, cfg, onFail) {
  const defs = typeof bm.layers === 'function' ? bm.layers(cfg.tiandituKey) : bm.layers;
  let loaded = 0;
  let failed = 0;
  let reported = false;
  const group = L.layerGroup(defs.map((d, i) => {
    const t = L.tileLayer(d.url, {
      subdomains: d.subdomains ?? 'abc',
      maxNativeZoom: d.maxNativeZoom ?? 18,
      maxZoom: 19,
      attribution: i === 0 ? bm.attribution : undefined,
      crossOrigin: false,
    });
    if (i === 0) {
      t.on('tileload', () => { loaded++; });
      t.on('tileerror', () => {
        failed++;
        if (!reported && loaded === 0 && failed >= 4) {
          reported = true;
          onFail?.();
        }
      });
    }
    return t;
  }));
  return group;
}

/** 设置页使用的选项 */
export const BASEMAP_OPTIONS = Object.entries(BASEMAPS).filter(([k]) => !k.endsWith('_dark')).map(([k, v]) => [k, v.name]);
