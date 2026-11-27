<template>
  <div class="at">
    <div class="at-tabs">
      <button v-for="t in TABS" :key="t.key" class="at-tab" :class="{ on: q.handle === t.key }" @click="setTab(t.key)">
        {{ t.text }}<span class="cnt num">{{ counts[t.key] ?? '' }}</span>
      </button>
    </div>
    <div class="filters">
      <el-input v-if="!deviceId" v-model="q.keyword" placeholder="设备编号 / 名称 / 位置" clearable :prefix-icon="Search" style="width: 220px" @input="search" />
      <el-select v-model="q.level" placeholder="告警级别" clearable style="width: 120px" @change="reload">
        <el-option label="高" value="high" /><el-option label="中" value="mid" /><el-option label="低" value="low" />
      </el-select>
      <el-select v-model="q.label" placeholder="告警类型" clearable filterable style="width: 160px" @change="reload">
        <el-option v-for="l in LABELS" :key="l" :label="l" :value="l" />
      </el-select>
      <template v-if="showMore || compact">
        <el-select v-model="q.status" placeholder="报警状态" clearable style="width: 120px" @change="reload">
          <el-option label="报警中" value="open" /><el-option label="已恢复" value="closed" />
        </el-select>
        <el-date-picker v-if="!isMobile" v-model="dr" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 250px" @change="reload" />
      </template>
      <el-button v-if="!compact" link type="primary" @click="showMore = !showMore">{{ showMore ? '收起筛选' : '更多筛选' }}</el-button>
      <div class="grow" />
      <template v-if="selected.length && canWrite()">
        <span class="muted small">已选 {{ selected.length }} 条</span>
        <el-button @click="openHandle(selected, 1)">标为已记录</el-button>
        <el-button type="primary" @click="openHandle(selected, 2)">处理</el-button>
      </template>
      <el-button :icon="Download" @click="exportCsv">导出</el-button>
      <el-button :icon="Refresh" @click="load" aria-label="刷新" />
    </div>

    <!-- 手机：卡片 -->
    <div v-if="isMobile" class="m-list" v-loading="loading">
      <div v-for="row in data.items" :key="row.id" class="card m-card m-alarm" :class="`lv-${row.level}`" @click="openView(row)">
        <div class="m-row">
          <span class="lv-badge" :class="row.level">{{ LEVEL[row.level] }}</span>
          <b class="grow">{{ row.label }}</b>
          <span class="st-tag" :class="HANDLE[row.status].cls">{{ HANDLE[row.status].text }}</span>
        </div>
        <div v-if="!deviceId" class="m-sub">{{ row.deviceName || row.deviceId }} · <span class="mono">{{ row.deviceId }}</span></div>
        <div class="m-sub">{{ fmtTime(row.startTs) }} · {{ row.open ? `报警中 ${fmtDuration(row.duration)}` : '已恢复' }}</div>
        <div v-if="row.status < 2 && canWrite()" class="m-ops" @click.stop>
          <el-button v-if="row.status === 0" size="small" @click="openHandle([row], 1)">已记录</el-button>
          <el-button size="small" type="primary" plain @click="openHandle([row], 2)">处理</el-button>
        </div>
      </div>
      <el-empty v-if="!loading && !data.items.length" description="暂无告警" :image-size="60" />
    </div>

    <!-- 桌面：表格 -->
    <el-table v-else :data="data.items" v-loading="loading" @selection-change="(v) => (selected = v)" row-key="id" empty-text="暂无告警">
      <el-table-column v-if="canWrite()" type="selection" width="44" :selectable="(r) => r.status < 2" />
      <el-table-column label="告警编号" min-width="170"><template #default="{ row }"><a class="link mono" @click="openView(row)">{{ row.code }}</a></template></el-table-column>
      <el-table-column v-if="!deviceId" label="设备" min-width="180">
        <template #default="{ row }">
          <div class="cell-2"><a class="link" @click="$router.push(`/devices/${row.deviceId}`)">{{ row.deviceName || row.deviceId }}</a></div>
          <div class="muted small mono">{{ row.deviceId }}</div>
        </template>
      </el-table-column>
      <el-table-column label="告警类型" min-width="150">
        <template #default="{ row }"><span class="lv-badge" :class="row.level">{{ LEVEL[row.level] }}</span> {{ row.label }}</template>
      </el-table-column>
      <el-table-column label="实时数据" min-width="150"><template #default="{ row }"><span class="small">{{ valueText(row, row.deviceRealtime) || '-' }}</span></template></el-table-column>
      <el-table-column label="设备状态" width="96"><template #default="{ row }"><DeviceStatus v-if="row.deviceStatus" :status="row.deviceStatus" /><span v-else class="muted">已删除</span></template></el-table-column>
      <el-table-column label="告警时间" width="168">
        <template #default="{ row }">
          <div>{{ fmtTime(row.startTs) }}</div>
          <div class="small" :class="row.open ? 'crit' : 'muted'">{{ row.open ? `报警中 · ${fmtDuration(row.duration)}` : `已恢复 · 持续 ${fmtDuration(row.duration)}` }}</div>
        </template>
      </el-table-column>
      <el-table-column label="处理状态" width="100"><template #default="{ row }"><span class="st-tag" :class="HANDLE[row.status].cls">{{ HANDLE[row.status].text }}</span></template></el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openView(row)">查看</el-button>
          <el-button v-if="row.status < 2 && canWrite()" link type="primary" @click="openHandle([row], 2)">处理</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pager">
      <el-pagination v-model:current-page="q.page" v-model:page-size="q.size" :total="data.total" :page-sizes="[20, 50, 100]"
        :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next'" :pager-count="isMobile ? 5 : 7" :size="isMobile ? 'small' : 'default'" @change="load" />
    </div>

    <!-- 处理对话框 -->
    <el-dialog v-model="handleDlg.visible" :title="handleDlg.rows.length > 1 ? `处理 ${handleDlg.rows.length} 条告警` : '处理告警'" :width="isMobile ? '94%' : '460px'" append-to-body>
      <div v-if="handleDlg.rows.length === 1" class="hd-sum">
        <span class="lv-badge" :class="handleDlg.rows[0].level">{{ LEVEL[handleDlg.rows[0].level] }}</span>
        <b>{{ handleDlg.rows[0].label }}</b><span class="muted"> · {{ handleDlg.rows[0].deviceName || handleDlg.rows[0].deviceId }}</span>
      </div>
      <el-form label-position="top">
        <el-form-item label="处理结果">
          <el-radio-group v-model="handleDlg.status">
            <el-radio-button :value="1">已记录（知悉，稍后处理）</el-radio-button>
            <el-radio-button :value="2">已处理</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="处理说明">
          <el-input v-model="handleDlg.note" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="例如：已派人现场检查，阀门已关闭" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="handleDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="handleDlg.saving" @click="submitHandle">确定</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="view.visible" :size="isMobile ? '100%' : '480px'" title="告警详情" append-to-body>
      <template v-if="view.row">
        <div class="vw-head" :class="`lv-${view.row.level}`">
          <div class="vw-title"><span class="lv-badge" :class="view.row.level">{{ LEVEL[view.row.level] }}</span>{{ view.row.label }}</div>
          <div class="vw-sub mono">{{ view.row.code }}</div>
          <div class="vw-tags">
            <span class="st-tag" :class="HANDLE[view.row.status].cls">{{ HANDLE[view.row.status].text }}</span>
            <span class="st-tag" :class="view.row.open ? 'critical' : 'good'">{{ view.row.open ? '报警中' : '已恢复' }}</span>
          </div>
        </div>
        <el-descriptions :column="1" border size="small" class="mt">
          <el-descriptions-item label="设备"><a class="link" @click="goDevice(view.row.deviceId)">{{ view.row.deviceName || view.row.deviceId }}</a> <span class="mono muted">{{ view.row.deviceId }}</span></el-descriptions-item>
          <el-descriptions-item label="设备类型">{{ view.row.typeName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="安装位置">{{ view.row.location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{ view.row.owner || '-' }} {{ view.row.contact || '' }}</el-descriptions-item>
          <el-descriptions-item label="触发时数据">{{ valueText(view.row, view.row.snapshot, 8) || '-' }}</el-descriptions-item>
          <el-descriptions-item label="报警范围">{{ thresholdText(view.row) || '-' }}</el-descriptions-item>
          <el-descriptions-item v-if="view.row.handledBy" label="处理人">{{ view.row.handledBy }}</el-descriptions-item>
          <el-descriptions-item label="当前数据">{{ valueText(view.row, view.row.deviceRealtime, 8) || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="sec-title mt">处理记录</div>
        <el-timeline>
          <el-timeline-item :timestamp="fmtTime(view.row.startTs)" type="danger">告警触发（报警位 BIT{{ view.row.bit }}）</el-timeline-item>
          <el-timeline-item v-if="view.row.endTs" :timestamp="fmtTime(view.row.endTs)" type="success">报警恢复，持续 {{ fmtDuration(view.row.duration) }}</el-timeline-item>
          <el-timeline-item v-if="view.row.handledAt" :timestamp="fmtTime(view.row.handledAt)" :type="view.row.status === 2 ? 'primary' : 'warning'">
            {{ HANDLE[view.row.status].text }}<div v-if="view.row.note" class="muted small">{{ view.row.note }}</div>
          </el-timeline-item>
        </el-timeline>
        <div class="vw-ops" v-if="view.row.status < 2 && canWrite()">
          <el-button v-if="view.row.status === 0" @click="openHandle([view.row], 1)">标为已记录</el-button>
          <el-button type="primary" @click="openHandle([view.row], 2)">处理</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search, Download, Refresh } from '@element-plus/icons-vue';
import DeviceStatus from './DeviceStatus.vue';
import { api, loadTypes, canWrite } from '../api.js';
import { fmtTime, fmtDuration, fmtParam } from '../utils/format.js';
import { isMobile } from '../utils/responsive.js';
import { onStream, debounce } from '../utils/stream.js';

const props = defineProps({ deviceId: String, initial: Object, compact: Boolean });
const emit = defineEmits(['changed']);
const router = useRouter();
const LEVEL = { high: '高', mid: '中', low: '低' };
const HANDLE = [{ text: '未处理', cls: 'pending' }, { text: '已记录', cls: 'recorded' }, { text: '已处理', cls: 'handled' }];
const TABS = [{ key: '0', text: '未处理' }, { key: '1', text: '已记录' }, { key: '2', text: '已处理' }, { key: 'all', text: '全部' }];
const LABELS = ['高报警', '低报警', '电量报警', '传感器异常', '硬件异常', '第二传感器高报警', '第二传感器低报警', '第三传感器报警', '放水报警', '倾斜报警', '撞击报警', '开盖报警', '闷盖浸水报警', '井盖开启报警', '异动报警'];

const init = props.initial || {};
const q = reactive({ handle: init.handle !== undefined && init.handle !== '' ? String(init.handle) : props.deviceId ? 'all' : '0', keyword: '', level: init.level || '', label: '', status: '', page: 1, size: 20 });
const dr = ref(null);
const showMore = ref(false);
const data = ref({ total: 0, items: [] });
const counts = ref({});
const loading = ref(false);
const selected = ref([]);
const types = ref(new Map());

function params() {
  const p = { ...q, deviceId: props.deviceId };
  if (dr.value) {
    p.from = dr.value[0].getTime();
    p.to = dr.value[1].getTime() + 86400000 - 1;
  }
  return p;
}
async function load() {
  loading.value = true;
  try {
    data.value = await api.alarms(params());
    const base = { ...params(), size: 1, page: 1 };
    const [c0, c1, c2, ca] = await Promise.all(['0', '1', '2', 'all'].map((h) => api.alarms({ ...base, handle: h })));
    counts.value = { 0: c0.total, 1: c1.total, 2: c2.total, all: ca.total };
  } finally {
    loading.value = false;
  }
}
const reload = () => { q.page = 1; load(); };
const search = debounce(reload, 300);
function setTab(k) { q.handle = k; reload(); }

function valueText(row, values, n = 2) {
  if (!values) return '';
  const def = types.value.get(row.typeCode);
  return Object.entries(values).filter(([k]) => k !== '_modbus' && k !== 'reserved').slice(0, n).map(([k, v]) => {
    const p = def?.params.find((x) => x.key === k);
    return `${p?.name ?? k} ${fmtParam(p, v)}${p?.kind === 'num' && p.unit ? p.unit : ''}`;
  }).join('，');
}
function thresholdText(row) {
  return (row.thresholds || []).filter((t) => t.low != null).map((t) => `${t.name} ${t.low} ~ ${t.high}${t.unit ? ' ' + t.unit : ''}`).join('；');
}
function exportCsv() { window.open(api.alarmsExportUrl({ ...params(), page: undefined, size: undefined }), '_blank'); }
function goDevice(id) { view.visible = false; router.push(`/devices/${id}`); }

const view = reactive({ visible: false, row: null });
function openView(row) { view.row = row; view.visible = true; }

const handleDlg = reactive({ visible: false, rows: [], status: 2, note: '', saving: false });
function openHandle(rows, status) {
  Object.assign(handleDlg, { visible: true, rows, status, note: '' });
}
async function submitHandle() {
  handleDlg.saving = true;
  try {
    await api.handleAlarms(handleDlg.rows.map((r) => r.id), handleDlg.status, handleDlg.note);
    ElMessage.success(handleDlg.status === 2 ? '已处理' : '已记录');
    handleDlg.visible = false;
    view.visible = false;
    selected.value = [];
    load();
    emit('changed');
  } finally {
    handleDlg.saving = false;
  }
}

onStream('alarm', debounce(load, 800));
onMounted(async () => {
  load();
  types.value = await loadTypes();
});
defineExpose({ reload, setTab });
</script>

<style scoped>
.at-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--hair); margin-bottom: 14px; overflow-x: auto; }
.at-tab {
  position: relative; height: 40px; padding: 0 14px; border: 0; background: none; font: inherit; font-size: 14px; color: var(--ink-2); cursor: pointer; white-space: nowrap;
}
.at-tab.on { color: var(--accent); font-weight: 600; }
.at-tab.on::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: -1px; height: 2px; border-radius: 1px; background: var(--accent); }
.cnt { margin-left: 6px; font-size: 12px; padding: 0 6px; border-radius: 9px; background: var(--page-bg); color: var(--ink-2); font-weight: 400; }
.at-tab.on .cnt { background: var(--accent-soft); color: var(--accent); }
.grow { flex: 1 !important; }
.small { font-size: 12px; }
.crit { color: var(--critical); }
.cell-2 { line-height: 1.4; }
.m-alarm { border-left: 3px solid var(--critical); }
.m-alarm.lv-mid { border-left-color: var(--serious); }
.m-alarm.lv-low { border-left-color: var(--warning); }
.m-ops { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
.hd-sum { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; background: var(--page-bg); margin-bottom: 14px; }
.vw-head { padding: 16px; border-radius: 12px; background: rgba(220, 60, 61, 0.06); }
.vw-head.lv-mid { background: rgba(241, 138, 89, 0.08); }
.vw-head.lv-low { background: rgba(251, 179, 21, 0.1); }
.vw-title { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; }
.vw-sub { color: var(--ink-2); margin-top: 4px; }
.vw-tags { display: flex; gap: 6px; margin-top: 10px; }
.vw-ops { display: flex; gap: 8px; justify-content: flex-end; }
@media (max-width: 768px) {
  .filters > .grow { display: none; }
}
</style>
