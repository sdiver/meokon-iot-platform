<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>报警中心</h2>
        <div class="sub">按设备报警状态位（表三）自动生成报警事件，报警位清除后自动恢复</div>
      </div>
    </div>
    <div class="grid tiles" v-if="s">
      <StatTile label="报警中" status="critical" :value="s.summary.open" unit="条" />
      <StatTile label="近 30 天报警" :value="s.summary.total" unit="次" :sub="`涉及 ${s.summary.devices} 台设备`" />
      <StatTile label="确认率" :value="fmtPct(s.summary.ackRate)" :sub="`已确认 ${s.summary.acked} 次`" />
      <StatTile label="平均持续" :value="s.summary.avgDuration ? fmtDuration(s.summary.avgDuration) : '-'" :sub="`最长 ${s.summary.maxDuration ? fmtDuration(s.summary.maxDuration) : '-'}`" />
    </div>
    <AlarmTable class="mt" :initial="initial" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import AlarmTable from '../components/AlarmTable.vue';
import StatTile from '../components/StatTile.vue';
import { api } from '../api.js';
import { fmtPct, fmtDuration } from '../utils/format.js';

const route = useRoute();
const initial = { status: route.query.status || '', acked: route.query.acked || '' };
const s = ref(null);
onMounted(async () => { s.value = await api.alarmStats(); });
</script>
