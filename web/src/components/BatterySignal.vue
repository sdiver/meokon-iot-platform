<template>
  <span class="bs">
    <span class="batt" :title="`${battery?.source || ''} ${battery?.mode || ''}`">
      <template v-if="battery?.source === '外供电'"><el-icon><Connection /></el-icon> 外供电</template>
      <template v-else>
        <span class="bcell" :class="{ low: (battery?.level ?? 100) <= 20 }"><span :style="{ width: (battery?.level ?? 0) + '%' }" /></span>
        {{ battery?.level ?? '-' }}%
      </template>
    </span>
    <span v-if="showSignal" class="sig" :title="`${signal} dBm`">
      <span v-for="i in 4" :key="i" class="sbar" :class="{ on: i <= lvl.bars }" :style="{ height: 3 + i * 2 + 'px' }" />
      {{ signal ?? '-' }}<small>dBm</small>
    </span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { Connection } from '@element-plus/icons-vue';
import { signalLevel } from '../utils/format.js';
const props = defineProps({ battery: Object, signal: Number, showSignal: { type: Boolean, default: true } });
const lvl = computed(() => signalLevel(props.signal));
</script>

<style scoped>
.bs { display: inline-flex; gap: 12px; align-items: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
.batt { display: inline-flex; align-items: center; gap: 4px; }
.bcell { display: inline-block; width: 20px; height: 10px; border: 1.5px solid var(--ink-2); border-radius: 2px; padding: 1px; position: relative; }
.bcell > span { display: block; height: 100%; background: var(--ink-2); border-radius: 1px; }
.bcell.low { border-color: var(--critical); }
.bcell.low > span { background: var(--critical); }
.sig { display: inline-flex; align-items: flex-end; gap: 1px; }
.sbar { width: 3px; background: var(--hair); border-radius: 1px; }
.sbar.on { background: var(--ink-2); }
.sig small { color: var(--ink-2); margin-left: 2px; }
.sig .sbar:last-of-type { margin-right: 4px; }
</style>
