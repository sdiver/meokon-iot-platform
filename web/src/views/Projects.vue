<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>项目管理</h2>
        <div class="sub">设备按项目归属；用户只能查看和操作被分配项目内的设备、报警与统计数据</div>
      </div>
      <div class="head-btns">
        <el-input v-model="kw" placeholder="搜索项目" clearable :prefix-icon="Search" style="width: 200px" />
        <el-button v-if="isAdmin()" type="primary" :icon="Plus" @click="openEdit(null)">新建项目</el-button>
      </div>
    </div>

    <div class="grid tiles sum" v-if="list.length">
      <StatTile label="项目数" :value="list.length" unit="个" />
      <StatTile label="设备总数" :value="sum('devices')" unit="台" />
      <StatTile label="在线设备" status="good" :value="sum('online')" unit="台" />
      <StatTile label="报警设备" status="critical" :value="sum('alarming')" unit="台" />
      <StatTile v-if="isAdmin() && unassigned" label="未归属项目" status="warning" :value="unassigned" unit="台" sub="可在“管理设备”中分配" />
    </div>

    <div class="cards mt" v-loading="loading">
      <div v-for="p in shown" :key="p.id" class="card pcard">
        <div class="p-head">
          <div class="p-ico">{{ p.name.slice(0, 1) }}</div>
          <div class="p-title">
            <div class="p-name">{{ p.name }}</div>
            <div class="p-code muted">{{ p.code || '未设置编号' }} · 创建于 {{ fmtTime(p.createdAt).slice(0, 10) }}</div>
          </div>
          <el-dropdown v-if="isAdmin()" trigger="click" @command="(c) => onCmd(c, p)">
            <el-button text :icon="MoreFilled" aria-label="更多操作" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="edit" :icon="Edit">编辑项目</el-dropdown-item>
                <el-dropdown-item command="devices" :icon="Cpu">管理设备</el-dropdown-item>
                <el-dropdown-item command="delete" :icon="Delete" divided>删除项目</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div class="p-desc">{{ p.description || '暂无项目说明' }}</div>
        <div class="p-stats">
          <div><b class="num">{{ p.devices }}</b><span>设备</span></div>
          <div><b class="num good">{{ p.online }}</b><span>在线</span></div>
          <div><b class="num" :class="{ crit: p.alarming }">{{ p.alarming }}</b><span>报警</span></div>
          <div><b class="num">{{ p.members }}</b><span>成员</span></div>
        </div>
        <div class="p-bar" :title="`在线率 ${pct(p)}%`"><span :style="{ width: pct(p) + '%' }" /></div>
        <div class="p-meta">
          <span v-if="p.owner"><el-icon><User /></el-icon>{{ p.owner }}<template v-if="p.contact"> · {{ p.contact }}</template></span>
          <span v-if="p.address"><el-icon><Location /></el-icon>{{ p.address }}</span>
        </div>
        <div class="p-ops">
          <el-button size="small" @click="viewDevices(p)">查看设备</el-button>
          <el-button size="small" @click="focusProject(p)">切换到此项目</el-button>
        </div>
      </div>
      <el-empty v-if="!loading && !shown.length" :description="isAdmin() ? '还没有项目，点击右上角新建' : '当前账号未分配项目，请联系管理员'" />
    </div>

    <!-- 编辑项目 -->
    <el-dialog v-model="dlg.visible" :title="dlg.id ? '编辑项目' : '新建项目'" :width="isMobile ? '94%' : '520px'" append-to-body>
      <el-form :model="dlg.form" label-width="80px" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="项目名称" required><el-input v-model="dlg.form.name" maxlength="50" placeholder="如 城区供水一期" /></el-form-item>
        <el-form-item label="项目编号"><el-input v-model="dlg.form.code" maxlength="30" /></el-form-item>
        <el-form-item label="负责人"><el-input v-model="dlg.form.owner" maxlength="30" /></el-form-item>
        <el-form-item label="联系方式"><el-input v-model="dlg.form.contact" maxlength="50" /></el-form-item>
        <el-form-item label="项目地址"><el-input v-model="dlg.form.address" maxlength="100" /></el-form-item>
        <el-form-item label="项目说明"><el-input v-model="dlg.form.description" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
      </el-form>
      <div v-if="dlg.id" class="muted small">修改名称后，项目内设备档案中的项目名称会同步更新。</div>
      <template #footer>
        <el-button @click="dlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="dlg.saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 管理设备 -->
    <el-dialog v-model="dev.visible" :title="`管理项目设备 · ${dev.project?.name || ''}`" :width="isMobile ? '96%' : '760px'" append-to-body>
      <div class="muted small tr-tip">右侧为本项目设备。从左侧加入的设备如已属于其他项目，将转移到本项目。</div>
      <el-transfer
        v-model="dev.selected" :data="dev.all" filterable :filter-method="filterDev" filter-placeholder="编号 / 名称"
        :titles="['其他设备', '本项目设备']" :props="{ key: 'key', label: 'label' }" class="tr">
        <template #default="{ option }">
          <span class="tr-item"><span>{{ option.label }}</span><small v-if="option.project && option.project !== dev.project?.name" class="muted">{{ option.project }}</small></span>
        </template>
      </el-transfer>
      <template #footer>
        <el-button @click="dev.visible = false">取消</el-button>
        <el-button type="primary" :loading="dev.saving" @click="saveDevices">保存（{{ dev.selected.length }} 台）</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, MoreFilled, Edit, Cpu, Delete, User, Location } from '@element-plus/icons-vue';
import StatTile from '../components/StatTile.vue';
import { api, isAdmin, setProject } from '../api.js';
import { fmtTime } from '../utils/format.js';
import { isMobile } from '../utils/responsive.js';

const router = useRouter();
const list = ref([]);
const loading = ref(false);
const kw = ref('');
const unassigned = ref(0);
const shown = computed(() => list.value.filter((p) => !kw.value || [p.name, p.code, p.owner, p.address].some((v) => v && v.includes(kw.value))));
const sum = (k) => list.value.reduce((a, p) => a + p[k], 0);
const pct = (p) => (p.devices ? Math.round((p.online / p.devices) * 100) : 0);

async function load() {
  loading.value = true;
  try {
    list.value = await api.projectList();
    if (isAdmin()) {
      const all = (await api.devices({ size: 2000 })).items;
      unassigned.value = all.filter((d) => !d.project).length;
    }
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const dlg = reactive({ visible: false, id: null, form: {}, saving: false });
function openEdit(p) {
  dlg.id = p?.id ?? null;
  dlg.form = { name: p?.name ?? '', code: p?.code ?? '', owner: p?.owner ?? '', contact: p?.contact ?? '', address: p?.address ?? '', description: p?.description ?? '' };
  dlg.visible = true;
}
async function save() {
  if (!dlg.form.name?.trim()) return ElMessage.warning('请填写项目名称');
  dlg.saving = true;
  try {
    if (dlg.id) await api.updateProject(dlg.id, dlg.form);
    else await api.createProject(dlg.form);
    ElMessage.success('已保存');
    dlg.visible = false;
    load();
  } finally {
    dlg.saving = false;
  }
}

const dev = reactive({ visible: false, project: null, all: [], selected: [], saving: false });
async function openDevices(p) {
  const all = (await api.devices({ size: 2000 })).items;
  dev.project = p;
  dev.all = all.map((d) => ({ key: d.id, label: `${d.name || d.id}（${d.id}）`, project: d.project }));
  dev.selected = all.filter((d) => d.project === p.name).map((d) => d.id);
  dev.visible = true;
}
const filterDev = (q, item) => item.label.toLowerCase().includes(q.toLowerCase());
async function saveDevices() {
  dev.saving = true;
  try {
    await api.setProjectDevices(dev.project.id, dev.selected);
    ElMessage.success('已更新项目设备');
    dev.visible = false;
    load();
  } finally {
    dev.saving = false;
  }
}

async function onCmd(c, p) {
  if (c === 'edit') openEdit(p);
  else if (c === 'devices') openDevices(p);
  else if (c === 'delete') {
    await ElMessageBox.confirm(`删除项目“${p.name}”？项目内 ${p.devices} 台设备会保留，但不再属于任何项目；成员的项目权限一并移除。`, '删除项目', { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' });
    await api.deleteProject(p.id);
    ElMessage.success('已删除');
    load();
  }
}
function viewDevices(p) { router.push({ path: '/devices', query: { project: p.name } }); }
function focusProject(p) {
  setProject(p.name);
  router.push('/');
  ElMessage.success(`已切换到项目：${p.name}`);
}
</script>

<style scoped>
.head-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.pcard { display: flex; flex-direction: column; gap: 12px; transition: box-shadow 0.15s; }
.pcard:hover { box-shadow: var(--shadow-hover); }
.p-head { display: flex; gap: 12px; align-items: center; }
.p-ico { width: 44px; height: 44px; border-radius: 12px; flex: none; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #3b95f5, #1b64be); }
.p-title { flex: 1; min-width: 0; }
.p-name { font-size: 16px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-code { font-size: 12px; margin-top: 2px; }
.p-desc { font-size: 13px; color: var(--ink-2); min-height: 38px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.p-stats { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; background: var(--page-bg); border-radius: 10px; padding: 10px 0; }
.p-stats b { display: block; font-size: 20px; }
.p-stats span { font-size: 12px; color: var(--ink-2); }
.good { color: var(--good-text); }
.crit { color: var(--critical); }
.p-bar { height: 4px; border-radius: 2px; background: var(--hair); overflow: hidden; }
.p-bar span { display: block; height: 100%; background: var(--good); border-radius: 2px; }
.p-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink-2); }
.p-meta span { display: flex; align-items: center; gap: 6px; }
.p-ops { display: flex; gap: 8px; margin-top: auto; }
.small { font-size: 12px; }
.tr-tip { margin-bottom: 10px; }
.tr { display: flex; align-items: center; }
.tr :deep(.el-transfer-panel) { flex: 1; width: auto; }
.tr :deep(.el-transfer-panel__body) { height: 360px; }
.tr :deep(.el-transfer-panel__list.is-filterable) { height: 310px; }
.tr-item { display: inline-flex; gap: 8px; align-items: baseline; }
@media (max-width: 768px) {
  .cards { grid-template-columns: minmax(0, 1fr); }
  .tr { flex-direction: column; gap: 8px; }
  .tr :deep(.el-transfer-panel) { width: 100%; }
  .tr :deep(.el-transfer__buttons) { padding: 0; display: flex; }
}
</style>
