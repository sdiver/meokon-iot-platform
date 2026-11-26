<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>设备管理</h2>
        <div class="sub">共 {{ data.total }} 台设备 · 设备首次上报后自动注册</div>
      </div>
    </div>
    <div class="card">
      <div class="filters">
        <el-input v-model="q.keyword" placeholder="编号 / 名称 / 位置" clearable style="width: 220px" :prefix-icon="Search" @input="search" />
        <el-select v-model="q.status" placeholder="状态" clearable style="width: 120px" @change="search">
          <el-option label="在线" value="online" />
          <el-option label="离线" value="offline" />
          <el-option label="报警" value="alarm" />
          <el-option label="低电量" value="lowBattery" />
        </el-select>
        <el-select v-model="q.category" placeholder="类别" clearable style="width: 130px" @change="search">
          <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select v-model="q.type" placeholder="设备类型" clearable filterable style="width: 220px" @change="search">
          <el-option v-for="t in typeList" :key="t.code" :label="`${t.code} · ${t.name}`" :value="t.code" />
        </el-select>
        <el-select v-model="q.group" placeholder="分组" clearable style="width: 140px" @change="search">
          <el-option v-for="g in groups" :key="g" :label="g" :value="g" />
        </el-select>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>

      <el-table :data="data.items" v-loading="loading" @row-click="(r) => $router.push(`/devices/${r.id}`)" row-class-name="clickable" empty-text="暂无设备，等待设备上报">
        <el-table-column label="状态" width="80"><template #default="{ row }"><DeviceStatus :status="row.status" /></template></el-table-column>
        <el-table-column label="设备编号 / 名称" min-width="170">
          <template #default="{ row }">
            <div class="mono">{{ row.id }}</div>
            <div class="muted small">{{ row.name || '未命名' }}<template v-if="row.location"> · {{ row.location }}</template></div>
          </template>
        </el-table-column>
        <el-table-column label="设备类型" min-width="150">
          <template #default="{ row }">{{ row.typeName }}<div class="muted small">{{ row.category }} · 类型 {{ row.typeCode }}</div></template>
        </el-table-column>
        <el-table-column label="当前数据" min-width="220">
          <template #default="{ row }">
            <div v-for="v in mainValues(row)" :key="v.k" class="val"><span class="muted">{{ v.name }}</span> <b class="num">{{ v.text }}</b> <span class="muted">{{ v.unit }}</span></div>
          </template>
        </el-table-column>
        <el-table-column label="报警" min-width="120">
          <template #default="{ row }">
            <template v-if="row.alarm.bits.length">
              <div v-for="b in row.alarm.bits" :key="b.bit" class="alarm-txt"><span class="dot critical" />{{ b.label }}</div>
            </template>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="电量 / 信号" width="190"><template #default="{ row }"><BatterySignal :battery="row.battery" :signal="row.signal" /></template></el-table-column>
        <el-table-column label="最后上报" width="150">
          <template #default="{ row }">{{ fmtAgo(row.lastSeen) }}<div class="muted small">{{ TRANSPORT[row.transport] || row.transport }}</div></template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="$router.push(`/devices/${row.id}`)">详情</el-button>
            <el-button link type="primary" @click.stop="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination v-model:current-page="q.page" v-model:page-size="q.size" :total="data.total" :page-sizes="[20, 50, 100]" layout="total, sizes, prev, pager, next" @change="load" />
      </div>
    </div>

    <DeviceEditDialog ref="editDlg" @saved="load" />
  </div>
</template>

<script setup>
defineOptions({ name: 'Devices' });
import { ref, reactive, computed, onMounted, onActivated } from 'vue';
import { useRoute } from 'vue-router';
import { Search, Refresh } from '@element-plus/icons-vue';
import DeviceStatus from '../components/DeviceStatus.vue';
import BatterySignal from '../components/BatterySignal.vue';
import DeviceEditDialog from '../components/DeviceEditDialog.vue';
import { api, loadTypes } from '../api.js';
import { fmtAgo, fmtParam, TRANSPORT } from '../utils/format.js';
import { onStream, debounce } from '../utils/stream.js';

const route = useRoute();
const q = reactive({ keyword: '', status: route.query.status || '', type: route.query.type !== undefined ? Number(route.query.type) : '', category: '', group: '', page: 1, size: 20 });
const data = ref({ total: 0, items: [] });
const loading = ref(false);
const types = ref(new Map());
const groups = ref([]);
const editDlg = ref(null);
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
});
onActivated(() => {
  if (route.query.status !== undefined && route.query.status !== q.status) { q.status = route.query.status; search(); }
});
</script>

<style scoped>
.small { font-size: 12px; }
.val { white-space: nowrap; font-size: 13px; }
.alarm-txt { color: var(--critical); font-size: 13px; white-space: nowrap; }
:deep(.clickable) { cursor: pointer; }
</style>
