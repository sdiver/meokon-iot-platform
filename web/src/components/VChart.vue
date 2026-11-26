<template>
  <div ref="el" class="vchart" :style="{ height: typeof height === 'number' ? height + 'px' : height }" role="img" :aria-label="label" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue';
import * as echarts from 'echarts';
import { isDark } from '../utils/theme.js';

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: [Number, String], default: 280 },
  label: { type: String, default: '图表' },
});
const emit = defineEmits(['click']);
const el = ref(null);
const chart = shallowRef(null);
let ro;

function init() {
  chart.value?.dispose();
  chart.value = echarts.init(el.value, null, { renderer: 'canvas' });
  chart.value.on('click', (p) => emit('click', p));
  chart.value.setOption(props.option, true);
}

onMounted(() => {
  init();
  ro = new ResizeObserver(() => chart.value?.resize());
  ro.observe(el.value);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  chart.value?.dispose();
});
watch(() => props.option, (o) => chart.value?.setOption(o, true));
watch(isDark, () => init());
</script>

<style scoped>
.vchart { width: 100%; min-width: 0; }
</style>
