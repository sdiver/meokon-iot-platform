<template>
  <div class="tile card" :class="{ clickable: !!to }" @click="to && $router.push(to)">
    <div class="label">
      <span v-if="status" class="dot" :class="status" />{{ label }}
    </div>
    <div class="value">{{ value }}<span v-if="unit" class="unit">{{ unit }}</span></div>
    <div v-if="sub" class="sub">{{ sub }}</div>
  </div>
</template>

<script setup>
defineProps({ label: String, value: [String, Number], unit: String, sub: String, status: String, to: [String, Object] });
</script>

<style scoped>
.tile { padding: 14px 16px; }
.clickable { cursor: pointer; transition: border-color 0.15s; }
.clickable:hover { border-color: var(--accent); }
.label { font-size: 13px; color: var(--ink-2); }
.value { font-size: 28px; font-weight: 600; margin-top: 6px; line-height: 1.2; }
.unit { font-size: 13px; font-weight: 400; color: var(--ink-2); margin-left: 4px; }
.sub { font-size: 12px; color: var(--ink-2); margin-top: 4px; }
</style>
