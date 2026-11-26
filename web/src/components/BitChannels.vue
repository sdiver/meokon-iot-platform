<template>
  <div class="bits" role="list" :aria-label="`${n} 个通道`">
    <span v-for="i in n" :key="i" role="listitem" class="ch" :class="{ on: (value >>> (i - 1)) & 1 }" :title="`通道 ${i}：${(value >>> (i - 1)) & 1 ? '闭合' : '断开'}`">{{ i }}</span>
  </div>
</template>

<script setup>
defineProps({ value: { type: Number, default: 0 }, n: { type: Number, default: 16 } });
</script>

<style scoped>
.bits { display: flex; flex-wrap: wrap; gap: 4px; }
.ch { width: 26px; height: 22px; border-radius: 4px; border: 1px solid var(--hair); font-size: 11px; display: inline-flex; align-items: center; justify-content: center; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.ch.on { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 600; }
</style>
