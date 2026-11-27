<template>
  <div class="page dash">
    <!-- KPI -->
    <div class="kpi-row">
      <div class="card kpi-dev">
        <div class="kpi-hero" @click="$router.push('/devices')">
          <div class="kpi-ico"><el-icon :size="26"><Cpu /></el-icon></div>
          <div>
            <div class="kpi-label">设备总数</div>
            <div class="kpi-big num">{{ o?.devices.total ?? '-' }}</div>
            <div class="kpi-foot">在线率 {{ o ? fmtPct(o.devices.onlineRate, 0) : '-' }}</div>
          </div>
        </div>
        <div class="kpi-cells">
          <div v-for="k in devCells" :key="k.key" class="kpi-cell" @click="$router.push({ path: '/devices', query: { status: k.key } })">
            <div class="kpi-label"><span class="dot" :class="k.dot" />{{ k.label }}</div>
            <div class="kpi-num num">{{ k.value }}</div>
            <div class="kpi-bar"><span :style="{ width: pct(k.value, o?.devices.total) + '%', background: k.color }" /></div>
          </div>
        </div>
      </div>
      <div class="card kpi-alarm">
        <div v-for="k in alarmCells" :key="k.key" class="kpi-cell" @click="$router.push({ path: '/alarms', query: { handle: k.handle } })">
          <div class="kpi-label">{{ k.label }}</div>
          <div class="kpi-num num" :style="{ color: k.color }">{{ k.value }}</div>
          <div class="kpi-foot">{{ k.foot }}</div>
        </div>
      </div>
    </div>

    <!-- 地图 + 待处理告警 -->
    <div class="grid map-row mt">
      <div class="card map-card">
        <div class="sec-title">设备分布<span class="hint"><a class="link" @click="$router.push('/devices/map')">全屏查看 →</a></span></div>
        <DeviceMap :devices="devices" :types="types" :height="isMobile ? 320 : 440" @detail="(d) => $router.push(`/devices/${d.id}`)" />
      </div>
      <div class="card pend-card">
        <div class="sec-title">待处理告警<span class="hint">{{ o?.alarms.pending ?? 0 }} 条 · <a class="link" @click="$router.push('/alarms')">全部</a></span></div>
        <el-scrollbar :height="isMobile ? 360 : 440">
          <div v-if="!pendingList.length" class="empty-ok">
            <el-icon :size="36"><CircleCheck /></el-icon>
            <div>暂无待处理告警</div>
          </div>
          <div v-for="a in pendingList" :key="a.id" class="pend" @click="$router.push(`/devices/${a.deviceId}?tab=alarms`)">
            <span class="lv-badge" :class="a.level">{{ LEVEL[a.level] }}</span>
            <div class="pend-body">
              <div class="pend-title">{{ a.deviceName || a.deviceId }} 触发<b>{{ a.label }}</b></div>
              <div class="pend-meta">
                <span>{{ fmtTime(a.startTs) }}</span>
                <span :class="a.open ? 'crit' : 'ok'">{{ a.open ? `持续 ${fmtDuration(a.duration)}` : '已恢复' }}</span>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </div>

    <!-- 历史告警趋势 -->
    <div class="card mt">
      <div class="sec-title">
        历史告警趋势
        <span class="hint">
          <el-radio-group v-model="trendDays" size="small" @change="loadTrend">
            <el-radio-button :value="7">7 天</el-radio-button>
            <el-radio-button :value="30">30 天</el-radio-button>
            <el-radio-button :value="90">90 天</el-radio-button>
          </el-radio-group>
        </span>
      </div>
      <VChart :option="alarmTrendOpt" :height="isMobile ? 240 : 280" label="按告警类型的历史告警趋势" />
    </div>

    <div class="grid c3 mt">
      <div class="card span2">
        <div class="sec-title">近 24 小时上报<span class="hint">帧 / 小时 · 今日 {{ o?.today.frames ?? 0 }} 帧，异常 {{ o?.today.badFrames ?? 0 }}</span></div>
        <VChart :option="hourlyOpt" :height="isMobile ? 200 : 240" label="近24小时上报帧数" />
      </div>
      <div class="card">
        <div class="sec-title">设备类型<span class="hint">台</span></div>
        <VChart :option="typeOpt" :height="isMobile ? 220 : 240" label="设备类型分布" />
      </div>
    </div>

    <div class="grid c3 mt">
      <div class="card">
        <div class="sec-title">电池电量<span class="hint">电池供电设备</span></div>
        <VChart :option="batteryOpt" :height="200" label="电量分布" />
      </div>
      <div class="card">
        <div class="sec-title">信号强度</div>
        <VChart :option="signalOpt" :height="200" label="信号强度分布" />
      </div>
      <div class="card">
        <div class="sec-title">实时上报<span class="hint">{{ feed.length }} 条</span></div>
        <el-scrollbar height="200">
          <div v-for="(row, i) in feed" :key="i" class="feed" @click="row.deviceId && $router.push(`/devices/${row.deviceId}`)">
            <span class="feed-time num">{{ fmtTime(row.at).slice(11) }}</span>
            <span class="feed-dev mono">{{ row.deviceId || '-' }}</span>
            <span class="feed-tx">{{ TRANSPORT[row.transport] || row.transport }}</span>
            <span v-if="!row.ok" class="crit">异常</span>
          </div>
          <div v-if="!feed.length" class="muted empty-feed">等待设备上报…</div>
        </el-scrollbar>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { Cpu, CircleCheck } from '@element-plus/icons-vue';
import VChart from '../components/VChart.vue';
import DeviceMap from '../components/DeviceMap.vue';
import { api, loadTypes } from '../api.js';
import { fmtTime, fmtPct, fmtDuration, TRANSPORT } from '../utils/format.js';
import { timeLine, categoryBar } from '../utils/charts.js';
import { isDark, pal, STATUS_COLORS } from '../utils/theme.js';
import { onStream, debounce } from '../utils/stream.js';
import { isMobile } from '../utils/responsive.js';

const LEVEL = { high: '高', mid: '中', low: '低' };
const o = ref(null);
const hourly = ref([]);
const devices = ref([]);
const pendingList = ref([]);
const feed = ref([]);
const types = ref(new Map());
const trendDays = ref(30);
const trend = ref({ dates: [], series: [] });

async function load() {
  const [a, c, d, p] = await Promise.all([api.overview(), api.hourly(), api.devices({ size: 2000 }), api.alarms({ handle: 0, size: 30 })]);
  o.value = a;
  hourly.value = c;
  devices.value = d.items;
  pendingList.value = p.items;
}
async function loadTrend() { trend.value = await api.alarmTrend(trendDays.value); }
const reload = debounce(load, 2500);
onStream('frame', (f) => {
  if (f.purge) return reload();
  feed.value = [f, ...feed.value].slice(0, 40);
  reload();
});
onStream('alarm', () => { reload(); loadTrend(); });

let timer;
onMounted(async () => {
  load();
  loadTrend();
  types.value = await loadTypes();
  const recent = await api.frames({ direction: 'up', size: 20 });
  if (!feed.value.length) feed.value = recent.items.map((r) => ({ at: r.receivedAt, deviceId: r.deviceId, transport: r.transport, ok: r.ok }));
  timer = setInterval(load, 60000);
});
onBeforeUnmount(() => clearInterval(timer));

const pct = (v, t) => (t ? Math.max(v ? 2 : 0, (v / t) * 100) : 0);
const devCells = computed(() => {
  const d = o.value?.devices;
  if (!d) return [];
  return [
    { key: 'online', label: '在线', value: d.online, dot: 'good', color: STATUS_COLORS.good },
    { key: 'alarm', label: '报警', value: d.alarming, dot: 'critical', color: STATUS_COLORS.critical },
    { key: 'offline', label: '离线', value: d.offline - (d.inactive || 0), dot: 'neutral', color: STATUS_COLORS.neutral },
    { key: 'lowBattery', label: '低电量', value: d.lowBattery, dot: 'warning', color: STATUS_COLORS.warning },
  ];
});
const alarmCells = computed(() => {
  const a = o.value?.alarms;
  if (!a) return [];
  return [
    { key: 'total', label: '总告警', value: a.total, handle: 'all', color: 'var(--ink)', foot: `今日新增 ${o.value.today.alarms}` },
    { key: 'pending', label: '未处理', value: a.pending, handle: 0, color: 'var(--critical)', foot: `涉及 ${a.devices} 台设备` },
    { key: 'recorded', label: '已记录', value: a.recorded, handle: 1, color: '#d28e05', foot: '已知悉，待处理' },
    { key: 'handled', label: '已处理', value: a.handled, handle: 2, color: 'var(--good)', foot: a.total ? `处理率 ${fmtPct(a.handled / a.total, 0)}` : '—' },
  ];
});

const day = (d) => new Date(`${d}T00:00:00`).getTime();
/** 报警类型多于 5 种时，其余合并为“其他”，颜色按固定顺序分配 */
const alarmTrendOpt = computed(() => {
  void isDark.value;
  const s = trend.value.series;
  const top = s.slice(0, 5);
  const rest = s.slice(5);
  const series = top.map((x) => ({ name: x.name, data: x.data }));
  if (rest.length) series.push({ name: '其他', data: trend.value.dates.map((_, i) => rest.reduce((t, x) => t + x.data[i], 0)), color: '#9c9c9c' });
  if (!series.length) series.push({ name: '告警', data: trend.value.dates.map(() => 0) });
  return timeLine({
    series: series.map((x, i) => ({ name: x.name, color: x.color ?? pal().series[i], data: trend.value.dates.map((d, k) => [day(d), x.data[k]]) })),
    unit: '次', timeFmt: (ms) => fmtTime(ms).slice(0, 10), xFmt: '{MM}-{dd}',
  });
});
const hourlyOpt = computed(() => (isDark.value, timeLine({
  series: [{ name: '上报帧数', data: hourly.value.map((h) => [h.ts, h.frames]) }],
  unit: '帧', bar: true, timeFmt: (ms) => `${fmtTime(ms).slice(5, 13)}:00`,
})));
const typeOpt = computed(() => (isDark.value, categoryBar((o.value?.byType ?? []).slice(0, 8), { name: '设备数', unit: ' 台' })));
const batteryOpt = computed(() => (isDark.value, categoryBar(o.value?.battery ?? [], { horizontal: false, name: '设备数', unit: ' 台' })));
const signalOpt = computed(() => (isDark.value, categoryBar(o.value?.signal ?? [], { horizontal: false, name: '设备数', unit: ' 台' })));
</script>

<style scoped>
.kpi-row { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; }
.kpi-dev { display: flex; padding: 0; overflow: hidden; }
.kpi-hero {
  flex: none; width: 220px; padding: 20px; display: flex; gap: 14px; align-items: center; cursor: pointer; color: #fff;
  background: linear-gradient(135deg, #2f8cf0 0%, #1b64be 100%); position: relative; overflow: hidden;
}
.kpi-hero::after { content: ''; position: absolute; right: -40px; bottom: -40px; width: 140px; height: 140px; border-radius: 50%; background: rgba(255, 255, 255, 0.08); }
.kpi-hero .kpi-label, .kpi-hero .kpi-foot { color: rgba(255, 255, 255, 0.85); }
.kpi-ico { width: 48px; height: 48px; border-radius: 14px; background: rgba(255, 255, 255, 0.16); display: flex; align-items: center; justify-content: center; flex: none; }
.kpi-big { font-size: 38px; font-weight: 700; line-height: 1.1; margin: 2px 0; }
.kpi-cells { flex: 1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.kpi-cell { padding: 18px 20px; cursor: pointer; border-left: 1px solid var(--hair); transition: background 0.15s; min-width: 0; }
.kpi-cell:hover { background: var(--page-bg); }
.kpi-alarm { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 0; overflow: hidden; }
.kpi-alarm .kpi-cell:first-child { border-left: 0; }
.kpi-label { font-size: 13px; color: var(--ink-2); white-space: nowrap; }
.kpi-num { font-size: 30px; font-weight: 700; margin: 6px 0 8px; line-height: 1.1; }
.kpi-foot { font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kpi-bar { height: 4px; border-radius: 2px; background: var(--hair); overflow: hidden; }
.kpi-bar span { display: block; height: 100%; border-radius: 2px; }

.map-row { grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); }
.map-card { padding-bottom: 18px; }
.pend { display: flex; gap: 10px; padding: 12px 8px; border-radius: 10px; cursor: pointer; align-items: flex-start; }
.pend:hover { background: var(--page-bg); }
.pend + .pend { border-top: 1px solid var(--hair); }
.pend-body { min-width: 0; flex: 1; }
.pend-title { font-size: 13px; line-height: 1.5; }
.pend-title b { color: var(--critical); margin-left: 4px; }
.pend-meta { display: flex; gap: 10px; font-size: 12px; color: var(--ink-2); margin-top: 3px; flex-wrap: wrap; }
.crit { color: var(--critical); }
.ok { color: var(--good-text); }
.empty-ok { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 80px 0; color: var(--good); }
.empty-ok div { color: var(--ink-2); font-size: 13px; }
.feed { display: flex; gap: 10px; font-size: 12px; padding: 6px 2px; border-bottom: 1px solid var(--hair); cursor: pointer; align-items: center; }
.feed-time { color: var(--ink-2); }
.feed-dev { flex: 1; }
.feed-tx { color: var(--ink-2); }
.empty-feed { padding: 60px 0; text-align: center; font-size: 13px; }

@media (max-width: 1280px) {
  .kpi-row { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 900px) {
  .map-row { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 768px) {
  .kpi-dev { flex-direction: column; }
  .kpi-hero { width: auto; padding: 16px; }
  .kpi-cells, .kpi-alarm { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kpi-cell { padding: 12px 14px; border-top: 1px solid var(--hair); }
  .kpi-cells .kpi-cell:nth-child(odd), .kpi-alarm .kpi-cell:nth-child(odd) { border-left: 0; }
  .kpi-alarm .kpi-cell:nth-child(-n + 2) { border-top: 0; }
  .kpi-num { font-size: 24px; margin: 4px 0 6px; }
  .kpi-big { font-size: 30px; }
}
</style>
