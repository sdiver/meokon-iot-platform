<template>
  <div class="page">
    <div class="mon-top">
      <div class="card rings">
        <div class="rings-title">待处理告警级别</div>
        <div class="ring-row">
          <div v-for="r in rings" :key="r.key" class="ring" @click="$router.push({ path: '/alarms', query: { handle: 0, level: r.key } })">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="42" class="track" />
              <circle cx="50" cy="50" r="42" class="arc" :style="{ stroke: r.color, strokeDasharray: `${r.dash} 264` }" />
            </svg>
            <div class="ring-in"><b class="num">{{ r.value }}</b><span>{{ r.text }}</span></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="sec-title">告警统计</div>
        <div class="stat-grid" v-if="s">
          <div v-for="c in statCells" :key="c.label" class="sc" :class="{ link: c.to }" @click="c.to && $router.push(c.to)">
            <div class="sc-label">{{ c.label }}</div>
            <b class="num" :style="{ color: c.color }">{{ c.value }}</b>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="sec-title">近 7 日告警<span class="hint">次</span></div>
        <VChart :option="weekOpt" :height="150" label="近7日告警次数" />
      </div>
    </div>

    <div class="grid mon-main mt">
      <div class="card">
        <div class="sec-title">告警待处理<span class="hint">{{ pend.total }} 条</span></div>
        <el-scrollbar :height="isMobile ? 380 : 480">
          <el-timeline class="pend-tl">
            <el-timeline-item v-for="a in pend.items" :key="a.id" :color="LEVEL_COLOR[a.level]" :timestamp="fmtTime(a.startTs)" placement="top">
              <div class="tl-card" @click="focus(a)">
                <div class="tl-title">{{ a.deviceName || a.deviceId }} 触发 <b>{{ a.label }}</b></div>
                <div class="tl-sub">
                  <span class="lv-badge" :class="a.level">{{ LEVEL[a.level] }}</span>
                  <span :class="a.open ? 'crit' : 'ok'">{{ a.open ? `报警中 ${fmtDuration(a.duration)}` : '已恢复' }}</span>
                  <span v-if="a.location" class="muted">{{ a.location }}</span>
                </div>
                <div class="tl-ops" @click.stop>
                  <el-button size="small" text type="primary" @click="handle(a, 1)">已记录</el-button>
                  <el-button size="small" text type="primary" @click="handle(a, 2)">已处理</el-button>
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>
          <div v-if="!pend.items.length" class="empty-ok"><el-icon :size="36"><CircleCheck /></el-icon><div>没有待处理的告警</div></div>
        </el-scrollbar>
      </div>
      <div class="card">
        <div class="sec-title">告警分布<span class="hint">存在未处理告警的设备</span></div>
        <DeviceMap ref="mapRef" :devices="alarmDevices" :types="types" :height="isMobile ? 320 : 480" :legend="false" @detail="(d) => $router.push(`/devices/${d.id}?tab=alarms`)" />
      </div>
    </div>

    <div class="grid c2 mt">
      <div class="card">
        <div class="sec-title">按告警类型<span class="hint">近 30 天</span></div>
        <VChart :option="labelOpt" :height="Math.max(200, (st?.byLabel.length || 0) * 30)" label="按告警类型" />
      </div>
      <div class="card">
        <div class="sec-title">告警时段分布<span class="hint">近 30 天，按小时</span></div>
        <VChart :option="hourOpt" :height="220" label="告警时段分布" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { CircleCheck } from '@element-plus/icons-vue';
import VChart from '../components/VChart.vue';
import DeviceMap from '../components/DeviceMap.vue';
import { api, loadTypes } from '../api.js';
import { fmtTime, fmtDuration } from '../utils/format.js';
import { timeLine, categoryBar } from '../utils/charts.js';
import { isDark, pal, STATUS_COLORS } from '../utils/theme.js';
import { onStream, debounce } from '../utils/stream.js';
import { isMobile } from '../utils/responsive.js';

const LEVEL = { high: '高', mid: '中', low: '低' };
const LEVEL_COLOR = { high: STATUS_COLORS.critical, mid: STATUS_COLORS.serious, low: STATUS_COLORS.warning };
const s = ref(null);
const st = ref(null);
const trend = ref([]);
const pend = ref({ total: 0, items: [] });
const devices = ref([]);
const types = ref(new Map());
const mapRef = ref(null);

async function load() {
  const [a, b, c, d, e] = await Promise.all([api.alarmSummary(), api.alarmStats(), api.trend(7), api.alarms({ handle: 0, size: 100 }), api.devices({ size: 2000 })]);
  s.value = a; st.value = b; trend.value = c; pend.value = d; devices.value = e.items;
}
onStream('alarm', debounce(load, 800));
onMounted(async () => { load(); types.value = await loadTypes(); });

const rings = computed(() => {
  const l = s.value?.levels ?? { high: 0, mid: 0, low: 0 };
  const total = Math.max(1, l.high + l.mid + l.low);
  return [
    { key: 'high', text: '高告警', value: l.high, color: STATUS_COLORS.critical },
    { key: 'mid', text: '中告警', value: l.mid, color: STATUS_COLORS.serious },
    { key: 'low', text: '低告警', value: l.low, color: STATUS_COLORS.warning },
  ].map((r) => ({ ...r, dash: Math.max(r.value ? 6 : 0, (r.value / total) * 264) }));
});
const statCells = computed(() => {
  const a = s.value;
  return [
    { label: '告警设备', value: a.devices, color: 'var(--ink)', to: '/alarms?handle=0' },
    { label: '告警消息总数', value: a.total, color: 'var(--ink)', to: '/alarms?handle=all' },
    { label: '未处理', value: a.pending, color: 'var(--critical)', to: '/alarms?handle=0' },
    { label: '已记录', value: a.recorded, color: '#d28e05', to: '/alarms?handle=1' },
    { label: '已处理', value: a.handled, color: 'var(--good)', to: '/alarms?handle=2' },
    { label: '报警中', value: a.open, color: 'var(--critical)' },
  ];
});
const alarmDevices = computed(() => {
  const ids = new Set(pend.value.items.map((a) => a.deviceId));
  return devices.value.filter((d) => ids.has(d.id));
});
function focus(a) {
  if (!mapRef.value?.focus(a.deviceId)) ElMessage.info('该设备未设置坐标');
}
async function handle(a, status) {
  await api.handleAlarms([a.id], status);
  ElMessage.success(status === 2 ? '已处理' : '已记录');
  load();
}

const day = (d) => new Date(`${d}T00:00:00`).getTime();
const weekOpt = computed(() => (isDark.value, timeLine({
  series: [{ name: '告警次数', color: pal().series[1], data: trend.value.map((t) => [day(t.date), t.alarms]) }],
  unit: '次', bar: true, timeFmt: (ms) => fmtTime(ms).slice(5, 10), xFmt: '{MM}-{dd}',
})));
const labelOpt = computed(() => (isDark.value, categoryBar(st.value?.byLabel ?? [], { name: '告警次数', unit: ' 次', color: pal().series[1] })));
const hourOpt = computed(() => (isDark.value, categoryBar((st.value?.hourOfDay || []).map((h) => ({ name: `${h.hour}时`, value: h.value })), { horizontal: false, name: '告警次数', unit: ' 次', color: pal().series[1] })));
</script>

<style scoped>
.mon-top { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.rings { background: linear-gradient(135deg, #1a2a4a 0%, #0f1b33 100%); color: #e6eeff; border: 0; }
.rings-title { font-size: 14px; font-weight: 600; opacity: 0.9; }
.ring-row { display: flex; justify-content: space-around; margin-top: 14px; gap: 8px; }
.ring { position: relative; width: 108px; height: 108px; cursor: pointer; }
.ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring .track { fill: none; stroke: rgba(255, 255, 255, 0.1); stroke-width: 8; }
.ring .arc { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dasharray 0.6s; }
.ring-in { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ring-in b { font-size: 26px; line-height: 1.1; }
.ring-in span { font-size: 12px; opacity: 0.75; }
.stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.sc { padding: 10px 12px; border-radius: 10px; background: var(--page-bg); }
.sc.link { cursor: pointer; }
.sc.link:hover { box-shadow: inset 0 0 0 1px var(--accent); }
.sc-label { font-size: 12px; color: var(--ink-2); white-space: nowrap; }
.sc b { font-size: 22px; }
.mon-main { grid-template-columns: minmax(320px, 1fr) minmax(0, 1.6fr); }
.pend-tl { padding: 4px 8px 0 4px; }
.tl-card { padding: 10px 12px; border-radius: 10px; background: var(--page-bg); cursor: pointer; }
.tl-card:hover { box-shadow: inset 0 0 0 1px var(--accent); }
.tl-title { font-size: 13px; }
.tl-title b { color: var(--critical); }
.tl-sub { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; margin-top: 6px; }
.tl-ops { display: flex; justify-content: flex-end; margin-top: 2px; }
.crit { color: var(--critical); }
.ok { color: var(--good-text); }
.empty-ok { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 100px 0; color: var(--good); }
.empty-ok div { color: var(--ink-2); font-size: 13px; }
@media (max-width: 1200px) { .mon-top { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .rings { grid-column: 1 / -1; } }
@media (max-width: 900px) { .mon-main { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 768px) {
  .mon-top { grid-template-columns: minmax(0, 1fr); }
  .ring { width: 88px; height: 88px; }
  .ring-in b { font-size: 20px; }
}
</style>
