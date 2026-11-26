<template>
  <span class="st"><span class="dot" :class="cls" />{{ text }}</span>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({ status: String });
const map = { online: ['good', '在线'], alarm: ['critical', '报警'], offline: ['neutral', '离线'] };
const cls = computed(() => map[props.status]?.[0] ?? 'neutral');
const text = computed(() => map[props.status]?.[1] ?? '-');
</script>

<style scoped>
.st { white-space: nowrap; }
</style>
