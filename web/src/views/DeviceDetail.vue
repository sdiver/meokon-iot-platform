<template>
  <div class="page detail" v-if="dev">
    <!-- 设备头部 -->
    <div class="card head">
      <div class="photo" :class="{ empty: !dev.photo }" @click="pickPhoto" role="button" tabindex="0" :aria-label="dev.photo ? '更换设备照片' : '上传设备照片'" @keydown.enter="pickPhoto">
        <img v-if="dev.photo" :src="withToken(dev.photo)" alt="设备照片" />
        <template v-else><el-icon :size="30"><Picture /></el-icon><span>上传照片</span></template>
        <div v-if="dev.photo" class="photo-mask"><el-icon><Camera /></el-icon>更换</div>
        <input ref="fileIn" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onPhoto" />
      </div>
      <div class="head-main">
        <div class="head-top">
          <div class="title-row">
            <el-button v-if="!isMobile" link :icon="ArrowLeft" class="back" @click="$router.back()" aria-label="返回" />
            <h2>{{ dev.name || dev.id }}</h2>
            <DeviceStatus :status="dev.status" />
            <span v-if="dev.status === 'alarm'" class="st-tag critical">{{ dev.alarm.bits.map((b) => b.label).join('、') }}</span>
            <span class="batt-chip"><BatterySignal :battery="dev.battery" :signal="dev.signal" :show-signal="false" /></span>
          </div>
          <div class="head-actions">
            <span class="muted small">最后上报：{{ dev.lastSeen ? fmtTime(dev.lastSeen) : '尚未上报' }}</span>
            <el-button :icon="Edit" @click="editDlg.open(dev)">编辑档案</el-button>
          </div>
        </div>
        <div class="addr" v-if="dev.location || dev.lat != null">
          <el-icon><Location /></el-icon>
          <span>{{ dev.location || '未填写安装位置' }}</span>
          <a v-if="dev.lat != null" class="link" @click="$router.push({ path: '/devices/map', query: { focus: dev.id } })">在地图中查看</a>
        </div>
        <dl class="info">
          <div v-for="f in infoFields" :key="f.label"><dt>{{ f.label }}</dt><dd :class="{ mono: f.mono }">{{ f.value || '-' }}</dd></div>
          <div>
            <dt>告警推送</dt>
            <dd><el-switch :model-value="dev.alarmPush" size="small" @change="togglePush" /> <span class="muted small">{{ dev.alarmPush ? '开' : '关' }}</span></dd>
          </div>
        </dl>
      </div>
    </div>

    <!-- 实时数据 -->
    <div class="card mt">
      <div class="sec-title">实时数据<span class="hint">{{ dev.lastSeen ? `更新于 ${fmtTime(dev.lastSeen)}（设备采集时间 ${fmtSec(dev.lastUtc)}）` : '等待设备首次上报' }}</span></div>
      <div v-if="paramCards.length" class="params">
        <div v-for="p in paramCards" :key="p.key" class="pcard" :class="{ over: p.state }">
          <div class="pname">{{ p.name }}</div>
          <template v-if="p.kind === 'bits'">
            <BitChannels :value="p.value" :n="p.bits" class="mt8" />
            <div class="muted small mt8">闭合 {{ closedChannels(p.value, p.bits).length }} / {{ p.bits }}</div>
          </template>
          <template v-else>
            <div class="pval num">{{ p.text }}<span class="unit">{{ p.unit }}</span></div>
            <div v-if="p.th" class="prange">
              <span class="muted small">{{ p.th.low }}</span>
              <span class="rbar"><span class="rmark" :style="{ left: rangePos(p) + '%' }" :class="{ bad: p.state }" /></span>
              <span class="muted small">{{ p.th.high }}</span>
            </div>
            <div v-if="p.state" class="over-txt"><span class="dot critical" />{{ p.state }}</div>
          </template>
        </div>
      </div>
      <el-empty v-else description="暂无实时数据" :image-size="60" />
    </div>

    <!-- 标签页 -->
    <div class="card mt tabs-card">
      <el-tabs v-model="tab">
        <el-tab-pane label="采集数据" name="data">
          <div class="filters">
            <el-radio-group v-model="dataView" size="default">
              <el-radio-button value="table"><el-icon><List /></el-icon> 列表</el-radio-button>
              <el-radio-button value="chart"><el-icon><TrendCharts /></el-icon> 曲线</el-radio-button>
            </el-radio-group>
            <RangePicker v-model="range" />
            <template v-if="dataView === 'chart'">
              <el-select v-model="chartKeys" multiple collapse-tags collapse-tags-tooltip placeholder="选择参数" style="width: 220px">
                <el-option v-for="p in chartParams" :key="p.key" :label="`${p.name}${p.unit ? ' (' + p.unit + ')' : ''}`" :value="p.key" />
              </el-select>
              <el-select v-model="bucket" style="width: 120px">
                <el-option label="自动聚合" value="auto" />
                <el-option label="原始数据" :value="0" />
                <el-option label="10 分钟" :value="600" />
                <el-option label="1 小时" :value="3600" />
                <el-option label="1 天" :value="86400" />
              </el-select>
            </template>
            <el-button :icon="Download" @click="exportCsv">导出</el-button>
          </div>
          <template v-if="dataView === 'table'">
            <el-table :data="rd.items" size="small" v-loading="rdLoading" empty-text="该时间段内没有数据">
              <el-table-column label="采集时间" width="170" fixed><template #default="{ row }">{{ fmtSec(row.ts) }}</template></el-table-column>
              <el-table-column v-for="p in tableParams" :key="p.key" :label="`${p.name}${p.unit && p.kind === 'num' ? ' (' + p.unit + ')' : ''}`" min-width="110" align="right">
                <template #default="{ row }"><span class="num">{{ fmtParam(p, row.values[p.key]) }}</span></template>
              </el-table-column>
              <el-table-column label="报警" width="80"><template #default="{ row }">{{ row.alarmRaw ? hex(row.alarmRaw) : '' }}</template></el-table-column>
            </el-table>
            <div class="pager">
              <el-pagination v-model:current-page="rdQ.page" v-model:page-size="rdQ.size" :total="rd.total" :page-sizes="[50, 100, 200]" :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next'" :pager-count="isMobile ? 5 : 7" :size="isMobile ? 'small' : 'default'" @change="loadReadings" />
            </div>
          </template>
          <template v-else>
            <div class="muted small" v-if="series">{{ series.bucket ? `按 ${bucketText(series.bucket)} 聚合平均值` : '原始采集点' }} · {{ series.points.length }} 个点</div>
            <div v-if="!chartParams.length" class="muted">该设备类型没有可绘制曲线的数值参数</div>
            <div class="grid" :class="chartGroups.length > 1 ? 'c2' : ''">
              <div v-for="g in chartGroups" :key="g.unit" class="chart-box">
                <div class="sec-title">{{ g.params.map((p) => p.name).join(' / ') }}<span class="hint">{{ g.unit }}</span></div>
                <VChart :option="g.option" :height="isMobile ? 240 : 300" :label="g.params.map((p) => p.name).join('、') + '历史曲线'" />
              </div>
            </div>
          </template>
        </el-tab-pane>

        <el-tab-pane label="统计分析" name="stats" lazy>
          <div class="filters"><RangePicker v-model="range" /></div>
          <div class="grid tiles" v-if="stat">
            <StatTile label="采集数据" :value="stat.count" unit="条" />
            <StatTile label="数据完整率" :value="stat.completeness == null ? '-' : fmtPct(stat.completeness)" :sub="`按 ${dev.interval || '-'} 秒间隔估算`" />
            <StatTile label="首条数据" :value="stat.firstTs ? fmtSec(stat.firstTs).slice(5, 16) : '-'" />
            <StatTile label="末条数据" :value="stat.lastTs ? fmtSec(stat.lastTs).slice(5, 16) : '-'" />
            <StatTile label="期间报警" :value="alarmCountInRange" unit="次" />
          </div>
          <el-table :data="stat?.params || []" size="small" class="mt">
            <el-table-column prop="name" label="参数" min-width="100" fixed />
            <el-table-column prop="unit" label="单位" width="80" />
            <el-table-column label="最小值" align="right"><template #default="{ row }"><span class="num">{{ fmtNum(row.min) }}</span></template></el-table-column>
            <el-table-column label="最大值" align="right"><template #default="{ row }"><span class="num">{{ fmtNum(row.max) }}</span></template></el-table-column>
            <el-table-column label="平均值" align="right"><template #default="{ row }"><span class="num">{{ fmtNum(row.avg, 3) }}</span></template></el-table-column>
            <el-table-column label="变化量" align="right"><template #default="{ row }"><span class="num">{{ row.change > 0 ? '+' : '' }}{{ fmtNum(row.change) }}</span></template></el-table-column>
            <el-table-column label="数据点" align="right" prop="count" />
            <el-table-column label="报警范围" min-width="110"><template #default="{ row }">{{ row.low != null ? `${row.low} ~ ${row.high}` : '-' }}</template></el-table-column>
            <el-table-column label="低于下限" align="right"><template #default="{ row }">{{ row.belowCount ?? '-' }}</template></el-table-column>
            <el-table-column label="高于上限" align="right"><template #default="{ row }">{{ row.aboveCount ?? '-' }}</template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="关于设备" name="about" lazy>
          <dl class="kv-grid">
            <div v-for="f in aboutFields" :key="f.label"><dt>{{ f.label }}</dt><dd :class="{ mono: f.mono }">{{ f.value ?? '-' }}</dd></div>
          </dl>
          <template v-if="dev.alarmParams.length">
            <div class="sec-title mt">报警设置参数<span class="hint">设备上报的报警上下限</span></div>
            <el-table :data="dev.alarmParams" size="small" border>
              <el-table-column prop="group" label="组" width="60" />
              <el-table-column prop="name" label="参数" />
              <el-table-column label="报警下限"><template #default="{ row }">{{ row.low ?? row.value }} {{ row.unit }}</template></el-table-column>
              <el-table-column label="报警上限"><template #default="{ row }">{{ row.high ?? '-' }} {{ row.high != null ? row.unit : '' }}</template></el-table-column>
            </el-table>
          </template>
        </el-tab-pane>

        <el-tab-pane label="运行信息" name="runtime" lazy>
          <div v-if="rt" class="rt-grid">
            <div v-for="f in runtimeFields" :key="f.label" class="rt-item">
              <div class="rt-label">{{ f.label }}</div>
              <div class="rt-val num" :class="f.cls">{{ f.value }}</div>
              <div v-if="f.sub" class="rt-sub">{{ f.sub }}</div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane name="alarms" lazy>
          <template #label>告警历史<span v-if="pendingAlarms" class="tab-badge">{{ pendingAlarms }}</span></template>
          <AlarmTable :device-id="dev.id" compact @changed="loadPending" />
        </el-tab-pane>

        <el-tab-pane label="设备轨迹" name="track" lazy>
          <div class="track">
            <el-scrollbar class="track-list" :height="isMobile ? 'auto' : 420">
              <el-timeline v-if="locs.length">
                <el-timeline-item v-for="(l, i) in locs" :key="l.ts" :timestamp="fmtTime(l.ts)" :type="i === 0 ? 'primary' : ''" :hollow="i !== 0">
                  <div>{{ l.address || '未填写地址' }}</div>
                  <div class="muted small mono">{{ l.lng.toFixed(6) }}, {{ l.lat.toFixed(6) }} · {{ l.source === 'gps' ? '设备定位' : '人工设置' }}</div>
                </el-timeline-item>
              </el-timeline>
              <el-empty v-else description="暂无位置记录" :image-size="60" />
            </el-scrollbar>
            <DeviceMap class="track-map" :devices="[dev]" :types="typesMap" :track="locs" :height="isMobile ? 300 : 420" :legend="false" :popup="false" />
          </div>
        </el-tab-pane>

        <el-tab-pane label="维保记录" name="maint" lazy>
          <div class="filters"><el-button type="primary" :icon="Plus" @click="maintDlg.open({ deviceId: dev.id })">登记维保</el-button></div>
          <el-table :data="maints" size="small" empty-text="暂无维保记录">
            <el-table-column label="维保时间" width="170"><template #default="{ row }">{{ fmtTime(row.ts) }}</template></el-table-column>
            <el-table-column prop="type" label="类型" width="110" />
            <el-table-column label="原值 → 新值" min-width="240"><template #default="{ row }"><span class="mono">{{ row.oldValue || '-' }}</span> → <span class="mono">{{ row.newValue || '-' }}</span></template></el-table-column>
            <el-table-column prop="note" label="说明" min-width="160" />
            <el-table-column label="来源" width="100"><template #default="{ row }">{{ row.auto ? '自动识别' : '人工登记' }}</template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="原始报文" name="frames" lazy>
          <FrameTable :device-id="dev.id" flat />
        </el-tab-pane>

        <el-tab-pane label="下行命令" name="commands" lazy>
          <el-alert type="info" :closable="false" show-icon class="mb">
            命令在设备下次上报时随应答下发（TCP / UDP / MQTT）。电信 AEP / 移动 OneNET 接入的设备需通过运营商平台缓存下发。
          </el-alert>
          <div class="filters">
            <el-input v-model="cmdHex" placeholder="参数设置数据单元（十六进制），如 ff00" class="mono" style="width: 300px" clearable />
            <el-input v-model="cmdNote" placeholder="备注" style="width: 160px" clearable />
            <el-button type="primary" @click="addCmd()">加入下发队列</el-button>
            <el-button @click="addCmd('readAll')">读取所有配置</el-button>
          </div>
          <CommandTable :items="cmds" @changed="loadCmds" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <DeviceEditDialog ref="editDlg" @saved="loadDevice" />
    <MaintenanceDialog ref="maintDlg" @saved="loadMaint" />
  </div>
  <div v-else-if="notFound" class="page"><el-empty description="设备不存在"><el-button @click="$router.push('/devices')">返回设备列表</el-button></el-empty></div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Edit, Download, Location, Picture, Camera, List, TrendCharts, Plus } from '@element-plus/icons-vue';
import VChart from '../components/VChart.vue';
import StatTile from '../components/StatTile.vue';
import DeviceStatus from '../components/DeviceStatus.vue';
import BatterySignal from '../components/BatterySignal.vue';
import BitChannels from '../components/BitChannels.vue';
import RangePicker from '../components/RangePicker.vue';
import AlarmTable from '../components/AlarmTable.vue';
import FrameTable from '../components/FrameTable.vue';
import CommandTable from '../components/CommandTable.vue';
import DeviceMap from '../components/DeviceMap.vue';
import DeviceEditDialog from '../components/DeviceEditDialog.vue';
import MaintenanceDialog from '../components/MaintenanceDialog.vue';
import { api, loadTypes, withToken } from '../api.js';
import { fmtTime, fmtSec, fmtDuration, fmtParam, fmtNum, fmtPct, hex, closedChannels, TRANSPORT, signalLevel } from '../utils/format.js';
import { timeLine } from '../utils/charts.js';
import { isDark, pal } from '../utils/theme.js';
import { onStream, debounce } from '../utils/stream.js';
import { isMobile } from '../utils/responsive.js';

const route = useRoute();
const id = route.params.id;
const dev = ref(null);
const notFound = ref(false);
const def = ref(null);
const typesMap = ref(new Map());
const tab = ref({ realtime: 'data', chart: 'data' }[route.query.tab] || route.query.tab || 'data');
const dataView = ref(route.query.tab === 'chart' ? 'chart' : 'table');
const editDlg = ref(null);
const maintDlg = ref(null);
const fileIn = ref(null);
const now = Math.floor(Date.now() / 1000);
const range = ref([now - 86400, now]);

async function loadDevice() {
  try {
    dev.value = await api.device(id);
  } catch {
    notFound.value = true;
    return;
  }
  typesMap.value = await loadTypes();
  def.value = typesMap.value.get(dev.value.typeCode) || null;
}

// ---------- 头部 ----------
const infoFields = computed(() => {
  const d = dev.value;
  return [
    { label: '设备编号', value: d.id, mono: true },
    { label: '产品型号', value: d.model },
    { label: '产品别名', value: d.alias || d.typeName },
    { label: '设备类型', value: d.typeName ? `${d.typeName}（${d.typeCode}）` : null },
    { label: '项目名称', value: d.project },
    { label: '设备分组', value: d.groupName },
    { label: '设备负责人', value: d.owner },
    { label: '联系方式', value: d.contact },
    { label: '资产编号', value: d.assetNo },
    { label: 'WGS84 坐标', value: d.lat != null ? `${d.lng.toFixed(6)}, ${d.lat.toFixed(6)}` : null, mono: true },
    { label: '接入方式', value: TRANSPORT[d.transport] || d.transport },
  ];
});
async function togglePush(v) {
  dev.value = await api.updateDevice(id, { alarmPush: v });
  ElMessage.success(v ? '已开启告警推送' : '已关闭告警推送');
}
function pickPhoto() { fileIn.value?.click(); }
async function onPhoto(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) return ElMessage.error('图片不能超过 5MB');
  const dataUrl = await resizeImage(f, 1200);
  dev.value = await api.uploadPhoto(id, dataUrl);
  ElMessage.success('照片已更新');
}
/** 前端压缩，长边不超过 max 像素 */
function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
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
/** 当前值在报警范围条上的位置（两端各留 10% 表示越限） */
const rangePos = (p) => {
  const { low, high } = p.th;
  const r = (p.value - low) / (high - low);
  return Math.max(0, Math.min(100, 10 + r * 80));
};

// ---------- 采集数据 / 曲线 ----------
const tableParams = computed(() => allParams.value.filter((p) => p.key !== 'reserved'));
const rd = ref({ total: 0, items: [] });
const rdQ = reactive({ page: 1, size: 50 });
const rdLoading = ref(false);
async function loadReadings() {
  rdLoading.value = true;
  try { rd.value = await api.readings(id, { ...rdQ, from: range.value[0], to: range.value[1] }); } finally { rdLoading.value = false; }
}
function exportCsv() { window.open(api.exportUrl(id, { from: range.value[0], to: range.value[1] }), '_blank'); }

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
        unit: unit === '-' ? '' : unit, zoom: true, scale: true, area: params.length === 1,
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

// ---------- 关于设备 / 运行信息 ----------
const aboutFields = computed(() => {
  const d = dev.value;
  return [
    { label: '节点类型', value: '直连设备' },
    { label: '设备类型', value: d.typeName ? `${d.typeName}（类型 ${d.typeCode}）` : '未知' },
    { label: '设备类别', value: d.category },
    { label: '供电方式', value: d.battery.mode },
    { label: '当前供电', value: d.battery.source },
    { label: '通讯类型', value: d.commType || (TRANSPORT[d.transport] ?? d.transport) },
    { label: '硬件版本', value: d.hwVersion },
    { label: '软件版本', value: d.swVersion },
    { label: 'IMEI', value: d.imei, mono: true },
    { label: 'ICCID', value: d.iccid, mono: true },
    { label: '采集间隔', value: d.interval ? `${d.interval} 秒` : null },
    { label: '每次上报条数', value: d.recordCount != null ? `${d.recordCount} 条缓存数据` : null },
    { label: '创建时间', value: d.createdAt ? fmtTime(d.createdAt) : null },
    { label: '首次上报', value: d.firstSeen ? fmtTime(d.firstSeen) : '尚未上报' },
    { label: '离线判定', value: `超过 ${fmtDuration(d.offlineAfter * 1000)} 未上报` },
    { label: '备注', value: d.remark },
  ];
});
const rt = ref(null);
async function loadRuntime() { rt.value = await api.runtime(id); }
const runtimeFields = computed(() => {
  const r = rt.value;
  if (!r) return [];
  const sig = signalLevel(r.signal);
  return [
    { label: '电池电量', value: r.battery.source === '外供电' ? '外供电' : r.battery.level != null ? `${r.battery.level}%` : '-', cls: r.battery.level != null && r.battery.level <= 20 && r.battery.source === '电池' ? 'crit' : '' },
    { label: '信号强度', value: r.signal != null ? `${r.signal} dBm` : '-', sub: sig.text !== '-' ? `信号${sig.text}` : '' },
    { label: '历史最低信号', value: r.minSignal != null ? `${r.minSignal} dBm` : '-' },
    { label: '总上发次数', value: r.uploads.toLocaleString(), sub: `成功 ${r.uploadsOk.toLocaleString()} 次` },
    { label: '上发成功率', value: r.successRate == null ? '-' : fmtPct(r.successRate), cls: r.successRate != null && r.successRate < 0.95 ? 'crit' : '' },
    { label: '平台下行次数', value: r.downlinks.toLocaleString() },
    { label: '平均上报间隔', value: r.avgUploadSec ? fmtDuration(r.avgUploadSec * 1000) : '-', sub: r.expectedUploadSec ? `理论 ${fmtDuration(r.expectedUploadSec * 1000)}` : '' },
    { label: '采集数据', value: `${r.readings.toLocaleString()} 条` },
    { label: '运行时长', value: r.runDays == null ? '-' : r.runDays >= 1 ? `${Math.floor(r.runDays)} 天` : fmtDuration(r.runDays * 86400000), sub: r.firstUpload ? `自 ${fmtTime(r.firstUpload).slice(0, 10)}` : '' },
    { label: '累计告警', value: `${r.alarms} 次`, sub: r.pendingAlarms ? `${r.pendingAlarms} 条未处理` : '无未处理', cls: r.pendingAlarms ? 'crit' : '' },
    { label: '最后上报', value: r.lastUpload ? fmtTime(r.lastUpload) : '-', sub: r.lastUtc ? `设备时间 ${fmtSec(r.lastUtc)}` : '' },
    { label: '连接地址', value: r.remote || '-' },
  ];
});

// ---------- 轨迹 / 维保 / 命令 ----------
const locs = ref([]);
async function loadLocs() { locs.value = await api.locations(id); }
const maints = ref([]);
async function loadMaint() { maints.value = (await api.maintenance({ deviceId: id, size: 200 })).items.filter((m) => m.deviceId === id); }
const cmds = ref([]);
const cmdHex = ref('');
const cmdNote = ref('');
async function loadCmds() { cmds.value = await api.commands(id); }
async function addCmd(preset) {
  const body = preset ? { preset, note: '读取所有配置' } : { params: cmdHex.value, note: cmdNote.value };
  const r = await api.addCommand(id, body);
  ElMessage.success(`已加入队列，下行帧预览：${r.preview}`);
  cmdHex.value = '';
  cmdNote.value = '';
  loadCmds();
}

const pendingAlarms = ref(0);
async function loadPending() { pendingAlarms.value = (await api.alarms({ deviceId: id, handle: 0, size: 1 })).total; }

function loadTab() {
  if (tab.value === 'data') (dataView.value === 'chart' ? loadSeries : loadReadings)();
  else if (tab.value === 'stats') loadStats();
  else if (tab.value === 'runtime') loadRuntime();
  else if (tab.value === 'track') loadLocs();
  else if (tab.value === 'maint') loadMaint();
  else if (tab.value === 'commands') loadCmds();
}
watch([tab, dataView], loadTab);
watch(range, () => { rdQ.page = 1; loadTab(); });
watch([chartKeys, bucket], () => tab.value === 'data' && dataView.value === 'chart' && loadSeries());

onStream('frame', debounce((f) => { if (f.deviceId === id) { loadDevice(); loadTab(); } }, 1000));
onStream('alarm', (a) => { if (!a.deviceId || a.deviceId === id) loadPending(); });
onStream('command', (c) => { if (c.deviceId === id && tab.value === 'commands') loadCmds(); });

onMounted(async () => {
  await loadDevice();
  loadPending();
  loadTab();
});
</script>

<style scoped>
.head { display: flex; gap: 20px; padding: 20px; }
.photo {
  position: relative; flex: none; width: 150px; height: 150px; border-radius: 12px; overflow: hidden; cursor: pointer;
  background: var(--page-bg); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--ink-3); font-size: 12px;
}
.photo.empty { border: 1.5px dashed var(--hair-strong); }
.photo img { width: 100%; height: 100%; object-fit: cover; }
.photo-mask { position: absolute; inset: auto 0 0 0; height: 30px; display: flex; align-items: center; justify-content: center; gap: 4px; background: rgba(0, 0, 0, 0.5); color: #fff; opacity: 0; transition: opacity 0.15s; }
.photo:hover .photo-mask { opacity: 1; }
.head-main { flex: 1; min-width: 0; }
.head-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.title-row h2 { margin: 0; font-size: 22px; font-weight: 700; }
.back { margin-right: -4px; }
.batt-chip { font-size: 13px; }
.head-actions { display: flex; align-items: center; gap: 12px; }
.addr { display: flex; align-items: center; gap: 6px; margin: 10px 0 4px; color: var(--accent); font-size: 14px; }
.addr .link { font-size: 12px; margin-left: 6px; }
.info { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 24px; margin: 14px 0 0; }
.info > div, .kv-grid > div { display: flex; gap: 12px; min-width: 0; font-size: 13px; align-items: center; }
.info dt, .kv-grid dt { color: var(--ink-2); flex: none; width: 84px; white-space: nowrap; }
.info dd, .kv-grid dd { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kv-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px 24px; margin: 4px 0 0; }
.kv-grid dt { width: 96px; }
.small { font-size: 12px; }

.params { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.pcard { padding: 14px 16px; border-radius: 12px; background: var(--page-bg); border: 1px solid transparent; }
.pcard.over { border-color: var(--critical); background: rgba(220, 60, 61, 0.05); }
.pname { font-size: 13px; color: var(--ink-2); }
.pval { font-size: 28px; font-weight: 700; margin: 4px 0 8px; }
.unit { font-size: 13px; font-weight: 400; color: var(--ink-2); margin-left: 4px; }
.prange { display: flex; align-items: center; gap: 6px; }
.rbar { position: relative; flex: 1; height: 6px; border-radius: 3px; background: linear-gradient(90deg, rgba(220, 60, 61, 0.35) 0 10%, rgba(10, 172, 35, 0.3) 10% 90%, rgba(220, 60, 61, 0.35) 90%); }
.rmark { position: absolute; top: -3px; width: 4px; height: 12px; margin-left: -2px; border-radius: 2px; background: var(--ink); }
.rmark.bad { background: var(--critical); }
.over-txt { color: var(--critical); font-size: 12px; margin-top: 6px; }
.mt8 { margin-top: 8px; }
.mb { margin-bottom: 12px; }
.tabs-card { padding-top: 6px; }
.tabs-card :deep(.el-tabs__header) { margin-bottom: 16px; }
.tab-badge { margin-left: 6px; background: var(--critical); color: #fff; font-size: 11px; padding: 0 6px; border-radius: 8px; line-height: 16px; display: inline-block; }
.chart-box { min-width: 0; margin-top: 12px; }

.rt-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.rt-item { padding: 14px 16px; border-radius: 12px; background: var(--page-bg); min-width: 0; }
.rt-label { font-size: 12px; color: var(--ink-2); }
.rt-val { font-size: 20px; font-weight: 700; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rt-val.crit { color: var(--critical); }
.rt-sub { font-size: 12px; color: var(--ink-3); margin-top: 2px; }

.track { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 16px; }
.track-list { padding-right: 8px; }

@media (max-width: 1100px) {
  .info, .kv-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rt-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
  .head { flex-direction: column; padding: 14px; gap: 12px; }
  .photo { width: 100%; height: 160px; }
  .title-row h2 { font-size: 18px; }
  .info, .kv-grid { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .params { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pval { font-size: 22px; }
  .rt-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .track { grid-template-columns: minmax(0, 1fr); }
}
</style>
