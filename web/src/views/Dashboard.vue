<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>监控总览</h2>
        <div class="sub">更新于 {{ fmtTime(o?.now) }} · 实时推送已开启</div>
      </div>
      <el-button :icon="Refresh" @click="load" :loading="loading">刷新</el-button>
    </div>

    <div class="grid c4" v-if="o">
      <StatTile label="设备总数" :value="o.devices.total" :sub="`今日新增 ${o.devices.newToday}`" to="/devices" />
      <StatTile label="在线设备" status="good" :value="o.devices.online" :sub="`在线率 ${fmtPct(o.devices.onlineRate)}`" :to="{ path: '/devices', query: { status: 'online' } }" />
      <StatTile label="离线设备" status="neutral" :value="o.devices.offline" :to="{ path: '/devices', query: { status: 'offline' } }" />
      <StatTile label="报警设备" status="critical" :value="o.devices.alarming" :sub="`未确认报警 ${o.alarms.unacked}`" :to="{ path: '/devices', query: { status: 'alarm' } }" />
      <StatTile label="今日上报" :value="o.today.frames.toLocaleString()" unit="帧" :sub="`异常帧 ${o.today.badFrames}`" to="/frames" />
      <StatTile label="今日采集数据" :value="o.today.readings.toLocaleString()" unit="条" :sub="`累计 ${o.totals.readings.toLocaleString()} 条`" />
      <StatTile label="今日报警" :value="o.today.alarms" unit="次" :sub="`进行中 ${o.alarms.open}`" to="/alarms" />
      <StatTile label="低电量设备" status="warning" :value="o.devices.lowBattery" sub="电量 ≤ 20%" :to="{ path: '/devices', query: { status: 'lowBattery' } }" />
    </div>

    <div class="grid c3 mt">
      <div class="card span2">
        <div class="card-title">近 24 小时上报帧数<span class="hint">帧 / 小时</span></div>
        <VChart :option="hourlyOpt" :height="isMobile ? 200 : 260" label="近24小时上报帧数" />
      </div>
      <div class="card">
        <div class="card-title">设备状态</div>
        <div class="status-list" v-if="o">
          <div v-for="s in statusRows" :key="s.name" class="srow" @click="$router.push({ path: '/devices', query: { status: s.q } })">
            <span class="sname"><span class="dot" :class="s.cls" />{{ s.name }}</span>
            <span class="sbar"><span :style="{ width: pct(s.value) + '%', background: s.color }" /></span>
            <b class="num">{{ s.value }}</b>
          </div>
          <div class="kv"><span>接入方式</span><span>{{ o.byTransport.map((t) => `${TRANSPORT[t.name] || t.name} ${t.value}`).join(' · ') || '-' }}</span></div>
          <div class="kv"><span>供电方式</span><span>{{ o.byPower.map((t) => `${t.name} ${t.value}`).join(' · ') || '-' }}</span></div>
        </div>
      </div>
    </div>

    <div class="grid c3 mt">
      <div class="card">
        <div class="card-title">近 7 日上报帧数<span class="hint">帧</span></div>
        <VChart :option="trendFramesOpt" :height="isMobile ? 180 : 240" label="近7日上报帧数" />
      </div>
      <div class="card">
        <div class="card-title">近 7 日报警次数<span class="hint">次</span></div>
        <VChart :option="trendAlarmOpt" :height="isMobile ? 180 : 240" label="近7日报警次数" />
      </div>
      <div class="card">
        <div class="card-title">近 7 日活跃设备数<span class="hint">台</span></div>
        <VChart :option="trendActiveOpt" :height="isMobile ? 180 : 240" label="近7日活跃设备数" />
      </div>
    </div>

    <div class="grid c3 mt">
      <div class="card">
        <div class="card-title">设备类型分布<span class="hint">台</span></div>
        <VChart :option="typeOpt" :height="Math.max(220, (o?.byType.length || 0) * 26)" label="设备类型分布" @click="(p) => goType(p.name)" />
      </div>
      <div class="card">
        <div class="card-title">电池电量分布<span class="hint">电池供电设备</span></div>
        <VChart :option="batteryOpt" :height="220" label="电量分布" />
      </div>
      <div class="card">
        <div class="card-title">信号强度分布</div>
        <VChart :option="signalOpt" :height="220" label="信号强度分布" />
      </div>
    </div>

    <div class="grid c2 mt">
      <div class="card">
        <div class="card-title">最新报警 <a class="link hint" @click="$router.push('/alarms')">查看全部</a></div>
        <div v-if="isMobile" class="m-simple">
          <div v-for="row in alarms" :key="row.id" class="m-line" @click="$router.push(`/devices/${row.deviceId}`)">
            <div class="m-row"><span class="grow"><span class="dot" :class="row.open ? 'critical' : 'good'" />{{ row.label }}</span><span class="muted small">{{ fmtTime(row.startTs).slice(5, 16) }}</span></div>
            <div class="m-sub">{{ row.deviceName || row.deviceId }} · {{ row.open ? '报警中' : '已恢复' }}</div>
          </div>
          <el-empty v-if="!alarms.length" description="暂无报警" :image-size="60" />
        </div>
        <el-table v-else :data="alarms" size="small" empty-text="暂无报警">
          <el-table-column label="时间" width="150"><template #default="{ row }">{{ fmtTime(row.startTs) }}</template></el-table-column>
          <el-table-column label="设备" min-width="140">
            <template #default="{ row }"><a class="link" @click="$router.push(`/devices/${row.deviceId}`)">{{ row.deviceName || row.deviceId }}</a></template>
          </el-table-column>
          <el-table-column prop="label" label="报警类型" min-width="110" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><span class="dot" :class="row.open ? 'critical' : 'good'" />{{ row.open ? '报警中' : '已恢复' }}</template>
          </el-table-column>
        </el-table>
      </div>
      <div class="card">
        <div class="card-title">实时上报<span class="hint">最近 {{ feed.length }} 条</span></div>
        <div v-if="isMobile" class="m-simple">
          <div v-for="(row, i) in feed.slice(0, 10)" :key="i" class="m-line" @click="row.deviceId && $router.push(`/devices/${row.deviceId}`)">
            <div class="m-row"><span class="grow mono">{{ row.deviceId || '-' }}</span><span class="muted small">{{ fmtTime(row.at).slice(11) }} · {{ TRANSPORT[row.transport] || row.transport }}</span></div>
            <div class="m-sub"><span v-if="!row.ok" class="err">✕ {{ row.error }}</span><span v-else>{{ summary(row) }}</span></div>
          </div>
          <el-empty v-if="!feed.length" description="等待设备上报…" :image-size="60" />
        </div>
        <el-table v-else :data="feed" size="small" empty-text="等待设备上报…" max-height="330">
          <el-table-column label="时间" width="90"><template #default="{ row }">{{ fmtTime(row.at).slice(11) }}</template></el-table-column>
          <el-table-column label="设备" min-width="130">
            <template #default="{ row }"><a v-if="row.deviceId" class="link mono" @click="$router.push(`/devices/${row.deviceId}`)">{{ row.deviceId }}</a><span v-else>-</span></template>
          </el-table-column>
          <el-table-column label="方式" width="80"><template #default="{ row }">{{ TRANSPORT[row.transport] || row.transport }}</template></el-table-column>
          <el-table-column label="内容" min-width="180">
            <template #default="{ row }">
              <span v-if="!row.ok" class="err">✕ {{ row.error }}</span>
              <span v-else class="mono">{{ summary(row) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import VChart from '../components/VChart.vue';
import StatTile from '../components/StatTile.vue';
import { api, loadTypes } from '../api.js';
import { fmtTime, fmtPct, fmtParam, TRANSPORT } from '../utils/format.js';
import { timeLine, categoryBar } from '../utils/charts.js';
import { isDark, pal, STATUS_COLORS } from '../utils/theme.js';
import { onStream, debounce } from '../utils/stream.js';
import { isMobile } from '../utils/responsive.js';

const router = useRouter();
const o = ref(null);
const trend = ref([]);
const hourly = ref([]);
const alarms = ref([]);
const feed = ref([]);
const loading = ref(false);
const types = ref(new Map());

async function load() {
  loading.value = true;
  try {
    const [a, b, c, d] = await Promise.all([api.overview(), api.trend(7), api.hourly(), api.alarms({ size: 8 })]);
    o.value = a; trend.value = b; hourly.value = c; alarms.value = d.items;
  } finally {
    loading.value = false;
  }
}
const reload = debounce(load, 3000);

onStream('frame', (f) => {
  feed.value = [f, ...feed.value].slice(0, 30);
  reload();
});
onStream('alarm', reload);

let timer;
onMounted(async () => {
  load();
  types.value = await loadTypes();
  const recent = await api.frames({ direction: 'up', size: 15 });
  if (!feed.value.length) {
    feed.value = recent.items.map((r) => ({ at: r.receivedAt, deviceId: r.deviceId, transport: r.transport, ok: r.ok, error: r.error, typeCode: r.typeCode, records: r.recordCount, hexOnly: true }));
  }
  timer = setInterval(load, 60000);
});
onBeforeUnmount(() => clearInterval(timer));

function summary(row) {
  if (!row.realtime) return `类型 ${row.typeCode} · ${row.records ?? 0} 条缓存`;
  const def = types.value.get(row.typeCode);
  return Object.entries(row.realtime).filter(([k]) => k !== '_modbus').slice(0, 3).map(([k, v]) => {
    const p = def?.params.find((x) => x.key === k);
    return `${p?.name ?? k} ${fmtParam(p, v)}${p?.kind === 'num' && p.unit ? p.unit : ''}`;
  }).join('  ');
}

const total = computed(() => o.value?.devices.total || 0);
const pct = (v) => (total.value ? (v / total.value) * 100 : 0);
const statusRows = computed(() => {
  const s = o.value?.devices;
  if (!s) return [];
  return [
    { name: '在线正常', value: o.value.byStatus[0].value, cls: 'good', color: STATUS_COLORS.good, q: 'online' },
    { name: '报警', value: s.alarming, cls: 'critical', color: STATUS_COLORS.critical, q: 'alarm' },
    { name: '离线', value: s.offline, cls: 'neutral', color: STATUS_COLORS.neutral, q: 'offline' },
  ];
});

const day = (d) => new Date(`${d}T00:00:00`).getTime();
const dayFmt = (ms) => fmtTime(ms).slice(5, 10);
const hourlyOpt = computed(() => (isDark.value, timeLine({
  series: [{ name: '上报帧数', data: hourly.value.map((h) => [h.ts, h.frames]) }],
  unit: '帧', bar: true, timeFmt: (ms) => `${fmtTime(ms).slice(5, 13)}:00`,
})));
const trendOpt = (key, unit, color) => timeLine({
  series: [{ name: { frames: '上报帧数', alarms: '报警次数', activeDevices: '活跃设备' }[key], data: trend.value.map((t) => [day(t.date), t[key]]), color }],
  unit, area: true, timeFmt: dayFmt, xFmt: '{MM}-{dd}',
});
const trendFramesOpt = computed(() => (isDark.value, trendOpt('frames', '帧')));
const trendAlarmOpt = computed(() => (isDark.value, trendOpt('alarms', '次', pal().series[1])));
const trendActiveOpt = computed(() => (isDark.value, trendOpt('activeDevices', '台', pal().series[2])));
const typeOpt = computed(() => (isDark.value, categoryBar(o.value?.byType ?? [], { name: '设备数', unit: ' 台' })));
const batteryOpt = computed(() => (isDark.value, categoryBar(o.value?.battery ?? [], { horizontal: false, name: '设备数', unit: ' 台' })));
const signalOpt = computed(() => (isDark.value, categoryBar(o.value?.signal ?? [], { horizontal: false, name: '设备数', unit: ' 台' })));

async function goType(name) {
  const t = [...types.value.values()].find((x) => x.name === name);
  if (t) router.push({ path: '/devices', query: { type: t.code } });
}
</script>

<style scoped>
.status-list { display: flex; flex-direction: column; gap: 14px; padding-top: 6px; }
.srow { display: grid; grid-template-columns: 90px 1fr 48px; align-items: center; gap: 10px; cursor: pointer; }
.srow b { text-align: right; font-size: 18px; }
.sbar { height: 10px; background: var(--hair); border-radius: 5px; overflow: hidden; }
.sbar > span { display: block; height: 100%; border-radius: 5px; min-width: 2px; }
.kv { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; border-top: 1px solid var(--hair); padding-top: 10px; }
.kv span:first-child { color: var(--ink-2); white-space: nowrap; }
.kv span:last-child { text-align: right; }
.err { color: var(--critical); }
.small { font-size: 12px; }
.m-line { padding: 8px 0; border-bottom: 1px solid var(--hair); }
.m-line:last-child { border-bottom: 0; }
@media (max-width: 768px) {
  .srow { grid-template-columns: 76px 1fr 36px; }
}
</style>
