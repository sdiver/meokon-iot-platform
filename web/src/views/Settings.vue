<template>
  <div class="page" v-if="data">
    <div class="page-head">
      <div>
        <h2>系统设置</h2>
        <div class="sub">修改后保存即生效：接入端口相关设置会自动重启对应服务，无需重启平台。“平台设置”优先于环境变量。</div>
      </div>
    </div>

    <!-- 接入服务状态 -->
    <div class="grid c4 svc">
      <div v-for="s in svcList" :key="s.key" class="card svc-card">
        <div class="svc-name">{{ s.name }}</div>
        <div class="svc-state"><span class="dot" :class="s.cls" />{{ s.text }}</div>
        <div class="muted small">{{ s.detail }}</div>
        <div v-if="s.error" class="err small">{{ s.error }}</div>
      </div>
    </div>

    <div class="grid c2 mt">
      <div v-for="g in data.groups" :key="g.key" class="card">
        <div class="card-title">
          <span>{{ g.title }}</span>
          <el-button v-if="platformKeys(g.key).length" link type="primary" size="small" @click="resetGroup(g.key)">恢复默认</el-button>
        </div>
        <div class="muted small desc">{{ g.desc }}</div>
        <el-form :label-position="isMobile ? 'top' : 'right'" label-width="140px" @submit.prevent>
          <el-form-item v-for="it in itemsOf(g.key)" :key="it.key">
            <template #label>
              <span>{{ it.label }}</span>
              <el-tag v-if="it.source === 'platform'" size="small" effect="plain" class="src">已修改</el-tag>
            </template>
            <el-switch v-if="it.type === 'bool'" v-model="form[it.key]" />
            <el-select v-else-if="it.type === 'select'" v-model="form[it.key]" class="str-in">
              <el-option v-for="[k, label] in it.options" :key="k" :label="label" :value="k" />
            </el-select>
            <el-input-number
              v-else-if="it.type === 'int' || it.type === 'number'" v-model="form[it.key]" :min="it.min" :max="it.max"
              :step="it.type === 'int' ? 1 : 0.5" :precision="it.type === 'int' ? 0 : undefined" controls-position="right" class="num-in" />
            <template v-else-if="it.secret">
              <el-input
                v-model="form[it.key]" type="password" show-password autocomplete="new-password"
                :placeholder="it.isSet && !cleared[it.key] ? '已设置，留空保持不变' : '未设置'" class="str-in" />
              <el-button v-if="it.isSet && !cleared[it.key]" link type="danger" class="clr" @click="cleared[it.key] = true; form[it.key] = ''">清除</el-button>
              <span v-if="cleared[it.key]" class="muted small clr">保存后清除</span>
            </template>
            <el-input v-else v-model="form[it.key]" :placeholder="it.placeholder" class="str-in" clearable />
            <span v-if="it.unit" class="muted unit">{{ it.unit }}</span>
            <div v-if="it.help" class="help">{{ it.help }}</div>
          </el-form-item>
        </el-form>
        <div v-if="g.key === 'notify' && data.notify" class="notify-st small">
          <span class="dot" :class="data.notify.enabled ? 'good' : 'neutral'" />{{ data.notify.enabled ? '推送已启用' : '推送未启用' }}
          · 成功 {{ data.notify.sent }} 次 · 失败 {{ data.notify.failed }} 次
          <template v-if="data.notify.last"> · 最近一次 {{ data.notify.last.ok ? '成功' : `失败：${data.notify.last.error || data.notify.last.response || data.notify.last.status}` }}</template>
        </div>
        <div class="actions">
          <el-button v-if="g.key === 'notify'" :loading="testing" :disabled="!!dirtyKeys(g.key).length" @click="testNotify">发送测试消息</el-button>
          <span class="muted small" v-if="dirtyKeys(g.key).length">有 {{ dirtyKeys(g.key).length }} 项未保存</span>
          <el-button @click="revert(g.key)" :disabled="!dirtyKeys(g.key).length">撤销</el-button>
          <el-button type="primary" :loading="saving === g.key" :disabled="!dirtyKeys(g.key).length" @click="save(g.key)">保存</el-button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">只读信息</div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item v-for="r in data.readonly" :key="r.label" :label="r.label">
            <span class="mono break">{{ r.value }}</span>
            <div class="help">{{ r.help }}</div>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </div>

    <!-- 数据管理 -->
    <div class="card mt">
      <div class="card-title">数据管理<el-button link type="primary" size="small" @click="loadSummary">刷新</el-button></div>
      <div class="muted small desc">切换到正式运行前，可清空演示数据或模拟器产生的数据。设备首次上报后会自动重新登记。</div>
      <div class="grid tiles" v-if="summary">
        <StatTile label="设备档案" :value="summary.devices" unit="台" />
        <StatTile label="采集数据" :value="summary.readings.toLocaleString()" unit="条" :sub="summary.oldestReading ? `最早 ${fmtSec(summary.oldestReading).slice(0, 10)}` : ''" />
        <StatTile label="原始报文" :value="summary.frames.toLocaleString()" unit="条" />
        <StatTile label="报警记录" :value="summary.alarms.toLocaleString()" unit="条" />
        <StatTile label="数据库大小" :value="(summary.dbBytes / 1048576).toFixed(1)" unit="MB" />
      </div>
      <div class="actions left">
        <el-button type="danger" plain @click="purge('data')">清空数据（保留设备档案）</el-button>
        <el-button type="danger" @click="purge('all')">清空全部（含设备档案）</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import StatTile from '../components/StatTile.vue';
import { api, setToken, loadUiConfig } from '../api.js';
import { fmtSec } from '../utils/format.js';
import { isMobile } from '../utils/responsive.js';

const MASK = '******';
const data = ref(null);
const form = reactive({});
const cleared = reactive({});
const saving = ref('');
const summary = ref(null);
const testing = ref(false);
async function testNotify() {
  testing.value = true;
  try {
    const r = await api.notifyTest();
    if (r.ok) ElMessage.success('测试消息已发送，请在群聊中查看');
    else ElMessage.error({ message: `发送失败：${r.error || r.response || r.status}`, duration: 8000 });
    load();
  } finally {
    testing.value = false;
  }
}

function fill(d) {
  data.value = d;
  for (const it of d.items) {
    form[it.key] = it.secret ? '' : it.value;
    delete cleared[it.key];
  }
}
async function load() { fill(await api.settings()); }
async function loadSummary() { summary.value = await api.dataSummary(); }
onMounted(() => { load(); loadSummary(); });

const itemsOf = (g) => data.value.items.filter((i) => i.group === g);
const platformKeys = (g) => itemsOf(g).filter((i) => i.source === 'platform').map((i) => i.key);
function dirtyKeys(g) {
  return itemsOf(g).filter((it) => {
    if (it.secret) return cleared[it.key] || form[it.key] !== '';
    return form[it.key] !== it.value;
  }).map((i) => i.key);
}
function revert(g) {
  for (const it of itemsOf(g)) {
    form[it.key] = it.secret ? '' : it.value;
    delete cleared[it.key];
  }
}

function report(r, g) {
  const t = r.transports;
  const parts = ['已保存'];
  if (r.restarted?.length) parts.push(`已重启 ${r.restarted.map((x) => x.toUpperCase()).join('、')} 服务`);
  ElMessage.success(parts.join('，'));
  const errs = [t.tcp.error, t.udp.error, t.mqttBroker.error, t.mqtt.error].filter(Boolean);
  if (errs.length && ['tcp', 'udp', 'mqtt'].includes(g)) ElMessage.error({ message: `服务启动异常：${errs.join('；')}`, duration: 8000 });
}

async function save(g) {
  const body = {};
  for (const k of dirtyKeys(g)) {
    const it = data.value.items.find((i) => i.key === k);
    body[k] = it.secret ? (cleared[k] && !form[k] ? '' : form[k]) : form[k];
  }
  // 修改访问令牌时提醒，保存后当前浏览器自动使用新令牌
  if ('authToken' in body) {
    const msg = body.authToken ? '保存后访问平台需要输入该令牌（当前浏览器会自动使用新令牌），请妥善保管。' : '清除后任何人都可以访问平台，确定吗？';
    await ElMessageBox.confirm(msg, '修改访问令牌', { type: 'warning' });
  }
  saving.value = g;
  try {
    const r = await api.saveSettings(body);
    if ('authToken' in body) setToken(body.authToken || '');
    fill(r);
    report(r, g);
    if (g === 'display') loadUiConfig();
  } finally {
    saving.value = '';
  }
}
async function resetGroup(g) {
  await ElMessageBox.confirm('将本组已修改的设置恢复为环境变量 / 默认值？', '恢复默认', { type: 'warning' });
  const keys = platformKeys(g);
  const r = await api.resetSettings(keys);
  if (keys.includes('authToken')) setToken('');
  fill(r);
  report(r, g);
}

async function purge(scope) {
  const what = scope === 'all' ? '全部设备档案、采集数据、报文、报警和命令' : '全部采集数据、报文、报警和命令（保留设备档案）';
  const { value } = await ElMessageBox.prompt(`将永久删除${what}，无法恢复。请输入“确认清空”继续。`, '清空数据', {
    type: 'error', confirmButtonText: '清空', confirmButtonClass: 'el-button--danger', inputPlaceholder: '确认清空',
  }).catch(() => ({}));
  if (value === undefined) return;
  await api.purge(scope, value);
  ElMessage.success('已清空');
  loadSummary();
}

const svcList = computed(() => {
  const t = data.value?.transports;
  if (!t) return [];
  const st = (s) => (!s.enabled ? ['neutral', '未启用'] : s.running ? ['good', '运行中'] : ['critical', '异常']);
  const mk = (key, name, s, detail) => {
    const [cls, text] = st(s);
    return { key, name, cls, text, detail, error: s.enabled ? s.error : null };
  };
  return [
    mk('tcp', 'TCP 接入', t.tcp, `端口 ${t.tcp.port}`),
    mk('udp', 'UDP 接入', t.udp, `端口 ${t.udp.port}`),
    mk('broker', '内置 MQTT Broker', t.mqttBroker, `端口 ${t.mqttBroker.port}${t.mqttBroker.auth ? ' · 需要认证' : ''}`),
    mk('mqtt', 'MQTT 订阅', { ...t.mqtt, running: t.mqtt.connected }, t.mqtt.enabled ? `${t.mqtt.external ? '外部' : '内置'} ${t.mqtt.url} · 已收 ${t.mqtt.received} 条` : '未配置 Broker'),
  ];
});
</script>

<style scoped>
.svc-card { padding: 12px 16px; }
.svc-name { font-size: 13px; color: var(--ink-2); }
.svc-state { font-size: 18px; font-weight: 600; margin: 4px 0; }
.small { font-size: 12px; }
.err { color: var(--critical); margin-top: 4px; }
.desc { margin: -6px 0 14px; }
.src { margin-left: 6px; }
.num-in { width: 180px; }
.str-in { width: 260px; max-width: 100%; }
.unit { margin-left: 8px; }
.clr { margin-left: 8px; }
.help { width: 100%; font-size: 12px; color: var(--ink-2); line-height: 1.5; margin-top: 2px; }
.notify-st { color: var(--ink-2); margin: 0 0 10px; }
.actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.actions.left { justify-content: flex-start; margin-top: 16px; }
.grid.tiles { margin-top: 4px; }
@media (max-width: 768px) {
  .num-in, .str-in { width: 100%; }
  .svc-state { font-size: 15px; }
}
</style>
