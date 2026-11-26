<template>
  <div class="card">
    <div class="filters">
      <el-select v-model="q.status" placeholder="状态" clearable style="width: 120px" @change="reload">
        <el-option label="报警中" value="open" />
        <el-option label="已恢复" value="closed" />
      </el-select>
      <el-select v-model="q.acked" placeholder="确认" clearable style="width: 120px" @change="reload">
        <el-option label="未确认" value="0" />
        <el-option label="已确认" value="1" />
      </el-select>
      <el-input v-if="!deviceId" v-model="q.deviceId" placeholder="设备编号" clearable style="width: 180px" @change="reload" />
      <el-select v-model="q.label" placeholder="报警类型" clearable filterable allow-create style="width: 170px" @change="reload">
        <el-option v-for="l in labels" :key="l" :label="l" :value="l" />
      </el-select>
      <el-date-picker v-if="!isMobile" v-model="dr" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 260px" @change="reload" />
      <el-button :icon="Refresh" @click="load">刷新</el-button>
      <el-popconfirm title="确认全部未确认的报警？" @confirm="ackAll">
        <template #reference><el-button type="primary" plain>全部确认</el-button></template>
      </el-popconfirm>
    </div>
    <div v-if="isMobile" class="m-list" v-loading="loading">
      <div v-for="row in data.items" :key="row.id" class="card m-card m-alarm" :class="{ open: row.open }">
        <div class="m-row">
          <b class="grow">{{ row.label }}</b>
          <span class="nowrap"><span class="dot" :class="row.open ? 'critical' : 'good'" />{{ row.open ? '报警中' : '已恢复' }}</span>
        </div>
        <div v-if="!deviceId" class="m-sub" @click="$router.push(`/devices/${row.deviceId}`)">
          <a class="link mono">{{ row.deviceId }}</a> {{ row.deviceName || row.typeName }}<template v-if="row.location"> · {{ row.location }}</template>
        </div>
        <div class="m-sub">{{ fmtTime(row.startTs) }} · 持续 {{ fmtDuration(row.duration) }}</div>
        <div v-if="snap(row)" class="small snap">{{ snap(row) }}</div>
        <div class="m-row m-foot">
          <span v-if="row.acked" class="small muted grow">已确认<template v-if="row.note">：{{ row.note }}</template></span>
          <span v-else class="small muted grow">未确认</span>
          <el-button v-if="!row.acked" size="small" type="primary" plain @click="ack(row)">确认</el-button>
        </div>
      </div>
      <el-empty v-if="!loading && !data.items.length" description="暂无报警记录" />
    </div>
    <el-table v-else :data="data.items" v-loading="loading" size="small" empty-text="暂无报警记录">
      <el-table-column label="开始时间" width="160"><template #default="{ row }">{{ fmtTime(row.startTs) }}</template></el-table-column>
      <el-table-column v-if="!deviceId" label="设备" min-width="170">
        <template #default="{ row }">
          <a class="link mono" @click="$router.push(`/devices/${row.deviceId}`)">{{ row.deviceId }}</a>
          <div class="muted small">{{ row.deviceName || row.typeName }}<template v-if="row.location"> · {{ row.location }}</template></div>
        </template>
      </el-table-column>
      <el-table-column label="报警类型" min-width="130"><template #default="{ row }">{{ row.label }} <span class="muted small">BIT{{ row.bit }}</span></template></el-table-column>
      <el-table-column label="触发时数据" min-width="170">
        <template #default="{ row }"><span class="small">{{ snap(row) }}</span></template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }"><span class="dot" :class="row.open ? 'critical' : 'good'" />{{ row.open ? '报警中' : '已恢复' }}</template>
      </el-table-column>
      <el-table-column label="持续时长" width="130"><template #default="{ row }">{{ fmtDuration(row.duration) }}</template></el-table-column>
      <el-table-column label="确认" min-width="140">
        <template #default="{ row }">
          <template v-if="row.acked"><span class="small">已确认 {{ fmtTime(row.ackedAt).slice(5, 16) }}</span><div class="muted small" v-if="row.note">{{ row.note }}</div></template>
          <el-button v-else link type="primary" @click="ack(row)">确认</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pager">
      <el-pagination v-model:current-page="q.page" v-model:page-size="q.size" :total="data.total" :page-sizes="[20, 50, 100]" :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next'" :pager-count="isMobile ? 5 : 7" :size="isMobile ? 'small' : 'default'" @change="load" />
    </div>
  </div>
</template>

<script setup>
import { isMobile } from '../utils/responsive.js';
import { ref, reactive, onMounted } from 'vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api, loadTypes } from '../api.js';
import { fmtTime, fmtDuration, fmtParam } from '../utils/format.js';
import { onStream, debounce } from '../utils/stream.js';

const props = defineProps({ deviceId: String, initial: Object });
const q = reactive({ status: '', acked: '', label: '', deviceId: props.deviceId || '', page: 1, size: 20, ...(props.initial || {}) });
const dr = ref(null);
const data = ref({ total: 0, items: [] });
const loading = ref(false);
const types = ref(new Map());
const labels = ['低报警', '高报警', '电量报警', '传感器异常', '硬件异常', '第二传感器低报警', '第二传感器高报警', '第三传感器报警', '放水报警', '倾斜报警', '撞击报警', '开盖报警', '闷盖浸水报警', '井盖开启报警', '异动报警'];

async function load() {
  loading.value = true;
  try {
    const query = { ...q };
    if (dr.value) {
      query.from = dr.value[0].getTime();
      query.to = dr.value[1].getTime() + 86400000 - 1;
    }
    data.value = await api.alarms(query);
  } finally {
    loading.value = false;
  }
}
const reload = () => { q.page = 1; load(); };
function snap(row) {
  const def = types.value.get(row.typeCode);
  return Object.entries(row.snapshot || {}).slice(0, 3).map(([k, v]) => {
    const p = def?.params.find((x) => x.key === k);
    return `${p?.name ?? k} ${fmtParam(p, v)}${p?.kind === 'num' && p.unit ? p.unit : ''}`;
  }).join('，');
}
async function ack(row) {
  const { value } = await ElMessageBox.prompt('处理说明（可选）', `确认报警：${row.label}`, { confirmButtonText: '确认', cancelButtonText: '取消', inputPlaceholder: '例如：已派人现场检查' }).catch(() => ({}));
  if (value === undefined) return;
  await api.ackAlarm(row.id, value || null);
  ElMessage.success('已确认');
  load();
}
async function ackAll() {
  await api.ackAll(props.deviceId);
  ElMessage.success('已全部确认');
  load();
}
onStream('alarm', debounce(load, 1000));
onMounted(async () => {
  load();
  types.value = await loadTypes();
});
</script>

<style scoped>
.small { font-size: 12px; }
.nowrap { white-space: nowrap; font-size: 13px; }
.m-alarm.open { border-left: 3px solid var(--critical); }
.snap { margin-top: 6px; }
.m-foot { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--hair); }
</style>
