<template>
  <span class="st-tag" :class="status">{{ text }}</span>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({ status: String });
const TEXT = { online: '在线', alarm: '报警', offline: '离线', inactive: '未上线' };
const text = computed(() => TEXT[props.status] ?? '-');
</script>
