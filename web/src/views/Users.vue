<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>用户管理</h2>
        <div class="sub">维护登录账号、角色与可访问的项目。新建或重置密码后，用户首次登录需修改密码</div>
      </div>
      <el-button type="primary" :icon="Plus" @click="openEdit(null)">新建用户</el-button>
    </div>

    <div class="roles">
      <div v-for="r in ROLE_INFO" :key="r.key" class="card role">
        <span class="role-tag" :class="r.key">{{ r.name }}</span>
        <b class="num">{{ users.filter((u) => u.role === r.key).length }}</b>
        <div class="role-desc">{{ r.desc }}</div>
      </div>
    </div>

    <div class="card mt">
      <div class="filters">
        <el-input v-model="kw" placeholder="用户名 / 姓名 / 手机" clearable :prefix-icon="Search" style="width: 220px" />
        <el-select v-model="role" placeholder="角色" clearable style="width: 130px">
          <el-option v-for="r in ROLE_INFO" :key="r.key" :label="r.name" :value="r.key" />
        </el-select>
      </div>

      <div v-if="isMobile" class="m-list" v-loading="loading">
        <div v-for="u in shown" :key="u.id" class="card m-card">
          <div class="m-row">
            <span class="avatar sm">{{ (u.name || u.username).slice(0, 1) }}</span>
            <div class="grow"><b>{{ u.name || u.username }}</b><div class="muted small">{{ u.username }}</div></div>
            <span class="role-tag" :class="u.role">{{ u.roleName }}</span>
          </div>
          <div class="m-sub">{{ u.allProjects ? '全部项目' : u.projects.map((p) => p.name).join('、') || '未分配项目' }}</div>
          <div class="m-row m-foot">
            <span class="small" :class="u.enabled ? 'ok' : 'muted'">{{ u.enabled ? '已启用' : '已停用' }}</span>
            <span>
              <el-button size="small" @click="openEdit(u)">编辑</el-button>
              <el-button size="small" @click="resetPw(u)">重置密码</el-button>
            </span>
          </div>
        </div>
      </div>
      <el-table v-else :data="shown" v-loading="loading">
        <el-table-column label="用户" min-width="190">
          <template #default="{ row }">
            <div class="u-cell">
              <span class="avatar sm" :class="{ off: !row.enabled }">{{ (row.name || row.username).slice(0, 1) }}</span>
              <div><b>{{ row.name || row.username }}</b><span v-if="row.id === me?.id" class="me">我</span><div class="muted small">{{ row.username }}</div></div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="110"><template #default="{ row }"><span class="role-tag" :class="row.role">{{ row.roleName }}</span></template></el-table-column>
        <el-table-column label="可访问项目" min-width="200">
          <template #default="{ row }">
            <span v-if="row.allProjects" class="all-tag">全部项目</span>
            <template v-else-if="row.projects.length"><el-tag v-for="p in row.projects" :key="p.id" size="small" effect="plain" class="ptag">{{ p.name }}</el-tag></template>
            <span v-else class="warn small">未分配（看不到任何设备）</span>
          </template>
        </el-table-column>
        <el-table-column label="联系方式" min-width="140"><template #default="{ row }">{{ row.phone || '-' }}<div class="muted small">{{ row.email }}</div></template></el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><el-switch :model-value="row.enabled" :disabled="row.id === me?.id" size="small" @change="(v) => toggle(row, v)" /></template>
        </el-table-column>
        <el-table-column label="最后登录" width="170">
          <template #default="{ row }">
            <template v-if="row.lastLoginAt">{{ fmtTime(row.lastLoginAt) }}<div class="muted small">{{ row.lastLoginIp }}</div></template>
            <span v-else class="muted">从未登录</span>
            <div v-if="row.mustChange" class="warn small">待修改初始密码</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="resetPw(row)">重置密码</el-button>
            <el-button link type="danger" :disabled="row.id === me?.id" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新建 / 编辑 -->
    <el-dialog v-model="dlg.visible" :title="dlg.id ? `编辑用户 · ${dlg.form.username}` : '新建用户'" :width="isMobile ? '96%' : '560px'" append-to-body>
      <el-form :model="dlg.form" label-width="90px" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="用户名" required><el-input v-model="dlg.form.username" :disabled="!!dlg.id" maxlength="32" placeholder="3~32 位字母、数字或 _ . @ -" /></el-form-item>
        <el-form-item v-if="!dlg.id" label="初始密码" required>
          <el-input v-model="dlg.form.password" maxlength="64" placeholder="至少 8 位，含字母和数字">
            <template #append><el-button @click="dlg.form.password = genPw()">随机生成</el-button></template>
          </el-input>
          <div class="muted small">用户首次登录时需修改此密码</div>
        </el-form-item>
        <el-form-item label="姓名"><el-input v-model="dlg.form.name" maxlength="30" /></el-form-item>
        <el-form-item label="角色" required>
          <el-radio-group v-model="dlg.form.role" :disabled="dlg.id === me?.id" class="role-radio">
            <el-radio v-for="r in ROLE_INFO" :key="r.key" :value="r.key" border>
              <b>{{ r.name }}</b><span class="muted small">{{ r.short }}</span>
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="dlg.form.role !== 'admin'" label="项目权限">
          <div class="pp">
            <el-switch v-model="dlg.form.allProjects" active-text="可访问全部项目" />
            <el-select v-if="!dlg.form.allProjects" v-model="dlg.form.projectIds" multiple filterable placeholder="选择可访问的项目" style="width: 100%">
              <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item v-else label="项目权限"><span class="muted">管理员可访问全部项目</span></el-form-item>
        <el-form-item label="手机号"><el-input v-model="dlg.form.phone" maxlength="20" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="dlg.form.email" maxlength="60" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="dlg.form.remark" maxlength="200" /></el-form-item>
        <el-form-item label="启用账号"><el-switch v-model="dlg.form.enabled" :disabled="dlg.id === me?.id" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="dlg.saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { api, session } from '../api.js';
import { fmtTime } from '../utils/format.js';
import { isMobile } from '../utils/responsive.js';

const ROLE_INFO = [
  { key: 'admin', name: '管理员', short: '全部权限', desc: '管理用户、项目、系统设置，访问全部项目' },
  { key: 'operator', name: '运维人员', short: '查看 + 操作', desc: '在所属项目内维护设备、处理告警、下发配置' },
  { key: 'viewer', name: '只读用户', short: '仅查看', desc: '在所属项目内查看数据与告警，不能修改' },
];
const me = computed(() => session.user);
const users = ref([]);
const projects = ref([]);
const loading = ref(false);
const kw = ref('');
const role = ref('');
const shown = computed(() => users.value.filter((u) => (!role.value || u.role === role.value)
  && (!kw.value || [u.username, u.name, u.phone, u.email].some((v) => v && v.toLowerCase().includes(kw.value.toLowerCase())))));

async function load() {
  loading.value = true;
  try {
    [users.value, projects.value] = await Promise.all([api.users(), api.projectList(true)]);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function genPw() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const d = '23456789';
  const pick = (s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  const chars = [pick(a), pick(a), pick(d), pick(d), ...Array.from({ length: 6 }, () => pick(a + d))];
  return chars.sort(() => Math.random() - 0.5).join('');
}

const dlg = reactive({ visible: false, id: null, form: {}, saving: false });
function openEdit(u) {
  dlg.id = u?.id ?? null;
  dlg.form = {
    username: u?.username ?? '', password: u ? '' : genPw(), name: u?.name ?? '', role: u?.role ?? 'operator',
    allProjects: u ? u.allProjects && u.role !== 'admin' : false, projectIds: u?.projects.map((p) => p.id) ?? [],
    phone: u?.phone ?? '', email: u?.email ?? '', remark: u?.remark ?? '', enabled: u ? u.enabled : true,
  };
  dlg.visible = true;
}
async function save() {
  dlg.saving = true;
  try {
    const body = { ...dlg.form };
    if (dlg.id) {
      delete body.username;
      delete body.password;
      await api.updateUser(dlg.id, body);
      ElMessage.success('已保存');
    } else {
      await api.createUser(body);
      await ElMessageBox.alert(`账号：${body.username}\n初始密码：${body.password}\n\n请将账号和初始密码告知用户，首次登录时需修改密码。`, '用户已创建', { confirmButtonText: '我已记下' });
    }
    dlg.visible = false;
    load();
  } finally {
    dlg.saving = false;
  }
}
async function toggle(u, v) {
  await api.updateUser(u.id, { enabled: v });
  ElMessage.success(v ? '已启用' : '已停用，该用户已被强制下线');
  load();
}
async function resetPw(u) {
  const pw = genPw();
  const r = await ElMessageBox.prompt(`为 ${u.name || u.username} 设置新的临时密码（重置后该用户将被强制下线，下次登录需修改密码）`, '重置密码', {
    inputValue: pw, confirmButtonText: '重置', inputValidator: (v) => (v && v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v)) || '至少 8 位，含字母和数字',
  }).catch(() => null);
  if (!r) return;
  await api.resetUserPassword(u.id, r.value);
  await ElMessageBox.alert(`账号：${u.username}\n临时密码：${r.value}`, '密码已重置', { confirmButtonText: '我已记下' });
  load();
}
async function remove(u) {
  await ElMessageBox.confirm(`删除用户“${u.name || u.username}”？此操作不可恢复。`, '删除用户', { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' });
  await api.deleteUser(u.id);
  ElMessage.success('已删除');
  load();
}
</script>

<style scoped>
.roles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.role { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 4px 12px; }
.role b { font-size: 24px; justify-self: end; }
.role-desc { grid-column: 1 / -1; font-size: 12px; color: var(--ink-2); }
.role-tag { display: inline-block; font-size: 12px; padding: 2px 10px; border-radius: 10px; white-space: nowrap; }
.role-tag.admin { background: rgba(106, 76, 226, 0.12); color: #6a4ce2; }
.role-tag.operator { background: rgba(37, 125, 224, 0.12); color: var(--accent); }
.role-tag.viewer { background: rgba(127, 127, 127, 0.14); color: #6b6b6b; }
html.dark .role-tag.admin { color: #9887ef; }
html.dark .role-tag.viewer { color: #b0b0b0; }
.u-cell { display: flex; align-items: center; gap: 10px; }
.avatar { width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: none; background: linear-gradient(135deg, #3b95f5, #1b64be); color: #fff; font-weight: 700; }
.avatar.sm { width: 34px; height: 34px; font-size: 14px; }
.avatar.off { background: #b8bcc4; }
.me { margin-left: 6px; font-size: 11px; padding: 0 6px; border-radius: 4px; background: var(--accent-soft); color: var(--accent); }
.all-tag { font-size: 12px; color: var(--good-text); }
.ptag { margin: 2px 4px 2px 0; }
.small { font-size: 12px; }
.warn { color: #c27c00; }
.ok { color: var(--good-text); }
.pp { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.role-radio { display: flex; flex-direction: column; align-items: stretch; gap: 6px; width: 100%; }
.role-radio :deep(.el-radio) { margin: 0; height: auto; padding: 8px 12px; }
.role-radio :deep(.el-radio__label) { display: flex; gap: 10px; align-items: baseline; }
.m-foot { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--hair); }
@media (max-width: 768px) { .roles { grid-template-columns: minmax(0, 1fr); } }
</style>
