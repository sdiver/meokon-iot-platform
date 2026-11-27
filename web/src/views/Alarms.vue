<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>告警列表</h2>
        <div class="sub">按设备报警状态位（表三）生成；处理流程：未处理 → 已记录（知悉）→ 已处理</div>
      </div>
    </div>
    <div class="grid c4" v-if="s">
      <div v-for="c in cards" :key="c.label" class="card acard">
        <span class="a-ico" :style="{ background: c.bg, color: c.color }"><el-icon :size="22"><component :is="c.icon" /></el-icon></span>
        <div>
          <div class="a-label">{{ c.label }}</div>
          <div class="a-num num">{{ c.value }}</div>
          <div class="a-sub">{{ c.sub }}</div>
        </div>
      </div>
    </div>
    <div class="card mt">
      <AlarmTable :initial="initial" @changed="loadSummary" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { Monitor, BellFilled, Top, Bottom } from '@element-plus/icons-vue';
import AlarmTable from '../components/AlarmTable.vue';
import { api } from '../api.js';
import { onStream, debounce } from '../utils/stream.js';

const route = useRoute();
const initial = { handle: route.query.handle ?? '', level: route.query.level || '' };
const s = ref(null);
async function loadSummary() { s.value = await api.alarmSummary(); }
onStream('alarm', debounce(loadSummary, 800));
onMounted(loadSummary);

const cards = computed(() => [
  { label: '告警设备', value: s.value.devices, sub: '存在未处理告警的设备', icon: Monitor, bg: 'rgba(241,138,89,.14)', color: '#e76624' },
  { label: '未处理告警', value: s.value.pending, sub: `累计 ${s.value.total} 条 · 已处理 ${s.value.handled}`, icon: BellFilled, bg: 'rgba(220,60,61,.12)', color: '#dc3c3d' },
  { label: '高报警（超上限）', value: s.value.upper, sub: '未处理中', icon: Top, bg: 'rgba(238,127,172,.16)', color: '#d0447c' },
  { label: '低报警（低于下限）', value: s.value.lower, sub: '未处理中', icon: Bottom, bg: 'rgba(37,125,224,.12)', color: '#257de0' },
]);
</script>

<style scoped>
.acard { display: flex; gap: 14px; align-items: center; }
.a-ico { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none; }
.a-label { font-size: 13px; color: var(--ink-2); }
.a-num { font-size: 28px; font-weight: 700; line-height: 1.2; }
.a-sub { font-size: 12px; color: var(--ink-3); }
@media (max-width: 768px) {
  .acard { padding: 12px; gap: 10px; }
  .a-ico { width: 36px; height: 36px; }
  .a-num { font-size: 22px; }
  .a-sub { display: none; }
}
</style>
