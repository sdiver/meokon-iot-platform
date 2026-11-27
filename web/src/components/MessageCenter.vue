<template>
  <el-drawer :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" :size="isMobile ? '100%' : '420px'" :with-header="false" append-to-body class="msg-drawer">
    <div class="mc">
      <div class="mc-head">
        <div>
          <div class="mc-title">消息中心</div>
          <div class="mc-sub">{{ total ? `${total} 条报警待处理` : '暂无待处理报警' }}</div>
        </div>
        <el-button text :icon="Close" aria-label="关闭" @click="$emit('update:modelValue', false)" />
      </div>
      <div class="mc-actions" v-if="total">
        <el-button v-if="canWrite()" size="small" @click="recordAll">全部标为已记录</el-button>
        <el-button size="small" type="primary" plain @click="go('/alarms')">进入告警列表</el-button>
      </div>
      <el-scrollbar class="mc-list" v-loading="loading">
        <div v-for="a in items" :key="a.id" class="mc-item" :class="`lv-${a.level}`">
          <div class="mc-row">
            <span class="lv" :class="a.level">{{ LEVEL[a.level] }}</span>
            <b class="mc-label">{{ a.label }}</b>
            <span class="mc-time">{{ fmtAgo(a.startTs) }}</span>
          </div>
          <div class="mc-dev" @click="go(`/devices/${a.deviceId}`)">{{ a.deviceName || a.deviceId }}<span v-if="a.deviceName" class="mono"> · {{ a.deviceId }}</span></div>
          <div class="mc-meta">
            <span>{{ fmtTime(a.startTs) }}</span>
            <span v-if="!a.open" class="ok">已恢复</span>
            <span v-if="a.location">{{ a.location }}</span>
          </div>
          <div v-if="canWrite()" class="mc-ops">
            <el-button size="small" text type="primary" @click="handle(a, 1)">标为已记录</el-button>
            <el-button size="small" text type="primary" @click="handle(a, 2)">处理完成</el-button>
          </div>
        </div>
        <el-empty v-if="!loading && !items.length" description="没有待处理的报警" :image-size="80" />
      </el-scrollbar>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Close } from '@element-plus/icons-vue';
import { api, canWrite } from '../api.js';
import { fmtTime, fmtAgo } from '../utils/format.js';
import { isMobile } from '../utils/responsive.js';
import { onStream, debounce } from '../utils/stream.js';

const props = defineProps({ modelValue: Boolean });
const emit = defineEmits(['update:modelValue']);
const router = useRouter();
const LEVEL = { high: '高', mid: '中', low: '低' };
const items = ref([]);
const total = ref(0);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const r = await api.alarms({ handle: 0, size: 50 });
    items.value = r.items;
    total.value = r.total;
  } finally {
    loading.value = false;
  }
}
watch(() => props.modelValue, (v) => v && load());
onStream('alarm', debounce(() => props.modelValue && load(), 800));

function go(path) {
  emit('update:modelValue', false);
  router.push(path);
}
async function handle(a, status) {
  let note = null;
  if (status === 2) {
    const r = await ElMessageBox.prompt('处理说明（可选）', `处理报警：${a.label}`, { inputPlaceholder: '例如：已派人现场检查' }).catch(() => null);
    if (!r) return;
    note = r.value || null;
  }
  await api.handleAlarms([a.id], status, note);
  ElMessage.success(status === 2 ? '已处理' : '已记录');
  load();
}
async function recordAll() {
  await api.ackAll(undefined, 1);
  ElMessage.success('已全部标为已记录');
  load();
}
</script>

<style scoped>
.mc { display: flex; flex-direction: column; height: 100%; }
.mc-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 4px 4px 12px; }
.mc-title { font-size: 18px; font-weight: 700; }
.mc-sub { font-size: 13px; color: var(--ink-2); margin-top: 2px; }
.mc-actions { display: flex; gap: 8px; padding: 0 4px 12px; border-bottom: 1px solid var(--hair); }
.mc-list { flex: 1; margin-top: 8px; }
.mc-item { padding: 12px 12px 6px 14px; margin: 0 2px 8px; border-radius: 12px; background: var(--page-bg); border-left: 3px solid var(--critical); }
.mc-item.lv-mid { border-left-color: var(--serious); }
.mc-item.lv-low { border-left-color: var(--warning); }
.mc-row { display: flex; align-items: center; gap: 8px; }
.mc-label { flex: 1; font-size: 14px; }
.mc-time { font-size: 12px; color: var(--ink-2); white-space: nowrap; }
.lv { font-size: 11px; line-height: 18px; padding: 0 6px; border-radius: 4px; color: #fff; background: var(--critical); }
.lv.mid { background: var(--serious); }
.lv.low { background: var(--warning); color: #3a2a00; }
.mc-dev { font-size: 13px; margin-top: 6px; cursor: pointer; color: var(--accent); }
.mc-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--ink-2); margin-top: 4px; }
.mc-meta .ok { color: var(--good); }
.mc-ops { display: flex; justify-content: flex-end; margin-top: 2px; }
</style>
