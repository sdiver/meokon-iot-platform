<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>统计分析</h2>
        <div class="sub">上报量、报警、设备类型与设备活跃度统计</div>
      </div>
      <el-radio-group v-model="days" @change="load">
        <el-radio-button :value="7">近 7 天</el-radio-button>
        <el-radio-button :value="30">近 30 天</el-radio-button>
        <el-radio-button :value="90">近 90 天</el-radio-button>
      </el-radio-group>
    </div>

    <div class="grid tiles" v-if="trend.length">
      <StatTile label="上报帧数" :value="sum('frames').toLocaleString()" unit="帧" :sub="`日均 ${avg('frames')}`" />
      <StatTile label="异常帧" :value="sum('badFrames')" unit="帧" :sub="`异常率 ${fmtPct(sum('frames') + sum('badFrames') ? sum('badFrames') / (sum('frames') + sum('badFrames')) : 0, 2)}`" />
      <StatTile label="采集数据" :value="sum('readings').toLocaleString()" unit="条" :sub="`日均 ${avg('readings')}`" />
      <StatTile label="报警次数" :value="sum('alarms')" unit="次" :sub="`日均 ${avg('alarms')}`" />
      <StatTile label="日均活跃设备" :value="avg('activeDevices')" unit="台" />
    </div>

    <div class="grid c3 mt">
      <div class="card"><div class="card-title">每日上报帧数</div><VChart :option="opt('frames', '帧', 0)" :height="240" label="每日上报帧数" /></div>
      <div class="card"><div class="card-title">每日采集数据</div><VChart :option="opt('readings', '条', 2)" :height="240" label="每日采集数据" /></div>
      <div class="card"><div class="card-title">每日报警次数</div><VChart :option="opt('alarms', '次', 1)" :height="240" label="每日报警次数" /></div>
    </div>

    <h3 class="sec">报警分析</h3>
    <div class="grid c3" v-if="al">
      <div class="card"><div class="card-title">按报警类型</div><VChart :option="barOpt(al.byLabel)" :height="Math.max(200, al.byLabel.length * 28)" label="按报警类型" /></div>
      <div class="card"><div class="card-title">按设备类型</div><VChart :option="barOpt(al.byType)" :height="Math.max(200, al.byType.length * 28)" label="按设备类型" /></div>
      <div class="card"><div class="card-title">报警时段分布<span class="hint">按小时</span></div><VChart :option="hourOpt" :height="200" label="报警时段分布" /></div>
    </div>
    <div class="card mt" v-if="al">
      <div class="card-title">报警最多的设备<span class="hint">Top 10</span></div>
      <el-table :data="al.topDevices" size="small" empty-text="暂无报警">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column label="设备" min-width="160"><template #default="{ row }"><a class="link mono" @click="$router.push(`/devices/${row.id}?tab=alarms`)">{{ row.id }}</a> <span class="muted">{{ row.name }}</span></template></el-table-column>
        <el-table-column prop="typeName" label="类型" min-width="140" />
        <el-table-column prop="value" label="报警次数" width="100" align="right" />
        <el-table-column prop="open" label="进行中" width="90" align="right" />
      </el-table>
    </div>

    <h3 class="sec">设备类型统计</h3>
    <div class="card">
      <el-table :data="types" size="small">
        <el-table-column label="设备类型" min-width="180" fixed><template #default="{ row }">{{ row.name }} <span class="muted">· {{ row.code }}</span></template></el-table-column>
        <el-table-column prop="category" label="类别" width="90" />
        <el-table-column prop="devices" label="设备数" width="80" align="right" />
        <el-table-column label="在线" width="80" align="right"><template #default="{ row }">{{ row.online }}</template></el-table-column>
        <el-table-column label="报警中" width="80" align="right"><template #default="{ row }"><span :class="{ crit: row.alarming }">{{ row.alarming }}</span></template></el-table-column>
        <el-table-column prop="frames24h" label="24h 上报" width="90" align="right" />
        <el-table-column prop="alarms30d" label="30 天报警" width="90" align="right" />
        <el-table-column label="在线设备当前值（平均 / 最小 ~ 最大）" min-width="320">
          <template #default="{ row }">
            <div v-for="p in row.params.slice(0, 4)" :key="p.key" class="pv">
              <span class="muted">{{ p.name }}</span>
              <span class="num">{{ fmtNum(p.avg, 2) }}</span>
              <span class="muted num">（{{ fmtNum(p.min) }} ~ {{ fmtNum(p.max) }}）{{ p.unit }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <h3 class="sec">设备活跃度排行<span class="hint">近 {{ days }} 天</span></h3>
    <div class="card">
      <el-table :data="activity" size="small">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column label="设备" min-width="170"><template #default="{ row }"><a class="link mono" @click="$router.push(`/devices/${row.id}`)">{{ row.id }}</a> <span class="muted">{{ row.name }}</span></template></el-table-column>
        <el-table-column prop="typeName" label="类型" min-width="140" />
        <el-table-column prop="ok" label="成功上报" width="100" align="right" />
        <el-table-column prop="bad" label="异常帧" width="80" align="right" />
        <el-table-column label="成功率" width="90" align="right"><template #default="{ row }">{{ fmtPct(row.successRate) }}</template></el-table-column>
        <el-table-column prop="records" label="缓存记录" width="100" align="right" />
        <el-table-column label="最后上报" width="160"><template #default="{ row }">{{ fmtTime(row.last) }}</template></el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import VChart from '../components/VChart.vue';
import StatTile from '../components/StatTile.vue';
import { api } from '../api.js';
import { fmtPct, fmtNum, fmtTime } from '../utils/format.js';
import { timeLine, categoryBar } from '../utils/charts.js';
import { isDark, pal } from '../utils/theme.js';

const days = ref(30);
const trend = ref([]);
const al = ref(null);
const types = ref([]);
const activity = ref([]);

async function load() {
  const from = Date.now() - days.value * 86400000;
  const [t, a, ty, ac] = await Promise.all([api.trend(days.value), api.alarmStats({ from }), api.typeStats(), api.activity({ from, limit: 50 })]);
  trend.value = t; al.value = a; types.value = ty; activity.value = ac;
}
onMounted(load);

const sum = (k) => trend.value.reduce((s, d) => s + d[k], 0);
const avg = (k) => (trend.value.length ? Math.round(sum(k) / trend.value.length).toLocaleString() : 0);
const day = (d) => new Date(`${d}T00:00:00`).getTime();
const names = { frames: '上报帧数', readings: '采集数据', alarms: '报警次数' };
function opt(k, unit, ci) {
  void isDark.value;
  return timeLine({
    series: [{ name: names[k], color: pal().series[ci], data: trend.value.map((d) => [day(d.date), d[k]]) }],
    unit, area: true, timeFmt: (ms) => fmtTime(ms).slice(0, 10), xFmt: '{MM}-{dd}',
  });
}
const barOpt = (items) => (isDark.value, categoryBar(items, { name: '报警次数', unit: ' 次', color: pal().series[1] }));
const hourOpt = computed(() => (isDark.value, categoryBar((al.value?.hourOfDay || []).map((h) => ({ name: `${h.hour}时`, value: h.value })), { horizontal: false, name: '报警次数', unit: ' 次', color: pal().series[1] })));
</script>

<style scoped>
.sec { margin: 28px 0 12px; font-size: 16px; display: flex; align-items: baseline; gap: 8px; }
.sec .hint { font-size: 12px; font-weight: 400; color: var(--ink-2); }
.pv { display: flex; gap: 8px; font-size: 13px; }
.crit { color: var(--critical); font-weight: 600; }
</style>
