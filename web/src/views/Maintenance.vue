<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>维保记录</h2>
        <div class="sub">换卡、换电池、维修等运维记录。修改设备 ICCID 或电量由低到高跳变时，平台会自动生成记录</div>
      </div>
      <div class="head-btns">
        <el-button v-if="canWrite()" type="primary" :icon="Plus" @click="dlg.open()">登记维保</el-button>
        <el-button :icon="Download" @click="exportCsv">导出</el-button>
      </div>
    </div>
    <div class="type-cards">
      <button v-for="t in TYPE_CARDS" :key="t.key" class="tcard card" :class="{ on: q.type === t.key }" @click="setType(t.key)">
        <span class="tc-ico" :style="{ background: t.bg, color: t.color }"><el-icon :size="20"><component :is="t.icon" /></el-icon></span>
        <span><span class="tc-label">{{ t.text }}</span><b class="num">{{ t.key ? data.counts[t.key] ?? 0 : allCount }}</b></span>
      </button>
    </div>
    <div class="card mt">
      <div class="filters">
        <el-input v-model="q.deviceId" placeholder="设备编号" clearable :prefix-icon="Search" style="width: 200px" @input="search" />
        <el-date-picker v-if="!isMobile" v-model="dr" type="daterange" range-separator="至" start-placeholder="维保开始日期" end-placeholder="结束日期" style="width: 260px" @change="reload" />
      </div>
      <div v-if="isMobile" class="m-list" v-loading="loading">
        <div v-for="row in data.items" :key="row.id" class="card m-card">
          <div class="m-row"><b class="grow">{{ row.type }}</b><span class="muted small">{{ fmtTime(row.ts) }}</span></div>
          <div class="m-sub">{{ row.deviceName || row.deviceId }} · <span class="mono">{{ row.deviceId }}</span></div>
          <div v-if="row.oldValue || row.newValue" class="m-sub mono">{{ row.oldValue || '-' }} → {{ row.newValue || '-' }}</div>
          <div v-if="row.note" class="m-sub">{{ row.note }}</div>
        </div>
        <el-empty v-if="!loading && !data.items.length" description="暂无记录" :image-size="60" />
      </div>
      <el-table v-else :data="data.items" v-loading="loading" empty-text="暂无记录">
        <el-table-column label="设备编号" min-width="150"><template #default="{ row }"><a class="link mono" @click="$router.push(`/devices/${row.deviceId}?tab=maint`)">{{ row.deviceId }}</a></template></el-table-column>
        <el-table-column label="设备名称" min-width="160"><template #default="{ row }">{{ row.deviceName || '-' }}</template></el-table-column>
        <el-table-column label="维保类型" width="110"><template #default="{ row }"><span class="st-tag" :class="TYPE_CLS[row.type] || 'offline'">{{ row.type }}</span></template></el-table-column>
        <el-table-column :label="q.type === '更换SIM卡' ? '旧 ICCID' : '原值'" min-width="180"><template #default="{ row }"><span class="mono">{{ row.oldValue || '-' }}</span></template></el-table-column>
        <el-table-column :label="q.type === '更换SIM卡' ? '新 ICCID' : '新值'" min-width="180"><template #default="{ row }"><span class="mono">{{ row.newValue || '-' }}</span></template></el-table-column>
        <el-table-column prop="note" label="说明" min-width="160" show-overflow-tooltip />
        <el-table-column label="维保时间" width="170"><template #default="{ row }">{{ fmtTime(row.ts) }}</template></el-table-column>
        <el-table-column label="来源" width="120"><template #default="{ row }"><span class="small" :class="row.auto ? 'auto' : 'muted'">{{ row.auto ? '自动识别' : row.operator || '人工登记' }}</span></template></el-table-column>
        <el-table-column v-if="canWrite()" label="操作" width="76" fixed="right">
          <template #default="{ row }">
            <el-popconfirm title="删除这条记录？" @confirm="remove(row.id)"><template #reference><el-button link type="danger">删除</el-button></template></el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination v-model:current-page="q.page" v-model:page-size="q.size" :total="data.total" :page-sizes="[20, 50, 100]"
          :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next, jumper'" :size="isMobile ? 'small' : 'default'" @change="load" />
      </div>
    </div>
    <MaintenanceDialog ref="dlg" @saved="load" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Download, Search, Postcard, Odometer, Tools, Box, Files } from '@element-plus/icons-vue';
import MaintenanceDialog from '../components/MaintenanceDialog.vue';
import { api, canWrite } from '../api.js';
import { fmtTime } from '../utils/format.js';
import { isMobile } from '../utils/responsive.js';
import { debounce } from '../utils/stream.js';

const TYPE_CARDS = [
  { key: '', text: '全部记录', icon: Files, bg: 'rgba(37,125,224,.1)', color: '#257de0' },
  { key: '更换SIM卡', text: '更换SIM卡', icon: Postcard, bg: 'rgba(106,76,226,.1)', color: '#6a4ce2' },
  { key: '更换电池', text: '更换电池', icon: Odometer, bg: 'rgba(0,184,148,.12)', color: '#00a888' },
  { key: '维修', text: '维修', icon: Tools, bg: 'rgba(244,114,48,.12)', color: '#e76624' },
  { key: '安装', text: '安装 / 巡检 / 其他', icon: Box, bg: 'rgba(127,127,127,.12)', color: '#7a7a7a' },
];
const TYPE_CLS = { 更换SIM卡: 'online', 更换电池: 'handled', 维修: 'warning' };
const q = reactive({ deviceId: '', type: '', page: 1, size: 20 });
const dr = ref(null);
const data = ref({ total: 0, items: [], counts: {} });
const loading = ref(false);
const dlg = ref(null);
const allCount = computed(() => Object.values(data.value.counts).reduce((a, b) => a + b, 0));

function params() {
  const p = { ...q };
  if (p.type === '安装') delete p.type;
  if (dr.value) {
    p.from = dr.value[0].getTime();
    p.to = dr.value[1].getTime() + 86400000 - 1;
  }
  return p;
}
async function load() {
  loading.value = true;
  try {
    const r = await api.maintenance(params());
    if (q.type === '安装') r.items = r.items.filter((m) => ['安装', '巡检', '其他'].includes(m.type));
    data.value = r;
  } finally {
    loading.value = false;
  }
}
const reload = () => { q.page = 1; load(); };
const search = debounce(reload, 300);
function setType(k) { q.type = k; reload(); }
function exportCsv() { window.open(api.maintenanceExportUrl(Object.fromEntries(Object.entries(params()).filter(([k, v]) => v !== '' && v != null && k !== 'page' && k !== 'size'))), '_blank'); }
async function remove(id) {
  await api.deleteMaintenance(id);
  ElMessage.success('已删除');
  load();
}
onMounted(load);
</script>

<style scoped>
.head-btns { display: flex; gap: 8px; }
.type-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.tcard { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; text-align: left; font: inherit; color: var(--ink); }
.tcard.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
.tc-ico { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex: none; }
.tc-label { display: block; font-size: 12px; color: var(--ink-2); }
.tcard b { font-size: 22px; }
.small { font-size: 12px; }
.auto { color: var(--accent); }
@media (max-width: 1100px) { .type-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 768px) { .type-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tcard b { font-size: 18px; } }
</style>
