<template>
  <div class="page" v-if="dev">
    <div class="page-head">
      <div>
        <h2><el-button link :icon="ArrowLeft" @click="$router.back()" aria-label="返回" /> {{ dev.name || dev.id }} <DeviceStatus :status="dev.status" class="st" /></h2>
        <div class="sub"><span class="mono">{{ dev.id }}</span> · {{ dev.typeName }}（类型 {{ dev.typeCode }}）<template v-if="dev.location"> · {{ dev.location }}</template></div>
      </div>
      <div>
        <el-button :icon="Edit" @click="editDlg.open(dev)">编辑</el-button>
        <el-button :icon="Refresh" @click="loadDevice">刷新</el-button>
      </div>
    </div>

    <el-tabs v-model="tab" class="tabs">
      <!-- 实时数据 -->
      <el-tab-pane label="实时数据" name="realtime">
        <div class="grid params">
          <div v-for="p in paramCards" :key="p.key" class="card pcard" :class="{ over: p.state }">
            <div class="pname">{{ p.name }}</div>
            <template v-if="p.kind === 'bits'">
              <BitChannels :value="p.value" :n="p.bits" class="mt8" />
              <div class="muted small mt8">闭合 {{ closedChannels(p.value, p.bits).length }} / {{ p.bits }}</div>
            </template>
            <template v-else>
              <div class="pval num">{{ p.text }}<span class="unit">{{ p.unit }}</span></div>
              <div class="muted small" v-if="p.th">报警范围 {{ p.th.low }} ~ {{ p.th.high }} {{ p.unit }}</div>
              <div v-if="p.state" class="over-txt"><span class="dot critical" />{{ p.state }}</div>
            </template>
          </div>
        </div>

        <div class="grid c2 mt">
          <div class="card">
            <div class="card-title">设备状态</div>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="在线状态"><DeviceStatus :status="dev.status" />（{{ fmtAgo(dev.lastSeen) }}上报，超过 {{ fmtDuration(dev.offlineAfter * 1000) }} 未上报视为离线）</el-descriptions-item>
              <el-descriptions-item label="报警状态">
                <template v-if="dev.alarm.bits.length"><el-tag v-for="b in dev.alarm.bits" :key="b.bit" type="danger" size="small" class="mr4">{{ b.label }}</el-tag></template>
                <span v-else>正常</span>
                <span class="muted">（{{ hex(dev.alarm.raw) }}）</span>
              </el-descriptions-item>
              <el-descriptions-item label="电量 / 信号"><BatterySignal :battery="dev.battery" :signal="dev.signal" /> <span class="muted">{{ dev.battery.mode }}</span></el-descriptions-item>
              <el-descriptions-item label="采集间隔">{{ dev.interval }} 秒，每次上报 {{ dev.recordCount }} 条缓存数据</el-descriptions-item>
              <el-descriptions-item label="设备采集时间">{{ fmtSec(dev.lastUtc) }}</el-descriptions-item>
              <el-descriptions-item label="平台接收时间">{{ fmtTime(dev.lastSeen) }}</el-descriptions-item>
            </el-descriptions>
          </div>
          <div class="card">
            <div class="card-title">设备档案</div>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="接入方式">{{ TRANSPORT[dev.transport] || dev.transport }} <span class="muted mono">{{ dev.remote }}</span></el-descriptions-item>
              <el-descriptions-item label="分组">{{ dev.groupName || '-' }}</el-descriptions-item>
              <el-descriptions-item label="坐标">
                <template v-if="dev.lat != null">{{ dev.lng?.toFixed(6) }}, {{ dev.lat?.toFixed(6) }}
                  <a class="link" :href="`https://www.openstreetmap.org/?mlat=${dev.lat}&mlon=${dev.lng}#map=16/${dev.lat}/${dev.lng}`" target="_blank" rel="noopener">地图</a>
                </template>
                <span v-else class="muted">未设置</span>
              </el-descriptions-item>
              <el-descriptions-item label="首次上报">{{ fmtTime(dev.firstSeen) }}</el-descriptions-item>
              <el-descriptions-item label="累计上报">{{ dev.frameCount }} 帧</el-descriptions-item>
              <el-descriptions-item label="备注">{{ dev.remark || '-' }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </div>
      </el-tab-pane>

      <!-- 历史曲线 -->
      <el-tab-pane label="历史曲线" name="chart" lazy>
        <div class="filters">
          <RangePicker v-model="range" />
          <el-select v-model="chartKeys" multiple collapse-tags collapse-tags-tooltip placeholder="选择参数" style="width: 260px">
            <el-option v-for="p in chartParams" :key="p.key" :label="`${p.name}${p.unit ? ' (' + p.unit + ')' : ''}`" :value="p.key" />
          </el-select>
          <el-select v-model="bucket" style="width: 130px">
            <el-option label="自动聚合" value="auto" />
            <el-option label="原始数据" :value="0" />
            <el-option label="10 分钟" :value="600" />
            <el-option label="1 小时" :value="3600" />
            <el-option label="1 天" :value="86400" />
          </el-select>
          <span class="muted small" v-if="series">{{ series.bucket ? `按 ${bucketText(series.bucket)} 聚合平均值` : '原始采集点' }} · {{ series.points.length }} 个点</span>
        </div>
        <div v-if="!chartParams.length" class="card muted">该设备类型没有可绘制曲线的数值参数</div>
        <div class="grid" :class="chartGroups.length > 1 ? 'c2' : ''">
          <div v-for="g in chartGroups" :key="g.unit" class="card">
            <div class="card-title">{{ g.params.map((p) => p.name).join(' / ') }}<span class="hint">{{ g.unit }}</span></div>
            <VChart :option="g.option" :height="300" :label="g.params.map((p) => p.name).join('、') + '历史曲线'" />
          </div>
        </div>
      </el-tab-pane>

      <!-- 统计 -->
      <el-tab-pane label="统计分析" name="stats" lazy>
        <div class="filters"><RangePicker v-model="range" /></div>
        <div class="grid tiles" v-if="stat">
          <StatTile label="采集数据" :value="stat.count" unit="条" />
          <StatTile label="数据完整率" :value="stat.completeness == null ? '-' : fmtPct(stat.completeness)" :sub="`按 ${dev.interval} 秒间隔估算`" />
          <StatTile label="首条数据" :value="stat.firstTs ? fmtSec(stat.firstTs).slice(5, 16) : '-'" />
          <StatTile label="末条数据" :value="stat.lastTs ? fmtSec(stat.lastTs).slice(5, 16) : '-'" />
          <StatTile label="期间报警" :value="alarmCountInRange" unit="次" />
        </div>
        <div class="card mt">
          <el-table :data="stat?.params || []" size="small">
            <el-table-column prop="name" label="参数" min-width="100" fixed />
            <el-table-column prop="unit" label="单位" width="80" />
            <el-table-column label="最小值" align="right"><template #default="{ row }"><span class="num">{{ fmtNum(row.min) }}</span></template></el-table-column>
            <el-table-column label="最大值" align="right"><template #default="{ row }"><span class="num">{{ fmtNum(row.max) }}</span></template></el-table-column>
            <el-table-column label="平均值" align="right"><template #default="{ row }"><span class="num">{{ fmtNum(row.avg, 3) }}</span></template></el-table-column>
            <el-table-column label="首值" align="right"><template #default="{ row }"><span class="num">{{ fmtNum(row.first) }}</span></template></el-table-column>
            <el-table-column label="末值" align="right"><template #default="{ row }"><span class="num">{{ fmtNum(row.last) }}</span></template></el-table-column>
            <el-table-column label="变化量" align="right"><template #default="{ row }"><span class="num">{{ row.change > 0 ? '+' : '' }}{{ fmtNum(row.change) }}</span></template></el-table-column>
            <el-table-column label="数据点" align="right" prop="count" />
            <el-table-column label="报警范围" min-width="120"><template #default="{ row }">{{ row.low != null ? `${row.low} ~ ${row.high}` : '-' }}</template></el-table-column>
            <el-table-column label="低于下限" align="right"><template #default="{ row }">{{ row.belowCount ?? '-' }}</template></el-table-column>
            <el-table-column label="高于上限" align="right"><template #default="{ row }">{{ row.aboveCount ?? '-' }}</template></el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 数据记录 -->
      <el-tab-pane label="数据记录" name="data" lazy>
        <div class="filters">
          <RangePicker v-model="range" />
          <el-button :icon="Download" @click="exportCsv">导出 CSV</el-button>
        </div>
        <div class="card">
          <el-table :data="rd.items" size="small" v-loading="rdLoading">
            <el-table-column label="采集时间" width="170" fixed><template #default="{ row }">{{ fmtSec(row.ts) }}</template></el-table-column>
            <el-table-column v-for="p in tableParams" :key="p.key" :label="`${p.name}${p.unit && p.kind === 'num' ? ' (' + p.unit + ')' : ''}`" min-width="110" align="right">
              <template #default="{ row }"><span class="num">{{ fmtParam(p, row.values[p.key]) }}</span></template>
            </el-table-column>
            <el-table-column label="报警" width="80"><template #default="{ row }">{{ row.alarmRaw ? hex(row.alarmRaw) : '' }}</template></el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination v-model:current-page="rdQ.page" v-model:page-size="rdQ.size" :total="rd.total" :page-sizes="[50, 100, 200]" layout="total, sizes, prev, pager, next" @change="loadReadings" />
          </div>
        </div>
      </el-tab-pane>

      <!-- 报警 -->
      <el-tab-pane name="alarms" lazy>
        <template #label>报警记录 <el-badge v-if="openAlarms" :value="openAlarms" class="tb" /></template>
        <AlarmTable :device-id="dev.id" />
      </el-tab-pane>

      <!-- 报文 -->
      <el-tab-pane label="原始报文" name="frames" lazy>
        <FrameTable :device-id="dev.id" />
      </el-tab-pane>

      <!-- 下行命令 -->
      <el-tab-pane label="下行命令" name="commands" lazy>
        <div class="card">
          <el-alert type="info" :closable="false" show-icon class="mb">
            命令会在设备下次上报时随应答下发（TCP / UDP / MQTT）。电信 AEP / 移动 OneNET 接入的设备需通过运营商平台 API 缓存下发。
            参数设置数据单元的具体格式请参考《远程配置协议》。
          </el-alert>
          <div class="filters">
            <el-input v-model="cmdHex" placeholder="参数设置数据单元（十六进制），例如 ff00" class="mono" style="width: 320px" clearable />
            <el-input v-model="cmdNote" placeholder="备注" style="width: 180px" clearable />
            <el-button type="primary" @click="addCmd()">加入下发队列</el-button>
            <el-button @click="addCmd('readAll')">读取所有配置</el-button>
          </div>
          <el-table :data="cmds" size="small" empty-text="暂无命令">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column label="参数单元" min-width="160"><template #default="{ row }"><span class="mono break">{{ row.params }}</span></template></el-table-column>
            <el-table-column prop="note" label="备注" />
            <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag size="small" :type="cmdStatus[row.status][1]">{{ cmdStatus[row.status][0] }}</el-tag></template></el-table-column>
            <el-table-column label="创建 / 下发 / 应答" min-width="200">
              <template #default="{ row }"><div class="small">{{ fmtTime(row.createdAt) }}</div><div class="small muted" v-if="row.sentAt">下发 {{ fmtTime(row.sentAt) }} · {{ row.sentVia }}</div><div class="small muted" v-if="row.ackAt">应答 {{ fmtTime(row.ackAt) }}</div></template>
            </el-table-column>
            <el-table-column label="设备应答内容" min-width="140"><template #default="{ row }"><span class="mono break">{{ row.ackParams || '' }}</span></template></el-table-column>
            <el-table-column label="操作" width="80"><template #default="{ row }"><el-button v-if="row.status === 'pending'" link type="danger" @click="cancelCmd(row.id)">取消</el-button></template></el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <DeviceEditDialog ref="editDlg" @saved="loadDevice" />
  </div>
  <div v-else-if="notFound" class="page"><el-empty description="设备不存在"><el-button @click="$router.push('/devices')">返回设备列表</el-button></el-empty></div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Edit, Refresh, Download } from '@element-plus/icons-vue';
import VChart from '../components/VChart.vue';
import StatTile from '../components/StatTile.vue';
import DeviceStatus from '../components/DeviceStatus.vue';
import BatterySignal from '../components/BatterySignal.vue';
import BitChannels from '../components/BitChannels.vue';
import RangePicker from '../components/RangePicker.vue';
import AlarmTable from '../components/AlarmTable.vue';
import FrameTable from '../components/FrameTable.vue';
import DeviceEditDialog from '../components/DeviceEditDialog.vue';
import { api, loadTypes } from '../api.js';
import { fmtTime, fmtSec, fmtAgo, fmtDuration, fmtParam, fmtNum, fmtPct, hex, closedChannels, TRANSPORT } from '../utils/format.js';
import { timeLine } from '../utils/charts.js';
import { isDark, pal } from '../utils/theme.js';
import { onStream, debounce } from '../utils/stream.js';

const route = useRoute();
const id = route.params.id;
const dev = ref(null);
const notFound = ref(false);
const def = ref(null);
const tab = ref(route.query.tab || 'realtime');
const editDlg = ref(null);
const now = Math.floor(Date.now() / 1000);
const range = ref([now - 86400, now]);

async function loadDevice() {
  try {
    dev.value = await api.device(id);
  } catch {
    notFound.value = true;
    return;
  }
  const types = await loadTypes();
  def.value = types.get(dev.value.typeCode) || null;
}

// ---------- 实时 ----------
const allParams = computed(() => {
  if (def.value?.params?.length) return def.value.params;
  return Object.keys(dev.value?.realtime || {}).filter((k) => k !== '_modbus').map((k) => ({ key: k, name: k, unit: '', kind: 'num', type: 'i16', scale: 1, chart: true }));
});
const paramCards = computed(() => allParams.value.filter((p) => p.key !== 'reserved' && dev.value.realtime[p.key] !== undefined).map((p) => {
  const v = dev.value.realtime[p.key];
  const th = dev.value.alarmParams.find((a) => a.key === p.key && a.low != null && a.high != null && a.high > a.low);
  let state = '';
  if (th && p.kind === 'num') {
    if (v < th.low) state = '低于报警下限';
    else if (v > th.high) state = '高于报警上限';
  }
  return { ...p, value: v, text: fmtParam(p, v), unit: p.kind === 'num' ? p.unit : '', th, state };
}));

// ---------- 曲线 ----------
const chartParams = computed(() => allParams.value.filter((p) => p.chart !== false && p.kind === 'num'));
const chartKeys = ref([]);
watch(chartParams, (ps) => { if (!chartKeys.value.length) chartKeys.value = ps.slice(0, 4).map((p) => p.key); }, { immediate: true });
const bucket = ref('auto');
const series = ref(null);
const bucketText = (b) => (b >= 86400 ? `${b / 86400} 天` : b >= 3600 ? `${b / 3600} 小时` : `${b / 60} 分钟`);

async function loadSeries() {
  if (!chartKeys.value.length) { series.value = null; return; }
  series.value = await api.series(id, { params: chartKeys.value.join(','), from: range.value[0], to: range.value[1], bucket: bucket.value });
}
/** 不同单位的参数分开绘制（不使用双 y 轴） */
const chartGroups = computed(() => {
  if (!series.value) return [];
  void isDark.value;
  const groups = new Map();
  for (const k of series.value.keys) {
    const p = chartParams.value.find((x) => x.key === k);
    if (!p) continue;
    const u = p.unit || '-';
    if (!groups.has(u)) groups.set(u, []);
    groups.get(u).push(p);
  }
  const colors = pal().series;
  let ci = 0;
  return [...groups.entries()].map(([unit, params]) => {
    const th = params.length === 1 ? dev.value.alarmParams.find((a) => a.key === params[0].key && a.high > a.low) : null;
    return {
      unit, params,
      option: timeLine({
        series: params.map((p) => ({ name: p.name, color: colors[ci++ % colors.length], data: series.value.points.map((pt) => [pt.ts * 1000, pt[p.key]]) })),
        unit: unit === '-' ? '' : unit,
        zoom: true,
        scale: true,
        area: params.length === 1,
        markLines: th ? [{ name: '下限', value: th.low }, { name: '上限', value: th.high }] : [],
      }),
    };
  });
});

// ---------- 统计 ----------
const stat = ref(null);
const alarmCountInRange = ref(0);
async function loadStats() {
  const [s, a] = await Promise.all([
    api.deviceStats(id, { from: range.value[0], to: range.value[1] }),
    api.alarms({ deviceId: id, from: range.value[0], to: range.value[1], size: 1 }),
  ]);
  stat.value = s;
  alarmCountInRange.value = a.total;
}

// ---------- 数据记录 ----------
const tableParams = computed(() => allParams.value.filter((p) => p.key !== 'reserved'));
const rd = ref({ total: 0, items: [] });
const rdQ = reactive({ page: 1, size: 50 });
const rdLoading = ref(false);
async function loadReadings() {
  rdLoading.value = true;
  try { rd.value = await api.readings(id, { ...rdQ, from: range.value[0], to: range.value[1] }); } finally { rdLoading.value = false; }
}
function exportCsv() {
  window.open(api.exportUrl(id, { from: range.value[0], to: range.value[1] }), '_blank');
}

// ---------- 报警数 ----------
const openAlarms = ref(0);
async function loadOpenAlarms() {
  openAlarms.value = (await api.alarms({ deviceId: id, status: 'open', size: 1 })).total;
}

// ---------- 命令 ----------
const cmds = ref([]);
const cmdHex = ref('');
const cmdNote = ref('');
const cmdStatus = { pending: ['待下发', 'warning'], sent: ['已下发', 'primary'], acked: ['已应答', 'success'], cancelled: ['已取消', 'info'] };
async function loadCmds() { cmds.value = await api.commands(id); }
async function addCmd(preset) {
  const body = preset ? { preset, note: '读取所有配置' } : { params: cmdHex.value, note: cmdNote.value };
  const r = await api.addCommand(id, body);
  ElMessage.success(`已加入队列，下行帧预览：${r.preview}`);
  cmdHex.value = '';
  cmdNote.value = '';
  loadCmds();
}
async function cancelCmd(cid) { await api.cancelCommand(cid); loadCmds(); }

function loadTab() {
  if (tab.value === 'chart') loadSeries();
  else if (tab.value === 'stats') loadStats();
  else if (tab.value === 'data') loadReadings();
  else if (tab.value === 'commands') loadCmds();
}
watch(tab, loadTab);
watch(range, () => { rdQ.page = 1; loadTab(); });
watch([chartKeys, bucket], () => tab.value === 'chart' && loadSeries());

onStream('frame', debounce((f) => { if (f.deviceId === id) { loadDevice(); loadTab(); } }, 1000));
onStream('alarm', (a) => { if (a.deviceId === id) loadOpenAlarms(); });
onStream('command', (c) => { if (c.deviceId === id && tab.value === 'commands') loadCmds(); });

onMounted(async () => {
  await loadDevice();
  loadOpenAlarms();
  loadTab();
});
</script>

<style scoped>
.st { font-size: 14px; font-weight: 400; margin-left: 8px; }
.tabs :deep(.el-tabs__header) { margin-bottom: 16px; }
.grid.params { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.pcard { padding: 14px 16px; }
.pcard.over { border-color: var(--critical); }
.pname { font-size: 13px; color: var(--ink-2); }
.pval { font-size: 28px; font-weight: 600; margin: 6px 0 4px; }
.unit { font-size: 13px; font-weight: 400; color: var(--ink-2); margin-left: 4px; }
.over-txt { color: var(--critical); font-size: 13px; margin-top: 4px; }
.small { font-size: 12px; }
.mt8 { margin-top: 8px; }
.mr4 { margin-right: 4px; }
.mb { margin-bottom: 12px; }
.tb { margin-left: 4px; }
.tb :deep(.el-badge__content) { position: static; transform: none; }
</style>
