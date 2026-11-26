<template>
  <!-- 手机布局：顶部标题栏 + 底部导航 -->
  <div v-if="isMobile" class="m-layout">
    <header class="m-header">
      <el-button v-if="canBack" text :icon="Icons.ArrowLeft" class="m-back" aria-label="返回" @click="$router.back()" />
      <span v-else class="m-logo"><Logo :size="24" /></span>
      <div class="m-title">{{ $route.meta.title }}</div>
      <span class="live"><span class="dot" :class="liveOk ? 'good' : 'neutral'" />{{ liveOk ? '实时' : '连接中' }}</span>
      <el-switch v-model="isDark" size="small" inline-prompt :active-icon="Icons.Moon" :inactive-icon="Icons.Sunny" aria-label="深色模式" />
    </header>
    <main class="m-main">
      <router-view v-slot="{ Component }">
        <keep-alive include="Devices">
          <component :is="Component" :key="$route.fullPath" />
        </keep-alive>
      </router-view>
    </main>
    <nav class="m-tabbar" aria-label="主导航">
      <router-link v-for="t in tabs" :key="t.path" :to="t.path" class="m-tab" :class="{ on: isActive(t.path) }">
        <span class="m-ico">
          <el-icon :size="22"><component :is="Icons[t.icon]" /></el-icon>
          <span v-if="t.path === '/alarms' && unacked" class="m-badge">{{ unacked > 99 ? '99+' : unacked }}</span>
        </span>
        <span>{{ t.title }}</span>
      </router-link>
      <button class="m-tab" :class="{ on: moreActive }" @click="moreOpen = true">
        <span class="m-ico"><el-icon :size="22"><MoreFilled /></el-icon></span>
        <span>更多</span>
      </button>
    </nav>
    <el-drawer v-model="moreOpen" direction="btt" size="auto" :with-header="false" class="m-more">
      <div class="m-more-grid">
        <router-link v-for="r in moreMenu" :key="r.path" :to="r.path" class="m-more-item" @click="moreOpen = false">
          <el-icon :size="24"><component :is="Icons[r.meta.icon]" /></el-icon>
          <span>{{ r.meta.title }}</span>
        </router-link>
      </div>
    </el-drawer>
  </div>

  <!-- 桌面布局：侧边菜单 -->
  <el-container v-else class="layout">
    <el-aside :width="collapsed ? '64px' : '208px'" class="aside">
      <div class="brand" @click="$router.push('/')">
        <Logo :size="28" />
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
        <span class="live"><span class="dot" :class="liveOk ? 'good' : 'neutral'" />{{ liveOk ? '实时' : '连接中' }}</span>
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
import { computed, ref, watch, onMounted, onBeforeUnmount, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElNotification } from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { MoreFilled } from '@element-plus/icons-vue';
import { isDark } from './utils/theme.js';
import { isMobile } from './utils/responsive.js';
import { api } from './api.js';
import { onStream, debounce } from './utils/stream.js';

const Logo = (props) => h('svg', { viewBox: '0 0 32 32', width: props.size, height: props.size, 'aria-hidden': 'true' }, [
  h('rect', { width: 32, height: 32, rx: 7, fill: '#257de0' }),
  h('path', { d: 'M8 20a8 8 0 0 1 16 0M12 20a4 4 0 0 1 8 0', stroke: '#fff', 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' }),
  h('circle', { cx: 16, cy: 20, r: 1.8, fill: '#fff' }),
]);
Logo.props = ['size'];

const ORDER = ['/', '/devices', '/alarms', '/statistics', '/frames', '/decoder', '/types', '/settings', '/system'];
const route = useRoute();
const router = useRouter();
const collapsed = ref(window.innerWidth < 1100);
const menu = router.getRoutes().filter((r) => !r.meta.hidden && r.meta.title).sort((a, b) => ORDER.indexOf(a.path) - ORDER.indexOf(b.path));
const active = computed(() => (route.meta.parent ? `/${route.meta.parent}` : route.path));

// 手机底部导航
const tabs = [
  { path: '/', title: '总览', icon: 'Odometer' },
  { path: '/devices', title: '设备', icon: 'Cpu' },
  { path: '/alarms', title: '报警', icon: 'Bell' },
  { path: '/statistics', title: '统计', icon: 'DataAnalysis' },
];
const moreMenu = computed(() => menu.filter((r) => !tabs.some((t) => t.path === r.path)));
const moreOpen = ref(false);
watch(() => route.fullPath, () => { moreOpen.value = false; });
const isActive = (p) => (p === '/' ? route.path === '/' : active.value === p);
const moreActive = computed(() => moreMenu.value.some((r) => r.path === active.value));
const canBack = computed(() => Boolean(route.meta.hidden) && window.history.length > 1);

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
      position: isMobile.value ? 'top-left' : 'top-right',
      customClass: isMobile.value ? 'm-notify' : '',
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
.live { font-size: 12px; color: var(--ink-2); margin-right: 8px; white-space: nowrap; }
.main { padding: 0; overflow-y: auto; }

/* ---------- 手机 ---------- */
.m-layout { min-height: 100%; background: var(--page-bg); }
.m-header {
  position: sticky; top: 0; z-index: 20; height: 48px; display: flex; align-items: center; gap: 8px;
  padding: 0 12px; padding-top: env(safe-area-inset-top); box-sizing: content-box;
  background: var(--card-bg); border-bottom: 1px solid var(--hair);
}
.m-logo { display: inline-flex; }
.m-back { margin-left: -8px; }
.m-title { flex: 1; font-weight: 600; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-main { padding-bottom: calc(60px + env(safe-area-inset-bottom)); }
.m-tabbar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: flex;
  height: 56px; padding-bottom: env(safe-area-inset-bottom); box-sizing: content-box;
  background: var(--card-bg); border-top: 1px solid var(--hair);
}
.m-tab {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  font-size: 11px; color: var(--ink-2); text-decoration: none; background: none; border: 0; padding: 0; font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.m-tab.on { color: var(--accent); font-weight: 600; }
.m-ico { position: relative; display: inline-flex; }
.m-badge {
  position: absolute; top: -4px; left: 14px; background: var(--critical); color: #fff; font-size: 10px; line-height: 15px;
  min-width: 15px; padding: 0 4px; border-radius: 8px; text-align: center; font-weight: 600;
}
.m-more-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 8px 4px calc(8px + env(safe-area-inset-bottom)); }
.m-more-item {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 4px; border-radius: 12px;
  color: var(--ink); text-decoration: none; font-size: 13px; background: var(--page-bg);
}
.m-more-item.router-link-active { color: var(--accent); }
</style>
