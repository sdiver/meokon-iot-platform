<template>
  <el-select
    v-if="options.length > 1 || session.project"
    :model-value="session.project" @update:model-value="onChange" class="psw" placeholder="全部项目"
    :teleported="true" aria-label="切换项目" :suffix-icon="OfficeBuilding">
    <el-option v-if="session.user?.allProjects || options.length > 1" value="" :label="session.user?.allProjects ? '全部项目' : '我的全部项目'" />
    <el-option v-for="p in options" :key="p" :label="p" :value="p" />
  </el-select>
  <span v-else-if="options.length === 1" class="psw-one"><el-icon><OfficeBuilding /></el-icon>{{ options[0] }}</span>
</template>

<script setup>
import { ref, watch } from 'vue';
import { OfficeBuilding } from '@element-plus/icons-vue';
import { api, session, setProject } from '../api.js';

const options = ref([]);
async function load() {
  if (!session.user) return;
  if (session.user.allProjects) {
    options.value = (await api.projectList(true)).map((p) => p.name);
  } else {
    options.value = session.user.projects.map((p) => p.name);
  }
}
watch(() => session.user?.id, load, { immediate: true });
function onChange(v) { setProject(v); }
</script>

<style scoped>
.psw { width: 170px; }
.psw :deep(.el-select__wrapper) { border-radius: 10px; min-height: 36px; }
.psw-one { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-2); padding: 0 8px; white-space: nowrap; }
</style>
