<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>设备列表</h2>
        <div class="sub">共 {{ data.total }} 台设备 · 设备首次上报后自动登记，也可预先登记或批量导入档案</div>
      </div>
      <div class="head-btns">
        <el-button type="primary" :icon="Plus" @click="editDlg.open(null)">新增设备</el-button>
        <el-button :icon="Upload" @click="importDlg.open()">批量导入</el-button>
        <el-button :icon="Download" @click="exportAll">导出</el-button>
      </div>
    </div>
    <div class="card">
      <div class="filters">
        <el-input v-model="q.keyword" placeholder="编号 / 名称 / 位置 / 项目 / ICCID" clearable style="width: 220px" :prefix-icon="Search" @input="search" />
        <el-select v-model="q.status" placeholder="状态" clearable style="width: 120px" @change="search">
          <el-option label="在线" value="online" />
          <el-option label="离线" value="offline" />
          <el-option label="报警" value="alarm" />
          <el-option label="低电量" value="lowBattery" />
          <el-option label="未上线" value="inactive" />
        </el-select>
        <el-select v-model="q.category" placeholder="类别" clearable style="width: 130px" @change="search">
          <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select v-model="q.type" placeholder="设备类型" clearable filterable style="width: 220px" @change="search">
          <el-option v-for="t in typeList" :key="t.code" :label="`${t.code} · ${t.name}`" :value="t.code" />
        </el-select>
        <el-select v-model="q.project" placeholder="项目" clearable style="width: 140px" @change="search">
          <el-option v-for="g in projects" :key="g" :label="g" :value="g" />
        </el-select>
        <el-select v-model="q.group" placeholder="分组" clearable style="width: 140px" @change="search">
          <el-option v-for="g in groups" :key="g" :label="g" :value="g" />
        </el-select>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>

      <div v-if="isMobile" class="m-list" v-loading="loading">
        <div v-for="row in data.items" :key="row.id" class="card m-card" @click="$router.push(`/devices/${row.id}`)">
          <div class="m-row">
            <b class="grow">{{ row.name || row.id }}</b>
            <DeviceStatus :status="row.status" />
          </div>
          <div class="m-sub"><span class="mono">{{ row.id }}</span> · {{ row.typeName }}</div>
          <div class="m-vals">
            <div v-for="v in mainValues(row)" :key="v.k" class="m-val">
              <div class="muted">{{ v.name }}</div>
              <div><b class="num">{{ v.text }}</b> <span class="muted">{{ v.unit }}</span></div>
            </div>
          </div>
          <div v-if="row.alarm.bits.length" class="alarm-txt"><span class="dot critical" />{{ row.alarm.bits.map((b) => b.label).join('、') }}</div>
          <div class="m-row m-foot">
            <BatterySignal :battery="row.battery" :signal="row.signal" />
            <span class="muted small">{{ fmtAgo(row.lastSeen) }}</span>
          </div>
        </div>
        <el-empty v-if="!loading && !data.items.length" description="暂无设备，等待设备上报" />
      </div>
      <el-table v-else :data="data.items" v-loading="loading" @row-click="(r) => $router.push(`/devices/${r.id}`)" row-class-name="clickable" empty-text="暂无设备，等待设备上报">
        <el-table-column label="设备" min-width="210">
          <template #default="{ row }">
            <div class="dev-cell">
              <div class="thumb"><img v-if="row.photo" :src="withToken(row.photo)" alt="" /><el-icon v-else :size="18"><Cpu /></el-icon></div>
              <div class="dev-txt">
                <div class="dev-name">{{ row.name || row.id }}</div>
                <div class="muted small mono">{{ row.id }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="110">
          <template #default="{ row }">
            <DeviceStatus :status="row.status" />
            <div v-if="row.status === 'alarm'" class="alarm-txt small">{{ row.alarm.bits.map((b) => b.label).join('、') }}</div>
          </template>
        </el-table-column>
        <el-table-column label="型号 / 项目" min-width="140">
          <template #default="{ row }">{{ row.model || '-' }}<div class="muted small">{{ row.project || row.groupName || '' }}</div></template>
        </el-table-column>
        <el-table-column label="设备类型" min-width="130">
          <template #default="{ row }">{{ row.typeName }}<div class="muted small">{{ row.category }} · 类型 {{ row.typeCode }}</div></template>
        </el-table-column>
        <el-table-column label="当前数据" min-width="190">
          <template #default="{ row }">
            <div v-for="v in mainValues(row)" :key="v.k" class="val"><span class="muted">{{ v.name }}</span> <b class="num">{{ v.text }}</b> <span class="muted">{{ v.unit }}</span></div>
          </template>
        </el-table-column>
        <el-table-column label="电量 / 信号" width="172"><template #default="{ row }"><BatterySignal :battery="row.battery" :signal="row.signal" /></template></el-table-column>
        <el-table-column label="最后上报" width="112">
          <template #default="{ row }">{{ row.lastSeen ? fmtAgo(row.lastSeen) : '尚未上报' }}<div class="muted small">{{ TRANSPORT[row.transport] || row.transport }}</div></template>
        </el-table-column>
        <el-table-column label="操作" width="104" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="$router.push(`/devices/${row.id}`)">详情</el-button>
            <el-button link type="primary" @click.stop="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination v-model:current-page="q.page" v-model:page-size="q.size" :total="data.total" :page-sizes="[20, 50, 100]" :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next'" :pager-count="isMobile ? 5 : 7" :size="isMobile ? 'small' : 'default'" @change="load" />
      </div>
    </div>

    <DeviceEditDialog ref="editDlg" @saved="load" />
    <DeviceImportDialog ref="importDlg" @done="load" />
  </div>
</template>

<script setup>
import { isMobile } from '../utils/responsive.js';
defineOptions({ name: 'Devices' });
import { ref, reactive, computed, onMounted, onActivated } from 'vue';
import { useRoute } from 'vue-router';
import { Search, Refresh, Plus, Upload, Download, Cpu } from '@element-plus/icons-vue';
import DeviceStatus from '../components/DeviceStatus.vue';
import BatterySignal from '../components/BatterySignal.vue';
import DeviceEditDialog from '../components/DeviceEditDialog.vue';
import DeviceImportDialog from '../components/DeviceImportDialog.vue';
import { api, loadTypes, withToken } from '../api.js';
import { fmtAgo, fmtParam, TRANSPORT } from '../utils/format.js';
import { onStream, debounce } from '../utils/stream.js';

const route = useRoute();
const q = reactive({ project: '', keyword: '', status: route.query.status || '', type: route.query.type !== undefined ? Number(route.query.type) : '', category: '', group: '', page: 1, size: 20 });
const data = ref({ total: 0, items: [] });
const loading = ref(false);
const types = ref(new Map());
const groups = ref([]);
const editDlg = ref(null);
const importDlg = ref(null);
const projects = ref([]);
function exportAll() { window.open(api.devicesExportUrl(Object.fromEntries(Object.entries(q).filter(([k, v]) => v !== '' && v != null && k !== 'page' && k !== 'size'))), '_blank'); }
const typeList = computed(() => [...types.value.values()]);
const categories = computed(() => [...new Set(typeList.value.map((t) => t.category))]);

async function load() {
  loading.value = true;
  try { data.value = await api.devices(q); } finally { loading.value = false; }
}
const search = debounce(() => { q.page = 1; load(); }, 300);

function mainValues(row) {
  const def = types.value.get(row.typeCode);
  const params = def?.params ?? Object.keys(row.realtime).map((k) => ({ key: k, name: k, kind: 'num' }));
  return params.filter((p) => row.realtime[p.key] !== undefined && p.key !== 'reserved').slice(0, 3).map((p) => ({
    k: p.key, name: p.name, text: fmtParam(p, row.realtime[p.key]), unit: p.kind === 'num' ? p.unit : '',
  }));
}
function openEdit(row) { editDlg.value.open(row); }

onStream('frame', debounce(() => load(), 2000));
onMounted(async () => {
  load();
  types.value = await loadTypes();
  groups.value = await api.groups();
  projects.value = await api.projects();
});
onActivated(() => {
  if (route.query.status !== undefined && route.query.status !== q.status) { q.status = route.query.status; search(); }
});
</script>

<style scoped>
.head-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.dev-cell { display: flex; gap: 10px; align-items: center; }
.thumb img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
.dev-txt { min-width: 0; }
.dev-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.small { font-size: 12px; }
.val { white-space: nowrap; font-size: 13px; }
.alarm-txt { color: var(--critical); font-size: 13px; }
.alarm-txt.small { font-size: 12px; margin-top: 3px; line-height: 1.3; }
.m-vals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 10px 0 8px; }
.m-val { font-size: 12px; min-width: 0; }
.m-val b { font-size: 16px; }
.m-foot { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--hair); }
.m-card .alarm-txt { white-space: normal; margin-bottom: 2px; }
:deep(.clickable) { cursor: pointer; }
</style>
