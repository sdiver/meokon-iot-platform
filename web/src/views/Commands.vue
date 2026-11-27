<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>远程配置</h2>
        <div class="sub">配置命令在设备下次上报时随应答下发，设备应答（0x04）后标记为“已应答”</div>
      </div>
      <el-button v-if="canWrite()" type="primary" :icon="Plus" @click="openBatch">新增配置</el-button>
    </div>
    <div class="grid c4">
      <button v-for="s in STATS" :key="s.key" class="scard card" :class="{ on: q.status === s.key }" @click="q.status = q.status === s.key ? '' : s.key; reload()">
        <span class="s-label"><span class="st-tag" :class="s.cls">{{ s.text }}</span></span>
        <b class="num">{{ data.counts[s.key] ?? 0 }}</b>
      </button>
    </div>
    <div class="card mt">
      <div class="filters">
        <el-input v-model="q.keyword" placeholder="设备编号 / 名称 / 备注" clearable :prefix-icon="Search" style="width: 240px" @input="search" />
        <div class="grow" />
        <template v-if="selected.length && canWrite()">
          <span class="muted small">已选 {{ selected.length }} 条</span>
          <el-button @click="cancelSel">批量取消</el-button>
          <el-button type="danger" plain @click="deleteSel">批量删除</el-button>
        </template>
        <el-button :icon="Refresh" @click="load" aria-label="刷新" />
      </div>
      <CommandTable :items="data.items" show-device :selectable="canWrite()" @select="(v) => (selected = v)" @changed="load" v-loading="loading" />
      <div class="pager">
        <el-pagination v-model:current-page="q.page" v-model:page-size="q.size" :total="data.total" :page-sizes="[20, 50, 100]"
          :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next, jumper'" :size="isMobile ? 'small' : 'default'" @change="load" />
      </div>
    </div>

    <el-dialog v-model="batch.visible" title="新增配置" :width="isMobile ? '96%' : '620px'" append-to-body>
      <el-form label-position="top">
        <el-form-item label="目标设备" required>
          <el-select v-model="batch.deviceIds" multiple filterable remote :remote-method="searchDev" collapse-tags collapse-tags-tooltip :max-collapse-tags="4" placeholder="搜索并选择设备，可多选" style="width: 100%">
            <el-option v-for="d in devOptions" :key="d.id" :label="`${d.name || d.id}（${d.id}）`" :value="d.id" />
          </el-select>
          <div class="pick-row">
            <span class="muted small">快速选择：</span>
            <el-button size="small" link type="primary" @click="pickBy({})">全部设备</el-button>
            <el-button size="small" link type="primary" @click="pickBy({ status: 'online' })">在线设备</el-button>
            <el-select v-model="pickType" size="small" placeholder="按设备类型" clearable filterable style="width: 180px" @change="(v) => v !== '' && v != null && pickBy({ type: v })">
              <el-option v-for="t in typeList" :key="t.code" :label="`${t.code} · ${t.name}`" :value="t.code" />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="配置内容">
          <el-radio-group v-model="batch.mode">
            <el-radio-button value="readAll">读取所有配置</el-radio-button>
            <el-radio-button value="custom">自定义参数单元</el-radio-button>
          </el-radio-group>
          <el-input v-if="batch.mode === 'custom'" v-model="batch.params" class="mono mt8" placeholder="参数设置数据单元（十六进制），具体格式见《远程配置协议》" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="batch.note" maxlength="100" placeholder="例如：调整采集间隔为 300 秒" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batch.visible = false">取消</el-button>
        <el-button type="primary" :loading="batch.saving" @click="submitBatch">下发到 {{ batch.deviceIds.length }} 台设备</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Refresh } from '@element-plus/icons-vue';
import CommandTable from '../components/CommandTable.vue';
import { api, loadTypes, canWrite } from '../api.js';
import { isMobile } from '../utils/responsive.js';
import { onStream, debounce } from '../utils/stream.js';

const STATS = [
  { key: 'pending', text: '待下发', cls: 'warning' },
  { key: 'sent', text: '已下发', cls: 'online' },
  { key: 'acked', text: '已应答', cls: 'handled' },
  { key: 'cancelled', text: '已取消', cls: 'offline' },
];
const q = reactive({ keyword: '', status: '', page: 1, size: 20 });
const data = ref({ total: 0, items: [], counts: {} });
const loading = ref(false);
const selected = ref([]);
const devOptions = ref([]);
const types = ref(new Map());
const typeList = computed(() => [...types.value.values()]);
const pickType = ref('');
const batch = reactive({ visible: false, deviceIds: [], mode: 'readAll', params: '', note: '', saving: false });

async function load() {
  loading.value = true;
  try { data.value = await api.commandList(q); } finally { loading.value = false; }
}
const reload = () => { q.page = 1; load(); };
const search = debounce(reload, 300);
onStream('command', debounce(load, 800));
onMounted(async () => { load(); types.value = await loadTypes(); });

async function searchDev(kw) { devOptions.value = (await api.devices({ keyword: kw, size: 50 })).items; }
async function pickBy(filter) {
  const list = (await api.devices({ ...filter, size: 2000 })).items;
  devOptions.value = list;
  batch.deviceIds = list.map((d) => d.id);
  ElMessage.info(`已选择 ${list.length} 台设备`);
}
function openBatch() {
  Object.assign(batch, { visible: true, deviceIds: [], mode: 'readAll', params: '', note: '' });
  searchDev('');
}
async function submitBatch() {
  if (!batch.deviceIds.length) return ElMessage.warning('请选择设备');
  batch.saving = true;
  try {
    const body = { deviceIds: batch.deviceIds, note: batch.note || (batch.mode === 'readAll' ? '读取所有配置' : '') };
    if (batch.mode === 'readAll') body.preset = 'readAll';
    else body.params = batch.params;
    const r = await api.batchCommands(body);
    ElMessage.success(`已创建 ${r.ids.length} 条配置命令`);
    batch.visible = false;
    reload();
  } finally {
    batch.saving = false;
  }
}
async function cancelSel() {
  const r = await api.cancelCommands(selected.value.map((c) => c.id));
  ElMessage.success(`已取消 ${r.cancelled} 条`);
  load();
}
async function deleteSel() {
  await ElMessageBox.confirm('删除选中的配置记录？待下发的命令请先取消。', '批量删除', { type: 'warning' });
  const r = await api.deleteCommands(selected.value.map((c) => c.id));
  ElMessage.success(`已删除 ${r.deleted} 条`);
  load();
}
</script>

<style scoped>
.scard { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; cursor: pointer; font: inherit; color: var(--ink); text-align: left; }
.scard.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
.scard b { font-size: 26px; }
.grow { flex: 1 !important; }
.small { font-size: 12px; }
.mt8 { margin-top: 8px; }
.pick-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
@media (max-width: 768px) { .grow { display: none; } .scard b { font-size: 20px; } }
</style>
