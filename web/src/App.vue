<template>
  <!-- 数据大屏等无框架页面 -->
  <router-view v-if="$route.meta.bare" />

  <!-- 手机布局 -->
  <div v-else-if="isMobile" class="m-layout">
    <header class="m-header">
      <el-button v-if="canBack" text :icon="Icons.ArrowLeft" class="m-back" aria-label="返回" @click="$router.back()" />
      <span v-else class="m-logo"><Logo :size="24" /></span>
      <div class="m-title">{{ $route.meta.title }}<span v-if="ui.demo" class="demo-tag sm">演示</span></div>
      <button class="icon-btn" :aria-label="soundOn ? '关闭报警提示音' : '开启报警提示音'" @click="toggleSound">
        <el-icon :size="18"><component :is="soundOn ? Icons.Bell : Icons.MuteNotification" /></el-icon>
      </button>
      <button class="icon-btn" aria-label="消息中心" @click="msgOpen = true">
        <el-icon :size="18"><Message /></el-icon><span v-if="pending" class="dot-badge" />
      </button>
    </header>
    <main class="m-main" :class="{ full: $route.meta.full }">
      <router-view v-slot="{ Component }">
        <keep-alive include="Devices"><component :is="Component" :key="`${$route.fullPath}|${session.project}`" /></keep-alive>
      </router-view>
    </main>
    <nav class="m-tabbar" aria-label="主导航">
      <router-link v-for="t in tabs" :key="t.path" :to="t.path" class="m-tab" :class="{ on: isActive(t.path) }">
        <span class="m-ico">
          <el-icon :size="22"><component :is="Icons[t.icon]" /></el-icon>
          <span v-if="t.path === '/alarms' && pending" class="m-badge">{{ pending > 99 ? '99+' : pending }}</span>
        </span>
        <span>{{ t.title }}</span>
      </router-link>
      <button class="m-tab" :class="{ on: moreActive }" @click="moreOpen = true">
        <span class="m-ico"><el-icon :size="22"><MoreFilled /></el-icon></span><span>更多</span>
      </button>
    </nav>
    <el-drawer v-model="moreOpen" direction="btt" size="auto" :with-header="false">
      <div class="m-more">
        <template v-for="g in menu" :key="g.key || g.path">
          <div v-if="g.children" class="m-more-group">{{ g.title }}</div>
          <div class="m-more-grid" v-if="g.children">
            <router-link v-for="c in g.children" :key="c.path" :to="c.path" class="m-more-item">{{ c.title }}</router-link>
          </div>
        </template>
        <div class="m-more-group">其他</div>
        <div class="m-more-grid">
          <router-link to="/" class="m-more-item">数据概览</router-link>
          <router-link to="/commands" class="m-more-item">远程配置</router-link>
          <router-link to="/projects" class="m-more-item">项目管理</router-link>
          <router-link to="/statistics" class="m-more-item">统计分析</router-link>
          <router-link to="/screen" class="m-more-item">数据大屏</router-link>
        </div>
        <div class="m-more-foot">
          <span>当前项目</span>
          <ProjectSwitcher class="m-proj" />
        </div>
        <div class="m-more-foot">
          <span>深色模式</span>
          <el-switch v-model="isDark" />
        </div>
        <div class="m-user" v-if="session.user">
          <span class="avatar">{{ initial }}</span>
          <div class="m-user-txt"><b>{{ session.user.name || session.user.username }}</b><span>{{ session.user.username }} · {{ session.user.roleName }}</span></div>
          <el-button size="small" @click="pwOpen = true">修改密码</el-button>
          <el-button size="small" type="danger" plain @click="doLogout">退出</el-button>
        </div>
      </div>
    </el-drawer>
  </div>

  <!-- 桌面布局 -->
  <el-container v-else class="layout">
    <el-aside :width="collapsed ? '64px' : '220px'" class="aside">
      <div class="brand" @click="$router.push('/')">
        <Logo :size="30" />
        <span v-if="!collapsed" class="brand-name">{{ ui.platformName }}</span>
      </div>
      <el-scrollbar class="menu-scroll">
        <el-menu :default-active="active" :default-openeds="openeds" :collapse="collapsed" :collapse-transition="false" router class="menu">
          <template v-for="g in menu" :key="g.key || g.path">
            <el-sub-menu v-if="g.children" :index="g.key">
              <template #title>
                <el-icon><component :is="Icons[g.icon]" /></el-icon>
                <span>{{ g.title }}</span>
              </template>
              <el-menu-item v-for="c in g.children" :key="c.path" :index="c.path">
                {{ c.title }}
                <span v-if="c.path === '/alarms' && pending" class="badge">{{ pending > 99 ? '99+' : pending }}</span>
              </el-menu-item>
            </el-sub-menu>
            <el-menu-item v-else :index="g.path">
              <el-icon><component :is="Icons[g.icon]" /></el-icon>
              <template #title>{{ g.title }}</template>
            </el-menu-item>
          </template>
        </el-menu>
      </el-scrollbar>
      <div class="aside-foot" v-if="!collapsed">
        <span class="dot" :class="liveOk ? 'good' : 'neutral'" />{{ liveOk ? '实时数据已连接' : '正在连接…' }}
      </div>
    </el-aside>
    <el-container class="main-wrap">
      <el-header class="header">
        <el-button text :icon="collapsed ? Icons.Expand : Icons.Fold" @click="collapsed = !collapsed" aria-label="折叠菜单" />
        <span v-if="ui.demo" class="demo-tag" title="演示数据为模拟生成；用户、项目与系统设置为只读">演示环境</span>
        <div class="crumb">
          <span v-if="crumbGroup" class="crumb-group">{{ crumbGroup }}</span>
          <span v-if="crumbGroup" class="crumb-sep">/</span>
          <span>{{ $route.meta.title }}</span>
        </div>
        <div class="spacer" />
        <el-tooltip :content="soundOn ? '报警提示音：开' : '报警提示音：关'" placement="bottom">
          <button class="icon-btn" :class="{ muted: !soundOn }" :aria-label="soundOn ? '关闭报警提示音' : '开启报警提示音'" @click="toggleSound">
            <el-icon :size="18"><component :is="soundOn ? Icons.Bell : Icons.MuteNotification" /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip content="数据大屏" placement="bottom">
          <button class="icon-btn" aria-label="打开数据大屏" @click="openScreen"><el-icon :size="18"><Monitor /></el-icon></button>
        </el-tooltip>
        <el-tooltip :content="isDark ? '切换浅色' : '切换深色'" placement="bottom">
          <button class="icon-btn" aria-label="切换深浅色" @click="isDark = !isDark"><el-icon :size="18"><component :is="isDark ? Icons.Sunny : Icons.Moon" /></el-icon></button>
        </el-tooltip>
        <ProjectSwitcher class="proj" />
        <button class="msg-btn" @click="msgOpen = true">
          <el-icon :size="17"><Message /></el-icon>消息中心
          <span v-if="pending" class="badge">{{ pending > 99 ? '99+' : pending }}</span>
        </button>
        <el-dropdown trigger="click" @command="onUserCmd">
          <button class="user-btn" aria-label="账号菜单">
            <span class="avatar">{{ initial }}</span>
            <span class="u-txt"><b>{{ session.user?.name || session.user?.username }}</b><small>{{ session.user?.roleName }}</small></span>
            <el-icon><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <div class="u-head">
                <b>{{ session.user?.name || session.user?.username }}</b>
                <span>{{ session.user?.username }} · {{ session.user?.roleName }}</span>
                <span>{{ session.user?.allProjects ? '可访问全部项目' : `项目：${session.user?.projects.map((p) => p.name).join('、') || '未分配'}` }}</span>
              </div>
              <el-dropdown-item command="pw" :icon="Icons.Key">修改密码</el-dropdown-item>
              <el-dropdown-item v-if="isAdmin()" command="users" :icon="Icons.User">用户管理</el-dropdown-item>
              <el-dropdown-item command="logout" :icon="Icons.SwitchButton" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="main" :class="{ full: $route.meta.full }">
        <router-view v-slot="{ Component }">
          <keep-alive include="Devices"><component :is="Component" :key="`${$route.fullPath}|${session.project}`" /></keep-alive>
        </router-view>
      </el-main>
    </el-container>
  </el-container>

  <MessageCenter v-if="!$route.meta.bare" v-model="msgOpen" />
  <ChangePasswordDialog v-if="!$route.meta.public" v-model="pwOpen" />
  <ChangePasswordDialog v-if="!$route.meta.public && session.token" :model-value="session.mustChange" forced @done="onForcedDone" />
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElNotification } from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { MoreFilled, Monitor, Message, ArrowDown } from '@element-plus/icons-vue';
import ProjectSwitcher from './components/ProjectSwitcher.vue';
import ChangePasswordDialog from './components/ChangePasswordDialog.vue';
import MessageCenter from './components/MessageCenter.vue';
import { MENU } from './router.js';
import { isDark } from './utils/theme.js';
import { isMobile } from './utils/responsive.js';
import { soundOn, playAlarm, unlockAudio } from './utils/alarmSound.js';
import { api, ui, loadUiConfig, session, isAdmin, logout } from './api.js';
import { onStream, debounce } from './utils/stream.js';

const Logo = (props) => h('svg', { viewBox: '0 0 32 32', width: props.size, height: props.size, 'aria-hidden': 'true' }, [
  h('defs', [h('linearGradient', { id: 'lg', x1: 0, y1: 0, x2: 1, y2: 1 }, [h('stop', { offset: 0, 'stop-color': '#3b95f5' }), h('stop', { offset: 1, 'stop-color': '#1b64be' })])]),
  h('rect', { width: 32, height: 32, rx: 8, fill: 'url(#lg)' }),
  h('path', { d: 'M8 20a8 8 0 0 1 16 0M12 20a4 4 0 0 1 8 0', stroke: '#fff', 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' }),
  h('circle', { cx: 16, cy: 20, r: 1.8, fill: '#fff' }),
]);
Logo.props = ['size'];

const route = useRoute();
const router = useRouter();
const collapsed = ref(window.innerWidth < 1100);
const active = computed(() => route.meta.parent || route.path);
const openeds = MENU.filter((g) => g.children).map((g) => g.key);
/** 按角色过滤菜单 */
const menu = computed(() => MENU.filter((g) => !g.admin || isAdmin()).map((g) => (g.children ? { ...g, children: g.children.filter((c) => !c.admin || isAdmin()) } : g)));
const initial = computed(() => (session.user?.name || session.user?.username || '?').slice(0, 1).toUpperCase());
const pwOpen = ref(false);
async function doLogout() {
  await logout();
  router.replace('/login');
}
function onUserCmd(cmd) {
  if (cmd === 'pw') pwOpen.value = true;
  else if (cmd === 'users') router.push('/users');
  else if (cmd === 'logout') doLogout();
}
function onForcedDone() { session.mustChange = false; router.replace(router.currentRoute.value.fullPath); }
const crumbGroup = computed(() => MENU.find((g) => g.children?.some((c) => c.path === active.value))?.title);

// 手机底部导航
const tabs = [
  { path: '/', title: '总览', icon: 'Odometer' },
  { path: '/devices', title: '设备', icon: 'Cpu' },
  { path: '/devices/map', title: '分布', icon: 'Location' },
  { path: '/alarms', title: '告警', icon: 'Bell' },
];
const moreOpen = ref(false);
watch(() => route.fullPath, () => { moreOpen.value = false; });
const isActive = (p) => (p === '/' ? route.path === '/' : active.value === p);
const moreActive = computed(() => !tabs.some((t) => isActive(t.path)));
const canBack = computed(() => Boolean(route.meta.parent) && window.history.length > 1);

const msgOpen = ref(false);
const pending = ref(0);
const liveOk = ref(false);
const refreshPending = debounce(async () => {
  if (!session.token || route.meta.public) return;
  try { pending.value = (await api.alarmSummary()).pending; } catch { /* ignore */ }
}, 600);

function toggleSound() {
  unlockAudio();
  soundOn.value = !soundOn.value;
}
function openScreen() {
  window.open(router.resolve('/screen').href, '_blank');
}

onStream('frame', () => { liveOk.value = true; });
onStream('alarm', (a) => {
  liveOk.value = true;
  refreshPending();
  if (a.state === 'open') {
    playAlarm();
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

watch(() => [ui.platformName, route.meta.title], () => {
  document.title = `${route.meta.title || ''} · ${ui.platformName}`;
});

watch(() => [session.user?.id, session.project], () => { if (session.user) refreshPending(); });

let timer;
onMounted(() => {
  loadUiConfig();
  refreshPending();
  timer = setInterval(refreshPending, 60000);
  fetch('/api/health').then((r) => { liveOk.value = r.ok; }).catch(() => {});
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<style scoped>
.layout { height: 100%; }
.aside {
  background: var(--side-bg); border-right: 1px solid var(--hair); transition: width 0.2s;
  overflow: hidden; display: flex; flex-direction: column;
}
.brand { height: 60px; display: flex; align-items: center; gap: 10px; padding: 0 17px; cursor: pointer; white-space: nowrap; flex: none; }
.brand-name { font-weight: 700; font-size: 15px; letter-spacing: 0.5px; overflow: hidden; text-overflow: ellipsis; }
.menu-scroll { flex: 1; }
.menu { border-right: none; background: transparent; --el-menu-item-height: 44px; --el-menu-sub-item-height: 40px; padding: 4px 8px; }
.menu:not(.el-menu--collapse) { width: 220px; }
.menu :deep(.el-menu-item), .menu :deep(.el-sub-menu__title) { border-radius: 8px; margin: 2px 0; }
.menu :deep(.el-menu-item.is-active) { background: var(--accent-soft); font-weight: 600; }
.menu :deep(.el-sub-menu .el-menu) { background: transparent; }
.menu.el-menu--collapse { padding: 4px; }
.aside-foot { flex: none; padding: 12px 20px; font-size: 12px; color: var(--ink-2); border-top: 1px solid var(--hair); }
.badge {
  margin-left: auto; background: var(--critical); color: #fff; font-size: 11px; line-height: 16px; min-width: 18px; padding: 0 5px;
  border-radius: 8px; text-align: center; font-variant-numeric: tabular-nums; font-weight: 600;
}
.el-sub-menu .badge { margin-right: 22px; }
.main-wrap { min-width: 0; }
.header { height: 60px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid var(--hair); background: var(--card-bg); padding: 0 16px 0 10px; }
.demo-tag { font-size: 11px; padding: 1px 8px; border-radius: 9px; background: rgba(244, 114, 48, 0.12); color: #d4561c; font-weight: 600; white-space: nowrap; margin-right: 4px; }
.demo-tag.sm { margin-left: 6px; vertical-align: 2px; }
.crumb { font-weight: 600; font-size: 15px; display: flex; gap: 8px; align-items: center; }
.crumb-group { color: var(--ink-2); font-weight: 400; }
.crumb-sep { color: var(--hair-strong); font-weight: 400; }
.spacer { flex: 1; }
.icon-btn {
  position: relative; width: 36px; height: 36px; border-radius: 10px; border: 0; background: transparent; color: var(--ink-2);
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s, color 0.15s;
}
.icon-btn:hover { background: var(--page-bg); color: var(--ink); }
.icon-btn.muted { color: var(--critical); }
.msg-btn {
  display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; margin-left: 6px; border-radius: 10px;
  border: 1px solid var(--hair); background: var(--card-bg); color: var(--ink); font: inherit; font-size: 13px; cursor: pointer;
}
.msg-btn:hover { border-color: var(--accent); color: var(--accent); }
.msg-btn .badge { margin-left: 2px; }
.proj { margin-left: 6px; }
.user-btn {
  display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 8px 0 4px; margin-left: 8px; border-radius: 20px;
  border: 0; background: transparent; cursor: pointer; font: inherit; color: var(--ink);
}
.user-btn:hover { background: var(--page-bg); }
.avatar {
  width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: none;
  background: linear-gradient(135deg, #3b95f5, #1b64be); color: #fff; font-weight: 700; font-size: 14px;
}
.u-txt { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2; }
.u-txt b { font-size: 13px; font-weight: 600; max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.u-txt small { font-size: 11px; color: var(--ink-2); }
.u-head { display: flex; flex-direction: column; gap: 2px; padding: 8px 16px 10px; border-bottom: 1px solid var(--el-border-color-lighter); margin-bottom: 4px; font-size: 12px; color: var(--el-text-color-secondary); max-width: 260px; }
.u-head b { font-size: 14px; color: var(--el-text-color-primary); }
.m-proj { flex: 0 1 200px; }
.m-user { display: flex; align-items: center; gap: 8px; margin: 16px 4px 0; padding-top: 14px; border-top: 1px solid var(--hair); }
.m-user-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 12px; color: var(--ink-2); }
.m-user-txt b { font-size: 14px; color: var(--ink); }
.main { padding: 0; overflow-y: auto; }
.main.full { overflow: hidden; }

/* ---------- 手机 ---------- */
.m-layout { min-height: 100%; background: var(--page-bg); }
.m-header {
  position: sticky; top: 0; z-index: 20; height: 48px; display: flex; align-items: center; gap: 4px;
  padding: 0 8px 0 12px; padding-top: env(safe-area-inset-top); box-sizing: content-box;
  background: var(--card-bg); border-bottom: 1px solid var(--hair);
}
.m-logo { display: inline-flex; margin-right: 4px; }
.m-back { margin-left: -8px; }
.m-title { flex: 1; font-weight: 600; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dot-badge { position: absolute; top: 8px; right: 8px; width: 7px; height: 7px; border-radius: 50%; background: var(--critical); }
.m-main { padding-bottom: calc(60px + env(safe-area-inset-bottom)); }
.m-main.full { height: calc(100vh - 48px - env(safe-area-inset-top)); height: calc(100dvh - 48px - env(safe-area-inset-top)); }
.m-tabbar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 1100; display: flex;
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
.m-more { padding: 4px 4px calc(8px + env(safe-area-inset-bottom)); }
.m-more-group { font-size: 12px; color: var(--ink-2); margin: 10px 4px 6px; }
.m-more-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.m-more-item {
  display: flex; align-items: center; justify-content: center; height: 44px; border-radius: 10px;
  color: var(--ink); text-decoration: none; font-size: 13px; background: var(--page-bg);
}
.m-more-item.router-link-exact-active { color: var(--accent); font-weight: 600; }
.m-more-foot { display: flex; justify-content: space-between; align-items: center; margin: 14px 4px 0; font-size: 14px; }
</style>
