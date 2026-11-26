<template>
  <div class="rp">
    <el-radio-group :model-value="preset" size="default" @change="pick">
      <el-radio-button v-for="p in presets" :key="p.v" :value="p.v">{{ p.t }}</el-radio-button>
    </el-radio-group>
    <el-date-picker
      v-if="!isMobile"
      v-model="custom" type="datetimerange" range-separator="至" start-placeholder="开始" end-placeholder="结束"
      :shortcuts="[]" style="width: 340px" @change="onCustom" />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { isMobile } from '../utils/responsive.js';

const props = defineProps({ modelValue: Array, days: { type: Array, default: () => [1, 7, 30, 90] } });
const emit = defineEmits(['update:modelValue']);
const presets = props.days.map((d) => ({ v: d, t: d === 1 ? '24 小时' : `${d} 天` }));
const span = props.modelValue ? Math.round((props.modelValue[1] - props.modelValue[0]) / 86400) : 1;
const preset = ref(props.days.includes(span) ? span : null);
const custom = ref(null);

function pick(d) {
  preset.value = d;
  custom.value = null;
  const now = Math.floor(Date.now() / 1000);
  emit('update:modelValue', [now - d * 86400, now]);
}
function onCustom(v) {
  if (!v) return pick(1);
  preset.value = null;
  emit('update:modelValue', [Math.floor(v[0].getTime() / 1000), Math.floor(v[1].getTime() / 1000)]);
}
</script>

<style scoped>
.rp { display: flex; gap: 8px; flex-wrap: wrap; }
@media (max-width: 768px) { .rp { flex: 1 1 100% !important; } .rp :deep(.el-radio-group) { display: flex; width: 100%; } .rp :deep(.el-radio-button) { flex: 1; } .rp :deep(.el-radio-button__inner) { width: 100%; padding: 8px 4px; } }
</style>
