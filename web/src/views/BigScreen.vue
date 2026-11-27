<template>
  <div class="bs-viewport" ref="vp">
    <div class="bs" :class="{ fluid: isMobile }" :style="stageStyle">
      <!-- 顶部 -->
      <header class="bs-head">
        <div class="bs-head-l">
          <span class="live"><i />实时</span>
          <span class="bs-sub">{{ ui.platformName }}</span>
        </div>
        <div class="bs-title">
          <h1>{{ ui.screenTitle }}</h1>
          <svg class="bs-title-line" viewBox="0 0 600 12" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="tl" x1="0" x2="1"><stop offset="0" stop-color="#3aa0ff" stop-opacity="0" /><stop offset=".5" stop-color="#5ec8ff" /><stop offset="1" stop-color="#3aa0ff" stop-opacity="0" /></linearGradient></defs>
            <path d="M0 6 H220 L232 11 H368 L380 6 H600" stroke="url(#tl)" stroke-width="1.5" fill="none" />
          </svg>
        </div>
        <div class="bs-head-r">
          <div class="clock num">{{ clock.time }}</div>
          <div class="date">{{ clock.date }}<br />{{ clock.week }}</div>
          <button class="exit" @click="exit" aria-label="退出大屏">退出</button>
        </div>
      </header>

      <div class="bs-body">
        <!-- 左列 -->
        <section class="col">
          <div class="panel">
            <h3>设备概况</h3>
            <div class="dev-sum">
              <div class="gauge">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="50" class="g-track" />
                  <circle cx="60" cy="60" r="50" class="g-arc" :style="{ strokeDasharray: `${(o?.devices.onlineRate ?? 0) * 314} 314` }" />
                  <circle cx="60" cy="60" r="40" class="g-inner" />
                </svg>
                <div class="g-txt"><b class="num">{{ o ? Math.round(o.devices.onlineRate * 100) : '-' }}<small>%</small></b><span>在线率</span></div>
              </div>
              <div class="dev-nums">
                <div class="dn total"><span>设备总数</span><b class="num">{{ o?.devices.total ?? '-' }}</b></div>
                <div class="dn"><span><i class="d good" />在线</span><b class="num">{{ o?.devices.online ?? '-' }}</b></div>
                <div class="dn"><span><i class="d off" />离线</span><b class="num">{{ o?.devices.offline ?? '-' }}</b></div>
                <div class="dn"><span><i class="d crit" />报警</span><b class="num">{{ o?.devices.alarming ?? '-' }}</b></div>
              </div>
            </div>
          </div>
          <div class="panel">
            <h3>{{ groupTitle }}</h3>
            <div class="bars">
              <div v-for="g in groupBars" :key="g.name" class="bar-row">
                <span class="bar-name" :title="g.name">{{ g.name }}</span>
                <span class="bar-track"><span class="bar-fill" :style="{ width: g.pct + '%' }" /></span>
                <b class="num">{{ g.value }}</b>
              </div>
              <div v-if="!groupBars.length" class="none">暂无设备</div>
            </div>
          </div>
          <div class="panel grow">
            <h3>近 7 日告警趋势</h3>
            <VChart :option="trendOpt" height="100%" class="fill-chart" label="近7日告警趋势" />
          </div>
        </section>

        <!-- 中间 -->
        <section class="col mid">
          <div class="kpis">
            <div v-for="k in kpis" :key="k.label" class="kpi">
              <span class="k-label">{{ k.label }}</span>
              <b class="num">{{ k.value }}<small v-if="k.unit">{{ k.unit }}</small></b>
            </div>
          </div>
          <div class="panel map-panel grow">
            <DeviceMap :devices="devices" :types="types" theme="dark" height="100%" :zoom-control="false" @detail="(d) => openDevice(d.id)" />
          </div>
        </section>

        <!-- 右列 -->
        <section class="col">
          <div class="panel">
            <h3>告警概况</h3>
            <div class="alarm-sum">
              <div v-for="a in alarmTiles" :key="a.label" class="as" :style="{ '--c': a.color }">
                <span>{{ a.label }}</span>
                <b class="num">{{ a.value }}</b>
              </div>
            </div>
          </div>
          <div class="panel">
            <h3>告警类型<small>近 30 天</small></h3>
            <div class="bars">
              <div v-for="g in labelBars" :key="g.name" class="bar-row">
                <span class="bar-name" :title="g.name">{{ g.name }}</span>
                <span class="bar-track"><span class="bar-fill warm" :style="{ width: g.pct + '%' }" /></span>
                <b class="num">{{ g.value }}</b>
              </div>
              <div v-if="!labelBars.length" class="none">近 30 天无告警</div>
            </div>
          </div>
          <div class="panel grow">
            <h3>实时告警<small>{{ o?.alarms.pending ?? alarms.length }} 条未处理</small></h3>
            <div class="alist-head"><span>设备</span><span>告警类型</span><span>时间</span><span>状态</span></div>
            <div class="alist" ref="listEl" @mouseenter="paused = true" @mouseleave="paused = false">
              <div v-for="a in alarms" :key="a.id" class="arow" @click="openDevice(a.deviceId)">
                <span class="a-dev" :title="a.deviceName || a.deviceId">{{ a.deviceName || a.deviceId }}</span>
                <span class="a-type" :class="a.level">{{ a.label }}</span>
                <span class="num">{{ fmtTime(a.startTs).slice(5, 16) }}</span>
                <span :class="a.open ? 'on' : 'rec'">{{ a.open ? '报警中' : '已恢复' }}</span>
              </div>
              <div v-if="!alarms.length" class="none ok">✓ 当前没有未处理的告警</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import VChart from '../components/VChart.vue';
import DeviceMap from '../components/DeviceMap.vue';
import { api, ui, loadUiConfig, loadTypes } from '../api.js';
import { fmtTime, fmtPct } from '../utils/format.js';
import { timeLine } from '../utils/charts.js';
import { SCREEN_PALETTE } from '../utils/theme.js';
import { onStream, debounce } from '../utils/stream.js';
import { isMobile } from '../utils/responsive.js';
import { playAlarm } from '../utils/alarmSound.js';

const router = useRouter();
const vp = ref(null);
const listEl = ref(null);
const o = ref(null);
const devices = ref([]);
const alarms = ref([]);
const stats = ref(null);
const trend = ref([]);
const types = ref(new Map());
const paused = ref(false);

// 1920×1080 设计稿等比缩放铺满屏幕
const W = 1920;
const H = 1080;
const scale = ref(1);
const stageStyle = computed(() => (isMobile.value ? {} : { width: `${W}px`, height: `${H}px`, transform: `scale(${scale.value})` }));
function fit() {
  const el = vp.value;
  if (!el) return;
  scale.value = Math.min(el.clientWidth / W, el.clientHeight / H);
}

const clock = reactive({ time: '', date: '', week: '' });
const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
function tick() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  clock.time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  clock.date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  clock.week = WEEK[d.getDay()];
}

async function load() {
  const [a, b, c, d, e] = await Promise.all([api.overview(), api.devices({ size: 2000 }), api.alarms({ handle: 0, size: 50 }), api.alarmStats(), api.trend(7)]);
  o.value = a; devices.value = b.items; alarms.value = c.items; stats.value = d; trend.value = e;
}
const reload = debounce(load, 2000);
onStream('frame', reload);
onStream('alarm', (a) => { if (a.state === 'open') playAlarm(); reload(); });

const kpis = computed(() => {
  const x = o.value;
  if (!x) return [];
  return [
    { label: '今日上报', value: x.today.frames.toLocaleString(), unit: '帧' },
    { label: '今日采集数据', value: x.today.readings.toLocaleString(), unit: '条' },
    { label: '设备在线率', value: fmtPct(x.devices.onlineRate, 1) },
    { label: '今日告警', value: x.today.alarms, unit: '次' },
    { label: '低电量设备', value: x.devices.lowBattery, unit: '台' },
  ];
});
const toBars = (list, n = 6) => {
  const top = list.slice(0, n);
  const max = Math.max(1, ...top.map((x) => x.value));
  return top.map((x) => ({ ...x, pct: (x.value / max) * 100 }));
};
/** 有分组时按分组统计，否则按设备类别 */
const useGroups = computed(() => (o.value?.byGroup ?? []).some((g) => g.name !== '未分组'));
const groupTitle = computed(() => (useGroups.value ? '设备分组' : '设备类别'));
const groupBars = computed(() => toBars((useGroups.value ? o.value?.byGroup : o.value?.byCategory) ?? []));
const labelBars = computed(() => toBars(stats.value?.byLabel ?? []));
const alarmTiles = computed(() => {
  const a = o.value?.alarms;
  return [
    { label: '告警总数', value: a?.total ?? '-', color: '#5ec8ff' },
    { label: '未处理', value: a?.pending ?? '-', color: '#ff5b5c' },
    { label: '已记录', value: a?.recorded ?? '-', color: '#fbb315' },
    { label: '已处理', value: a?.handled ?? '-', color: '#2fd36a' },
  ];
});
const day = (d) => new Date(`${d}T00:00:00`).getTime();
const trendOpt = computed(() => {
  const opt = timeLine({
    palette: SCREEN_PALETTE,
    series: [
      { name: '告警次数', color: '#ff7a45', data: trend.value.map((t) => [day(t.date), t.alarms]) },
    ],
    unit: '次', area: true, timeFmt: (ms) => fmtTime(ms).slice(5, 10), xFmt: '{MM}-{dd}',
  });
  opt.grid = { left: 4, right: 12, top: 12, bottom: 4, containLabel: true };
  opt.series[0].areaStyle = { opacity: 0.18 };
  return opt;
});

function openDevice(id) { window.open(router.resolve(`/devices/${id}`).href, '_blank'); }
function exit() {
  if (window.opener) window.close();
  else router.push('/');
}

// 告警列表自动滚动
let scrollTimer;
function autoScroll() {
  const el = listEl.value;
  if (!el || paused.value || el.scrollHeight <= el.clientHeight + 4) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) el.scrollTo({ top: 0, behavior: 'smooth' });
  else el.scrollBy({ top: 38, behavior: 'smooth' });
}

let clockTimer;
let refreshTimer;
let ro;
onMounted(async () => {
  document.documentElement.classList.add('screen-mode');
  tick();
  clockTimer = setInterval(tick, 1000);
  await loadUiConfig();
  document.title = ui.screenTitle;
  load();
  types.value = await loadTypes();
  refreshTimer = setInterval(load, 60000);
  scrollTimer = setInterval(autoScroll, 2500);
  fit();
  ro = new ResizeObserver(fit);
  ro.observe(vp.value);
});
onBeforeUnmount(() => {
  document.documentElement.classList.remove('screen-mode');
  clearInterval(clockTimer);
  clearInterval(refreshTimer);
  clearInterval(scrollTimer);
  ro?.disconnect();
});
</script>

<style scoped>
.bs-viewport {
  position: fixed; inset: 0; overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: #040b18;
}
.bs {
  flex: none; transform-origin: center center; display: flex; flex-direction: column; color: #dce8ff; position: relative;
  font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background:
    radial-gradient(ellipse 60% 50% at 50% 45%, rgba(30, 90, 190, 0.28), transparent 70%),
    radial-gradient(ellipse 40% 30% at 50% 0%, rgba(60, 150, 255, 0.18), transparent 70%),
    repeating-linear-gradient(0deg, transparent 0 47px, rgba(80, 150, 255, 0.045) 47px 48px),
    repeating-linear-gradient(90deg, transparent 0 47px, rgba(80, 150, 255, 0.045) 47px 48px),
    #050e1f;
}
.num { font-variant-numeric: tabular-nums; }

/* 顶部 */
.bs-head { height: 92px; flex: none; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 0 32px; position: relative; }
.bs-head::after { content: ''; position: absolute; left: 24px; right: 24px; bottom: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(94, 200, 255, 0.35), transparent); }
.bs-head-l { display: flex; align-items: center; gap: 18px; }
.live { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: #6ee7a8; letter-spacing: 2px; }
.live i { width: 8px; height: 8px; border-radius: 50%; background: #2fd36a; box-shadow: 0 0 10px #2fd36a; animation: blink 1.6s ease-in-out infinite; }
@keyframes blink { 50% { opacity: 0.35; } }
.bs-sub { font-size: 15px; color: #7f95b5; letter-spacing: 1px; }
.bs-title { text-align: center; }
.bs-title h1 {
  margin: 0; font-size: 38px; font-weight: 700; letter-spacing: 10px; padding-left: 10px;
  background: linear-gradient(180deg, #ffffff 20%, #8fd3ff 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: 0 0 24px rgba(80, 170, 255, 0.35);
}
.bs-title-line { display: block; width: 600px; height: 12px; margin: 8px auto 0; }
.bs-head-r { display: flex; justify-content: flex-end; align-items: center; gap: 14px; }
.clock { font-size: 34px; font-weight: 600; letter-spacing: 2px; color: #e9f3ff; }
.date { font-size: 13px; color: #7f95b5; line-height: 1.4; }
.exit { margin-left: 8px; height: 30px; padding: 0 14px; border-radius: 15px; border: 1px solid rgba(94, 200, 255, 0.35); background: rgba(10, 30, 60, 0.6); color: #8fd3ff; cursor: pointer; font: inherit; font-size: 13px; }
.exit:hover { background: rgba(30, 90, 190, 0.5); }

/* 主体 */
.bs-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 450px 1fr 450px; gap: 20px; padding: 20px 24px 24px; }
.col { display: flex; flex-direction: column; gap: 20px; min-height: 0; min-width: 0; }
.grow { flex: 1; min-height: 0; }
.panel {
  position: relative; padding: 16px 18px 18px; border-radius: 6px; display: flex; flex-direction: column;
  background: linear-gradient(180deg, rgba(14, 38, 78, 0.62), rgba(8, 22, 48, 0.55));
  border: 1px solid rgba(80, 160, 255, 0.16); box-shadow: inset 0 0 30px rgba(40, 120, 255, 0.06);
}
/* 四角装饰 */
.panel::before, .panel::after { content: ''; position: absolute; width: 14px; height: 14px; border-color: #4fb8ff; border-style: solid; pointer-events: none; }
.panel::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; border-radius: 6px 0 0 0; }
.panel::after { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; border-radius: 0 0 6px 0; }
.panel h3 {
  margin: 0 0 14px; font-size: 17px; font-weight: 600; letter-spacing: 2px; display: flex; align-items: center; gap: 10px; color: #eaf4ff;
}
.panel h3::before { content: ''; width: 4px; height: 16px; border-radius: 2px; background: linear-gradient(180deg, #5ec8ff, #2a7bff); box-shadow: 0 0 8px #3aa0ff; }
.panel h3 small { margin-left: auto; font-size: 12px; font-weight: 400; letter-spacing: 0; color: #7f95b5; }
.none { color: #7f95b5; font-size: 14px; text-align: center; padding: 20px 0; }
.none.ok { color: #6ee7a8; padding-top: 60px; }

/* 设备概况 */
.dev-sum { display: flex; align-items: center; gap: 22px; }
.gauge { position: relative; width: 150px; height: 150px; flex: none; }
.gauge svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.g-track { fill: none; stroke: rgba(80, 160, 255, 0.12); stroke-width: 9; }
.g-arc { fill: none; stroke: #2fd36a; stroke-width: 9; stroke-linecap: round; filter: drop-shadow(0 0 6px rgba(47, 211, 106, 0.6)); transition: stroke-dasharray 0.8s; }
.g-inner { fill: rgba(10, 30, 60, 0.6); stroke: rgba(80, 160, 255, 0.15); stroke-dasharray: 2 4; }
.g-txt { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.g-txt b { font-size: 34px; line-height: 1; }
.g-txt small { font-size: 16px; margin-left: 2px; }
.g-txt span { font-size: 13px; color: #7f95b5; margin-top: 4px; }
.dev-nums { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.dn { padding: 8px 12px; border-radius: 4px; background: rgba(40, 110, 220, 0.1); border-left: 2px solid rgba(94, 200, 255, 0.4); display: flex; flex-direction: column; }
.dn span { font-size: 13px; color: #8fa7c9; display: flex; align-items: center; gap: 6px; }
.dn b { font-size: 26px; line-height: 1.2; color: #fff; }
.dn.total b { color: #5ec8ff; }
.d { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.d.good { background: #2fd36a; box-shadow: 0 0 6px #2fd36a; }
.d.off { background: #8a94a6; }
.d.crit { background: #ff5b5c; box-shadow: 0 0 6px #ff5b5c; }

/* 横向条 */
.bars { display: flex; flex-direction: column; gap: 12px; }
.bar-row { display: grid; grid-template-columns: 110px 1fr 44px; align-items: center; gap: 10px; font-size: 14px; }
.bar-name { color: #b8cbe8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-track { height: 8px; border-radius: 4px; background: rgba(80, 160, 255, 0.1); overflow: hidden; }
.bar-fill { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #1f6fff, #5ec8ff); box-shadow: 0 0 8px rgba(94, 200, 255, 0.5); transition: width 0.8s; }
.bar-fill.warm { background: linear-gradient(90deg, #d0402c, #ff9a45); box-shadow: 0 0 8px rgba(255, 122, 69, 0.45); }
.bar-row b { text-align: right; color: #fff; font-size: 16px; }
.fill-chart { flex: 1; min-height: 0; }

/* 中间 */
.kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; flex: none; }
.kpi {
  padding: 14px 16px; border-radius: 6px; text-align: center;
  background: linear-gradient(180deg, rgba(30, 90, 190, 0.28), rgba(10, 30, 70, 0.2)); border: 1px solid rgba(80, 160, 255, 0.2);
}
.k-label { font-size: 14px; color: #8fa7c9; letter-spacing: 1px; }
.kpi b { display: block; margin-top: 6px; font-size: 32px; font-weight: 700; color: #fff; text-shadow: 0 0 14px rgba(94, 200, 255, 0.45); }
.kpi small { font-size: 14px; font-weight: 400; color: #8fa7c9; margin-left: 4px; }
.map-panel { padding: 6px; }
.map-panel :deep(.dmap) { border-radius: 4px; }

/* 告警概况 */
.alarm-sum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.as { padding: 12px 6px; text-align: center; border-radius: 4px; background: rgba(10, 30, 60, 0.5); border-top: 2px solid var(--c); }
.as span { font-size: 13px; color: #8fa7c9; }
.as b { display: block; font-size: 30px; margin-top: 4px; color: var(--c); text-shadow: 0 0 12px color-mix(in srgb, var(--c) 50%, transparent); }

/* 告警列表 */
.alist-head, .arow { display: grid; grid-template-columns: 1.3fr 1.1fr 1fr 62px; gap: 8px; align-items: center; padding: 0 10px; font-size: 14px; }
.alist-head { height: 34px; color: #7f95b5; background: rgba(40, 110, 220, 0.14); border-radius: 3px; flex: none; }
.alist { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; }
.alist::-webkit-scrollbar { display: none; }
.arow { height: 38px; border-bottom: 1px dashed rgba(80, 160, 255, 0.12); cursor: pointer; }
.arow:hover { background: rgba(40, 110, 220, 0.14); }
.arow > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.a-dev { color: #dce8ff; }
.a-type.high { color: #ff6b6b; }
.a-type.mid { color: #ff9a45; }
.a-type.low { color: #fbc84a; }
.arow .on { color: #ff6b6b; }
.arow .rec { color: #6ee7a8; }
.arow > span:nth-child(3) { color: #8fa7c9; font-size: 13px; }

/* 手机：纵向排列，不缩放 */
.bs.fluid { width: 100%; min-height: 100%; }
@media (max-width: 768px) {
  .bs-viewport { position: static; min-height: 100vh; display: block; overflow: visible; }
  .bs-head { height: auto; grid-template-columns: 1fr; gap: 6px; padding: 14px 16px; text-align: center; }
  .bs-head-l, .bs-head-r { justify-content: center; }
  .bs-title h1 { font-size: 22px; letter-spacing: 4px; padding-left: 4px; }
  .bs-title-line { width: 100%; }
  .clock { font-size: 22px; }
  .bs-body { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
  .col { gap: 12px; }
  .col.mid { order: -1; }
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kpi b { font-size: 22px; }
  .map-panel { height: 340px; flex: none; }
  .panel.grow { min-height: 260px; }
  .gauge { width: 120px; height: 120px; }
  .alarm-sum .as b { font-size: 22px; }
}
</style>

<style>
html.screen-mode, html.screen-mode body { background: #040b18; }
</style>
