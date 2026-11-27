<template>
  <div class="dmap" :class="[`theme-${theme}`, { picking: mode === 'pick' }]" :style="{ height: typeof height === 'number' ? height + 'px' : height }">
    <div ref="el" class="dmap-canvas" role="application" :aria-label="mode === 'pick' ? '点击地图选择位置' : '设备分布地图'" />
    <div v-if="legend && mode === 'view'" class="dmap-legend">
      <button
        v-for="s in legendItems" :key="s.key" class="chip" :class="[s.key, { off: hidden.has(s.key) }]"
        :aria-pressed="!hidden.has(s.key)" @click="toggle(s.key)">
        <span class="pin" />{{ s.text }}<b>{{ s.count }}</b>
      </button>
    </div>
    <div v-if="mode === 'pick'" class="dmap-hint">点击地图设置设备位置</div>
    <div v-if="mode === 'view' && !located" class="dmap-empty">暂无设置坐标的设备<br /><small>在设备档案中设置经纬度后显示在地图上</small></div>
    <slot />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, shallowRef } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ui } from '../api.js';
import { wgs84ToGcj02, gcj02ToWgs84 } from '../utils/geo.js';
import { fmtParam, fmtAgo } from '../utils/format.js';

const props = defineProps({
  devices: { type: Array, default: () => [] },
  types: { type: Object, default: null }, // Map<code, type>
  theme: { type: String, default: 'light' },
  mode: { type: String, default: 'view' }, // view | pick
  pick: { type: Object, default: null }, // { lat, lng } WGS84
  track: { type: Array, default: null }, // [{ lat, lng, ts }]
  height: { type: [Number, String], default: 420 },
  legend: { type: Boolean, default: true },
  popup: { type: Boolean, default: true },
  zoomControl: { type: Boolean, default: true },
});
const emit = defineEmits(['select', 'pick', 'detail']);

const el = ref(null);
const map = shallowRef(null);
let layer = null;
let pickMarker = null;
let trackLayer = null;
let tiles = null;
const markers = new Map();
const hidden = ref(new Set());
let fitted = false;

const STATUS = {
  online: { text: '在线', cls: 'online' },
  alarm: { text: '报警', cls: 'alarm' },
  offline: { text: '离线', cls: 'offline' },
  inactive: { text: '未上线', cls: 'inactive' },
};

const gcj = computed(() => (ui.map.provider || 'amap') === 'amap');
const toMap = (lat, lng) => (gcj.value ? wgs84ToGcj02(lat, lng) : [lat, lng]);
const fromMap = (lat, lng) => (gcj.value ? gcj02ToWgs84(lat, lng) : [lat, lng]);

const located = computed(() => props.devices.filter((d) => d.lat != null && d.lng != null).length);
const legendItems = computed(() => ['online', 'alarm', 'offline', 'inactive']
  .map((k) => ({ key: k, text: STATUS[k].text, count: props.devices.filter((d) => d.status === k && d.lat != null).length }))
  .filter((s) => s.count || s.key !== 'inactive'));

function tileLayer() {
  const p = ui.map.provider || 'amap';
  if (p === 'osm') return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
  if (p === 'custom' && ui.map.tileUrl) return L.tileLayer(ui.map.tileUrl, { maxZoom: 19, subdomains: 'abc' });
  return L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
    subdomains: '1234', maxZoom: 18, attribution: '© 高德地图',
  });
}

function icon(d) {
  const st = STATUS[d.status]?.cls ?? 'offline';
  return L.divIcon({
    className: 'dm-icon',
    html: `<span class="dm-pin ${st}"><span class="dm-dot"></span>${st === 'alarm' ? '<span class="dm-pulse"></span>' : ''}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -10],
  });
}

/** 弹窗内容用 DOM 构建，避免设备名称等文本注入 HTML */
function popupContent(d) {
  const h = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const box = h('div', 'dm-pop');
  const head = h('div', 'dm-pop-head');
  head.append(h('b', null, d.name || d.id));
  const st = h('span', `dm-st ${STATUS[d.status]?.cls}`, STATUS[d.status]?.text ?? '-');
  head.append(st);
  box.append(head);
  box.append(h('div', 'dm-pop-sub', `${d.id}${d.typeName ? ' · ' + d.typeName : ''}${d.model ? ' · ' + d.model : ''}`));
  const def = props.types?.get?.(d.typeCode);
  const vals = h('div', 'dm-pop-vals');
  const params = def?.params ?? Object.keys(d.realtime || {}).map((k) => ({ key: k, name: k, kind: 'num' }));
  params.filter((p) => d.realtime?.[p.key] !== undefined && p.key !== 'reserved').slice(0, 4).forEach((p) => {
    const v = h('div', 'dm-v');
    v.append(h('span', null, p.name));
    const b = h('b', null, fmtParam(p, d.realtime[p.key]));
    if (p.kind === 'num' && p.unit) b.append(h('small', null, ` ${p.unit}`));
    v.append(b);
    vals.append(v);
  });
  if (vals.childNodes.length) box.append(vals);
  if (d.alarm?.bits?.length && d.status === 'alarm') box.append(h('div', 'dm-pop-alarm', `⚠ ${d.alarm.bits.map((b) => b.label).join('、')}`));
  const meta = h('div', 'dm-pop-meta');
  const batt = d.battery?.source === '外供电' ? '外供电' : d.battery?.level != null ? `电量 ${d.battery.level}%` : null;
  [batt, d.signal != null ? `信号 ${d.signal} dBm` : null, d.lastSeen ? `${fmtAgo(d.lastSeen)}上报` : '尚未上报'].filter(Boolean).forEach((t) => meta.append(h('span', null, t)));
  box.append(meta);
  if (d.location) box.append(h('div', 'dm-pop-loc', d.location));
  const btn = h('button', 'dm-pop-btn', '查看详情 →');
  btn.type = 'button';
  btn.addEventListener('click', () => emit('detail', d));
  box.append(btn);
  return box;
}

function render() {
  if (!map.value) return;
  const seen = new Set();
  for (const d of props.devices) {
    if (d.lat == null || d.lng == null) continue;
    seen.add(d.id);
    const pos = toMap(d.lat, d.lng);
    let m = markers.get(d.id);
    if (!m) {
      m = L.marker(pos, { icon: icon(d), riseOnHover: true, keyboard: true, title: d.name || d.id });
      m.on('click', () => emit('select', d));
      markers.set(d.id, m);
    } else {
      m.setLatLng(pos);
      m.setIcon(icon(d));
    }
    m._dev = d;
    m.setZIndexOffset(d.status === 'alarm' ? 1000 : d.status === 'online' ? 500 : 0);
    if (props.popup) {
      if (m.getPopup()) m.setPopupContent(popupContent(d));
      else m.bindPopup(popupContent(d), { className: `dm-popup theme-${props.theme}`, maxWidth: 280, minWidth: 220 });
    }
    const show = !hidden.value.has(d.status);
    if (show && !layer.hasLayer(m)) layer.addLayer(m);
    if (!show && layer.hasLayer(m)) layer.removeLayer(m);
  }
  for (const [id, m] of markers) {
    if (!seen.has(id)) {
      layer.removeLayer(m);
      markers.delete(id);
    }
  }
  if (!fitted && seen.size) {
    fitted = true;
    fitAll();
  }
}

let userMoved = false;
function fitAll() {
  const pts = [...markers.values()].map((m) => m.getLatLng());
  if (!pts.length || !map.value) return;
  map.value.invalidateSize();
  if (pts.length === 1) map.value.setView(pts[0], 15);
  else map.value.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 16 });
}

function renderPick() {
  if (!map.value || props.mode !== 'pick') return;
  if (props.pick?.lat != null && props.pick?.lng != null) {
    const pos = toMap(props.pick.lat, props.pick.lng);
    if (!pickMarker) pickMarker = L.marker(pos, { icon: L.divIcon({ className: 'dm-icon', html: '<span class="dm-target"></span>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map.value);
    else pickMarker.setLatLng(pos);
  }
}

function renderTrack() {
  if (!map.value) return;
  trackLayer?.remove();
  trackLayer = null;
  if (!props.track?.length) return;
  const pts = [...props.track].sort((a, b) => a.ts - b.ts).map((p) => toMap(p.lat, p.lng));
  trackLayer = L.layerGroup([
    L.polyline(pts, { color: '#257de0', weight: 3, opacity: 0.85, dashArray: pts.length > 1 ? null : '4 4' }),
    ...pts.map((p, i) => L.circleMarker(p, { radius: i === pts.length - 1 ? 7 : 4, color: '#fff', weight: 2, fillColor: i === pts.length - 1 ? '#257de0' : '#84b9f3', fillOpacity: 1 })),
  ]).addTo(map.value);
  map.value.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 16 });
}

function toggle(k) {
  const s = new Set(hidden.value);
  if (s.has(k)) s.delete(k);
  else s.add(k);
  hidden.value = s;
  render();
}

function init() {
  const c = ui.map.center || [31.2304, 121.4737];
  map.value = L.map(el.value, {
    center: toMap(c[0], c[1]),
    zoom: ui.map.zoom || 12,
    zoomControl: false,
    attributionControl: true,
    worldCopyJump: true,
  });
  map.value.attributionControl.setPrefix(false);
  if (props.zoomControl) {
    const zc = L.control.zoom({ position: 'bottomright', zoomInTitle: '放大', zoomOutTitle: '缩小' }).addTo(map.value);
    zc.getContainer().addEventListener('click', () => { userMoved = true; });
  }
  tiles = tileLayer().addTo(map.value);
  layer = L.layerGroup().addTo(map.value);
  // 用户拖动 / 滚轮 / 点击缩放后不再自动适配视野
  const markMoved = () => { userMoved = true; };
  map.value.on('dragstart', markMoved);
  el.value.addEventListener('wheel', markMoved, { passive: true });
  el.value.addEventListener('dblclick', markMoved);
  map.value.on('click', (e) => {
    if (props.mode !== 'pick') return;
    const [lat, lng] = fromMap(e.latlng.lat, e.latlng.lng);
    emit('pick', { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
  });
  render();
  renderPick();
  renderTrack();
  if (props.mode === 'pick' && props.pick?.lat != null) map.value.setView(toMap(props.pick.lat, props.pick.lng), 16);
}

let ro;
onMounted(() => {
  init();
  // 容器尺寸变化时重新计算；用户未手动操作前保持“显示全部设备”
  ro = new ResizeObserver(() => {
    map.value?.invalidateSize();
    if (fitted && !userMoved && props.mode === 'view' && !props.track?.length) fitAll();
  });
  ro.observe(el.value);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  map.value?.remove();
});

watch(() => props.devices, render, { deep: false });
watch(() => props.pick, renderPick, { deep: true });
watch(() => props.track, renderTrack);
watch(() => [ui.map.provider, ui.map.tileUrl], () => {
  if (!map.value) return;
  tiles?.remove();
  tiles = tileLayer().addTo(map.value);
  for (const m of markers.values()) m.setLatLng(toMap(m._dev.lat, m._dev.lng));
});

/** 定位到某台设备并打开弹窗 */
function focus(id, zoom = 16) {
  const m = markers.get(id);
  if (!m || !map.value) return false;
  if (!layer.hasLayer(m)) layer.addLayer(m);
  map.value.flyTo(m.getLatLng(), Math.max(zoom, map.value.getZoom()), { duration: 0.6 });
  if (props.popup) setTimeout(() => m.openPopup(), 650);
  return true;
}
defineExpose({ focus, fitAll });
</script>

<style>
.dmap { position: relative; width: 100%; border-radius: 10px; overflow: hidden; isolation: isolate; }
.dmap-canvas { position: absolute; inset: 0; font-family: inherit; }
.dmap.theme-light .dmap-canvas { background: #eef2f6 repeating-linear-gradient(0deg, transparent 0 39px, rgba(0, 0, 0, 0.035) 39px 40px), repeating-linear-gradient(90deg, transparent 0 39px, rgba(0, 0, 0, 0.035) 39px 40px); }
.dmap.theme-dark .dmap-canvas { background: #0a1628 repeating-linear-gradient(0deg, transparent 0 39px, rgba(90, 160, 255, 0.05) 39px 40px), repeating-linear-gradient(90deg, transparent 0 39px, rgba(90, 160, 255, 0.05) 39px 40px); }
/* 深色主题：底图反色处理，形成夜间风格 */
.dmap.theme-dark .leaflet-tile-pane { filter: invert(1) hue-rotate(195deg) brightness(0.78) contrast(0.92) saturate(0.55); }
.dmap.picking .dmap-canvas { cursor: crosshair; }
.dmap .leaflet-control-attribution { font-size: 10px; background: rgba(255, 255, 255, 0.6); }
.dmap.theme-dark .leaflet-control-attribution { background: rgba(0, 0, 0, 0.35); color: #7f95b5; }
.dmap.theme-dark .leaflet-control-attribution a { color: #7f95b5; }

.dmap-legend { position: absolute; left: 12px; bottom: 12px; z-index: 500; display: flex; gap: 6px; flex-wrap: wrap; }
.dmap-legend .chip {
  display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 15px; font: inherit; font-size: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06); background: rgba(255, 255, 255, 0.92); color: #333; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); backdrop-filter: blur(6px); transition: opacity 0.15s;
}
.dmap-legend .chip b { font-variant-numeric: tabular-nums; }
.dmap-legend .chip.off { opacity: 0.45; text-decoration: line-through; }
.dmap.theme-dark .dmap-legend .chip { background: rgba(10, 25, 48, 0.82); color: #cfe0ff; border-color: rgba(90, 160, 255, 0.25); }
.dmap-legend .pin { width: 9px; height: 9px; border-radius: 50%; }
.chip.online .pin { background: #0aac23; }
.chip.alarm .pin { background: #dc3c3d; }
.chip.offline .pin { background: #9c9c9c; }
.chip.inactive .pin { background: transparent; border: 1.5px dashed #9c9c9c; }

.dmap-hint { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 500; background: rgba(25, 25, 25, 0.78); color: #fff; font-size: 12px; padding: 5px 12px; border-radius: 14px; pointer-events: none; }
.dmap-empty { position: absolute; inset: 0; z-index: 400; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #666; font-size: 14px; pointer-events: none; }
.dmap-empty small { color: #999; margin-top: 4px; }
.dmap.theme-dark .dmap-empty { color: #8fa7c9; }

/* 设备标记 */
.dm-icon { background: none; border: 0; }
.dm-pin { position: relative; display: block; width: 22px; height: 22px; }
.dm-dot { position: absolute; inset: 4px; border-radius: 50%; border: 2.5px solid #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35); }
.dm-pin.online .dm-dot { background: #0aac23; }
.dm-pin.alarm .dm-dot { background: #dc3c3d; }
.dm-pin.offline .dm-dot { background: #9c9c9c; }
.dm-pin.inactive .dm-dot { background: #fff; border: 2px dashed #9c9c9c; }
.dm-pulse { position: absolute; inset: 0; border-radius: 50%; background: rgba(220, 60, 61, 0.45); animation: dm-pulse 1.6s ease-out infinite; }
@keyframes dm-pulse { 0% { transform: scale(0.6); opacity: 0.9; } 100% { transform: scale(2.4); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .dm-pulse { animation: none; opacity: 0.35; transform: scale(1.4); } }
.dm-target { display: block; width: 28px; height: 28px; border-radius: 50%; border: 3px solid #257de0; background: rgba(37, 125, 224, 0.18); box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.8); }

/* 弹窗 */
.dm-popup .leaflet-popup-content-wrapper { border-radius: 12px; padding: 0; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18); }
.dm-popup .leaflet-popup-content { margin: 14px 16px; font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; line-height: 1.45; }
.dm-popup.theme-dark .leaflet-popup-content-wrapper, .dm-popup.theme-dark .leaflet-popup-tip { background: rgba(9, 24, 48, 0.95); color: #dce8ff; border: 1px solid rgba(90, 160, 255, 0.35); }
.dm-popup.theme-dark .leaflet-popup-close-button { color: #8fa7c9; }
.dm-pop-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-right: 14px; font-size: 14px; }
.dm-st { font-size: 11px; padding: 1px 8px; border-radius: 9px; white-space: nowrap; color: #fff; }
.dm-st.online { background: #0aac23; }
.dm-st.alarm { background: #dc3c3d; }
.dm-st.offline { background: #8a8a8a; }
.dm-st.inactive { background: transparent; color: #888; border: 1px dashed #aaa; }
.dm-pop-sub { font-size: 11px; color: #888; margin-top: 2px; }
.dm-pop-vals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 10px 0 6px; }
.dm-v { background: rgba(127, 127, 127, 0.08); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; }
.dm-v span { font-size: 11px; color: #888; }
.dm-v b { font-size: 15px; font-variant-numeric: tabular-nums; }
.dm-v small { font-size: 11px; font-weight: 400; color: #888; }
.dm-pop-alarm { color: #dc3c3d; font-size: 12px; margin: 4px 0; }
.dm-pop-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: #888; }
.dm-pop-loc { font-size: 12px; margin-top: 4px; }
.dm-pop-btn { margin-top: 10px; width: 100%; height: 30px; border-radius: 8px; border: 0; background: #257de0; color: #fff; font: inherit; font-size: 12px; cursor: pointer; }
.dm-pop-btn:hover { background: #1b64be; }
</style>
