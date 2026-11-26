<template>
  <el-container class="layout">
    <el-aside :width="collapsed ? '64px' : '208px'" class="aside">
      <div class="brand" @click="$router.push('/')">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#257de0" />
          <path d="M8 20a8 8 0 0 1 16 0M12 20a4 4 0 0 1 8 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" />
          <circle cx="16" cy="20" r="1.8" fill="#fff" />
        </svg>
        <span v-if="!collapsed">设备监测平台</span>
      </div>
      <el-menu :default-active="active" :collapse="collapsed" router class="menu">
        <el-menu-item v-for="r in menu" :key="r.path" :index="r.path">
          <el-icon><component :is="Icons[r.meta.icon]" /></el-icon>
          <template #title>
            {{ r.meta.title }}
            <span v-if="r.name === 'alarms' && unacked" class="badge" :aria-label="`${unacked} 条未确认报警`">{{ unacked > 99 ? '99+' : unacked }}</span>
          </template>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container class="main-wrap">
      <el-header class="header">
        <el-button text :icon="collapsed ? Icons.Expand : Icons.Fold" @click="collapsed = !collapsed" aria-label="折叠菜单" />
        <div class="crumb">{{ $route.meta.title }}</div>
        <div class="spacer" />
        <span class="live" :title="'实时连接'"><span class="dot" :class="liveOk ? 'good' : 'neutral'" />{{ liveOk ? '实时' : '连接中' }}</span>
        <el-switch v-model="isDark" inline-prompt :active-icon="Icons.Moon" :inactive-icon="Icons.Sunny" aria-label="深色模式" />
      </el-header>
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <keep-alive include="Devices">
            <component :is="Component" :key="$route.fullPath" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElNotification } from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { isDark } from './utils/theme.js';
import { api } from './api.js';
import { onStream, debounce } from './utils/stream.js';

const route = useRoute();
const router = useRouter();
const collapsed = ref(window.innerWidth < 900);
const menu = router.getRoutes().filter((r) => !r.meta.hidden && r.meta.title).sort((a, b) => routesOrder(a) - routesOrder(b));
function routesOrder(r) {
  return ['/', '/devices', '/alarms', '/statistics', '/frames', '/decoder', '/types', '/system'].indexOf(r.path);
}
const active = computed(() => (route.meta.parent ? `/${route.meta.parent}` : route.path));

const unacked = ref(0);
const liveOk = ref(false);
const refreshBadge = debounce(async () => {
  try {
    const o = await api.alarms({ status: 'open', acked: '0', size: 1 });
    unacked.value = o.total;
  } catch { /* ignore */ }
}, 800);

onStream('frame', () => { liveOk.value = true; });
onStream('alarm', (a) => {
  liveOk.value = true;
  refreshBadge();
  if (a.state === 'open') {
    ElNotification({
      title: `设备报警：${a.label}`,
      message: `设备 ${a.deviceId}`,
      type: 'error',
      duration: 6000,
      onClick: () => router.push(`/devices/${a.deviceId}`),
    });
  }
});
let timer;
onMounted(() => {
  refreshBadge();
  timer = setInterval(refreshBadge, 60000);
  fetch('/api/health').then((r) => { liveOk.value = r.ok; }).catch(() => {});
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<style scoped>
.layout { height: 100%; }
.aside { background: var(--side-bg); border-right: 1px solid var(--hair); transition: width 0.2s; overflow-x: hidden; display: flex; flex-direction: column; }
.brand { height: 56px; display: flex; align-items: center; gap: 10px; padding: 0 18px; font-weight: 600; font-size: 15px; cursor: pointer; white-space: nowrap; }
.menu { border-right: none; background: transparent; flex: 1; }
.menu:not(.el-menu--collapse) { width: 208px; }
.badge { margin-left: 8px; background: var(--critical); color: #fff; font-size: 11px; line-height: 16px; min-width: 18px; padding: 0 5px; border-radius: 8px; text-align: center; font-variant-numeric: tabular-nums; }
.main-wrap { min-width: 0; }
.header { height: 56px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--hair); background: var(--card-bg); }
.crumb { font-weight: 600; }
.spacer { flex: 1; }
.live { font-size: 12px; color: var(--ink-2); margin-right: 8px; }
.main { padding: 0; overflow-y: auto; }
</style>
