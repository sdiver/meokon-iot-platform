<template>
  <div class="dist">
    <DeviceMap ref="mapRef" :devices="shown" :types="types" height="100%" :legend="false" :zoom-control="!isMobile"
      :fit-padding="isMobile ? [90, 30, 160, 30] : [110, 40, 40, 410]"
      @select="(d) => (selected = d.id)" @detail="(d) => $router.push(`/devices/${d.id}`)" />

    <div class="kpis">
      <button v-for="k in kpis" :key="k.key" class="kpi" :class="{ on: status === k.key }" @click="status = status === k.key ? '' : k.key">
        <span class="k-label"><span v-if="k.dot" class="dot" :class="k.dot" />{{ k.label }}</span>
        <b class="num">{{ k.value }}</b>
      </button>
    </div>

    <aside class="panel" :class="{ collapsed }">
      <div class="p-search">
        <el-input v-model="keyword" placeholder="设备编号 / 名称 / 位置" clearable :prefix-icon="Search" />
        <el-button v-if="isMobile" text :icon="collapsed ? ArrowUp : ArrowDown" @click="collapsed = !collapsed" :aria-label="collapsed ? '展开列表' : '收起列表'" />
      </div>
      <div class="p-count">
        共 {{ filtered.length }} 台<template v-if="status"> · {{ STATUS_TEXT[status] }}</template>
        <span v-if="unlocated" class="muted"> · {{ unlocated }} 台未设置坐标</span>
      </div>
      <el-scrollbar class="p-list">
        <div v-for="d in filtered" :key="d.id" class="p-item" :class="{ sel: selected === d.id, nogeo: d.lat == null }" @click="pick(d)">
          <div class="thumb">
            <img v-if="d.photo" :src="withToken(d.photo)" alt="" />
            <el-icon v-else :size="20"><Cpu /></el-icon>
          </div>
          <div class="p-body">
            <div class="p-name"><b>{{ d.name || d.id }}</b><span v-if="d.name" class="mono muted"> {{ d.id }}</span></div>
            <div class="p-tags">
              <DeviceStatus :status="d.status" />
              <span v-if="d.battery.source === '电池' && d.battery.level != null" class="p-batt" :class="{ low: d.battery.level <= 20 }">电量 {{ d.battery.level }}%</span>
              <span v-else-if="d.battery.source" class="p-batt">外供电</span>
            </div>
            <div class="p-loc">{{ d.location || (d.lat == null ? '未设置坐标' : `${d.lng.toFixed(5)}, ${d.lat.toFixed(5)}`) }}</div>
          </div>
        </div>
        <el-empty v-if="!filtered.length" description="没有匹配的设备" :image-size="60" />
      </el-scrollbar>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search, Cpu, ArrowUp, ArrowDown } from '@element-plus/icons-vue';
import DeviceMap from '../components/DeviceMap.vue';
import DeviceStatus from '../components/DeviceStatus.vue';
import { api, loadTypes, withToken } from '../api.js';
import { isMobile } from '../utils/responsive.js';
import { onStream, debounce } from '../utils/stream.js';

const STATUS_TEXT = { online: '在线', alarm: '报警', offline: '离线', inactive: '未上线' };
const route = useRoute();
const all = ref([]);
const types = ref(new Map());
const keyword = ref('');
const status = ref(route.query.status || '');
const selected = ref('');
const collapsed = ref(isMobile.value);
const mapRef = ref(null);

async function load() { all.value = (await api.devices({ size: 2000 })).items; }
onStream('frame', debounce(load, 3000));
onMounted(async () => {
  await load();
  types.value = await loadTypes();
  if (route.query.focus) setTimeout(() => mapRef.value?.focus(route.query.focus), 400);
});

const matchKw = (d) => {
  const k = keyword.value.trim().toLowerCase();
  return !k || [d.id, d.name, d.location, d.groupName, d.project, d.typeName].some((v) => v && String(v).toLowerCase().includes(k));
};
const matchSt = (d) => !status.value || (status.value === 'offline' ? d.status === 'offline' || d.status === 'inactive' : d.status === status.value);
const filtered = computed(() => all.value.filter((d) => matchKw(d) && matchSt(d)));
const shown = computed(() => filtered.value.filter((d) => d.lat != null));
const unlocated = computed(() => filtered.value.length - shown.value.length);
const kpis = computed(() => {
  const c = (s) => all.value.filter((d) => d.status === s).length;
  return [
    { key: '', label: '设备总数', value: all.value.length },
    { key: 'online', label: '在线', value: c('online'), dot: 'good' },
    { key: 'offline', label: '离线', value: c('offline') + c('inactive'), dot: 'neutral' },
    { key: 'alarm', label: '报警', value: c('alarm'), dot: 'critical' },
  ];
});

function pick(d) {
  selected.value = d.id;
  if (d.lat == null) {
    ElMessage.info('该设备未设置坐标，可在设备档案中设置');
    return;
  }
  if (isMobile.value) collapsed.value = true;
  mapRef.value?.focus(d.id);
}
</script>

<style scoped>
.dist { position: relative; height: calc(100vh - 60px); }
.dist :deep(.dmap) { border-radius: 0; }
.kpis {
  position: absolute; top: 16px; right: 16px; z-index: 600; display: flex; background: var(--card-bg); border-radius: 14px;
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.14); border: 1px solid var(--hair); overflow: hidden;
}
.kpi {
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 20px; border: 0; background: transparent;
  font: inherit; color: var(--ink); cursor: pointer; border-left: 1px solid var(--hair);
}
.kpi:first-child { border-left: 0; }
.kpi.on { background: var(--accent-soft); }
.k-label { font-size: 12px; color: var(--ink-2); white-space: nowrap; }
.kpi b { font-size: 22px; }
.panel {
  position: absolute; top: 16px; left: 16px; bottom: 16px; width: 360px; z-index: 600; display: flex; flex-direction: column;
  background: var(--card-bg); border-radius: 14px; box-shadow: 0 8px 24px rgba(16, 24, 40, 0.14); border: 1px solid var(--hair); overflow: hidden;
}
.p-search { display: flex; gap: 4px; padding: 12px 12px 6px; }
.p-count { font-size: 12px; color: var(--ink-2); padding: 0 14px 8px; border-bottom: 1px solid var(--hair); }
.p-list { flex: 1; }
.p-item { display: flex; gap: 12px; padding: 12px 14px; cursor: pointer; border-bottom: 1px solid var(--hair); transition: background 0.12s; }
.p-item:hover { background: var(--page-bg); }
.p-item.sel { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
.p-item.nogeo { opacity: 0.7; }
.thumb { width: 52px; height: 52px; border-radius: 10px; overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.p-body { min-width: 0; flex: 1; }
.p-name { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-name .mono { font-size: 11px; margin-left: 6px; font-weight: 400; }
.p-tags { display: flex; gap: 8px; align-items: center; margin: 5px 0 3px; }
.p-batt { font-size: 12px; color: var(--ink-2); }
.p-batt.low { color: var(--critical); }
.p-loc { font-size: 12px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

@media (max-width: 768px) {
  .dist { height: 100%; }
  .kpis { top: 10px; left: 10px; right: 10px; }
  .kpi { flex: 1; padding: 8px 10px; align-items: center; }
  .kpi b { font-size: 18px; }
  .panel { top: auto; left: 8px; right: 8px; bottom: calc(8px + 56px + env(safe-area-inset-bottom)); width: auto; height: 46%; transition: height 0.2s; }
  .panel.collapsed { height: 92px; }
}
</style>
