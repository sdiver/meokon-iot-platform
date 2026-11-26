<template>
  <div class="card">
    <div class="filters">
      <el-input v-if="!deviceId" v-model="q.deviceId" placeholder="设备编号" clearable style="width: 180px" @change="reload" />
      <el-select v-model="q.direction" placeholder="方向" clearable style="width: 130px" @change="reload">
        <el-option label="上行 0x00" value="up" />
        <el-option label="下行 0xFF" value="down" />
        <el-option label="设备应答 0x04" value="ack" />
      </el-select>
      <el-select v-model="q.ok" placeholder="结果" clearable style="width: 120px" @change="reload">
        <el-option label="正常" value="1" />
        <el-option label="异常" value="0" />
      </el-select>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>
    <el-table :data="data.items" v-loading="loading" size="small" @row-click="open" row-class-name="clickable" empty-text="暂无报文">
      <el-table-column label="接收时间" width="160"><template #default="{ row }">{{ fmtTime(row.receivedAt) }}</template></el-table-column>
      <el-table-column label="方向" width="80"><template #default="{ row }">{{ dirText[row.direction] }}</template></el-table-column>
      <el-table-column v-if="!deviceId" label="设备" width="140"><template #default="{ row }"><span class="mono">{{ row.deviceId || '-' }}</span></template></el-table-column>
      <el-table-column label="方式" width="90"><template #default="{ row }">{{ TRANSPORT[row.transport] || row.transport }}</template></el-table-column>
      <el-table-column label="长度" width="70" align="right"><template #default="{ row }">{{ row.bytes }}</template></el-table-column>
      <el-table-column label="结果" width="150">
        <template #default="{ row }">
          <span v-if="row.ok"><span class="dot good" />正常</span>
          <el-tooltip v-else :content="row.error || '异常'"><span class="err"><span class="dot critical" />{{ row.error || '异常' }}</span></el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="报文（十六进制）" min-width="260"><template #default="{ row }"><span class="mono hexcell">{{ row.hex }}</span></template></el-table-column>
    </el-table>
    <div class="pager">
      <el-pagination v-model:current-page="q.page" v-model:page-size="q.size" :total="data.total" :page-sizes="[20, 50, 100]" layout="total, sizes, prev, pager, next" @change="load" />
    </div>
    <el-drawer v-model="drawer" title="报文解析" size="min(760px, 100%)" append-to-body>
      <template v-if="cur">
        <div class="mono break raw">{{ cur.hex }}</div>
        <DecodedView :d="decoded" :raw="cur.hex" />
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import DecodedView from './DecodedView.vue';
import { api } from '../api.js';
import { fmtTime, TRANSPORT } from '../utils/format.js';

const props = defineProps({ deviceId: String });
const q = reactive({ deviceId: props.deviceId || '', direction: '', ok: '', page: 1, size: 20 });
const data = ref({ total: 0, items: [] });
const loading = ref(false);
const drawer = ref(false);
const cur = ref(null);
const decoded = ref(null);
const dirText = { up: '上行', down: '下行', ack: '应答' };

async function load() {
  loading.value = true;
  try { data.value = await api.frames(q); } finally { loading.value = false; }
}
const reload = () => { q.page = 1; load(); };
async function open(row) {
  cur.value = row;
  decoded.value = null;
  drawer.value = true;
  decoded.value = await api.decode(row.hex);
}
onMounted(load);
</script>

<style scoped>
.hexcell { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.err { color: var(--critical); }
.raw { background: var(--page-bg); padding: 10px; border-radius: 8px; margin-bottom: 12px; }
:deep(.clickable) { cursor: pointer; }
</style>
