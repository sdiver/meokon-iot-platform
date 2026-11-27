import { createRouter, createWebHashHistory } from 'vue-router';
import { session, loadMe, isAdmin, setUnauthorizedHandler } from './api.js';

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { title: '登录', bare: true, public: true } },
  { path: '/', name: 'dashboard', component: () => import('./views/Dashboard.vue'), meta: { title: '数据概览' } },
  { path: '/devices', name: 'devices', component: () => import('./views/Devices.vue'), meta: { title: '设备列表' } },
  { path: '/devices/map', name: 'device-map', component: () => import('./views/DeviceDistribution.vue'), meta: { title: '设备分布', full: true } },
  { path: '/devices/:id', name: 'device', component: () => import('./views/DeviceDetail.vue'), meta: { title: '设备详情', parent: '/devices' } },
  { path: '/maintenance', name: 'maintenance', component: () => import('./views/Maintenance.vue'), meta: { title: '维保记录' } },
  { path: '/projects', name: 'projects', component: () => import('./views/Projects.vue'), meta: { title: '项目管理' } },
  { path: '/users', name: 'users', component: () => import('./views/Users.vue'), meta: { title: '用户管理', admin: true } },
  { path: '/commands', name: 'commands', component: () => import('./views/Commands.vue'), meta: { title: '远程配置' } },
  { path: '/alarm-monitor', name: 'alarm-monitor', component: () => import('./views/AlarmMonitor.vue'), meta: { title: '告警监控' } },
  { path: '/alarms', name: 'alarms', component: () => import('./views/Alarms.vue'), meta: { title: '告警列表' } },
  { path: '/statistics', name: 'statistics', component: () => import('./views/Statistics.vue'), meta: { title: '统计分析' } },
  { path: '/frames', name: 'frames', component: () => import('./views/Frames.vue'), meta: { title: '报文日志' } },
  { path: '/decoder', name: 'decoder', component: () => import('./views/Decoder.vue'), meta: { title: '报文解析' } },
  { path: '/types', name: 'types', component: () => import('./views/DeviceTypes.vue'), meta: { title: '设备类型' } },
  { path: '/settings', name: 'settings', component: () => import('./views/Settings.vue'), meta: { title: '系统设置', admin: true } },
  { path: '/system', name: 'system', component: () => import('./views/System.vue'), meta: { title: '接入说明' } },
  { path: '/screen', name: 'screen', component: () => import('./views/BigScreen.vue'), meta: { title: '数据大屏', bare: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

/** 侧边菜单（分组） */
export const MENU = [
  { path: '/', title: '数据概览', icon: 'Odometer' },
  { key: 'device', title: '设备管理', icon: 'Cpu', children: [
    { path: '/devices', title: '设备列表' },
    { path: '/devices/map', title: '设备分布' },
    { path: '/maintenance', title: '维保记录' },
  ] },
  { path: '/commands', title: '远程配置', icon: 'SetUp' },
  { path: '/projects', title: '项目管理', icon: 'OfficeBuilding' },
  { key: 'alarm', title: '告警管理', icon: 'Bell', children: [
    { path: '/alarm-monitor', title: '告警监控' },
    { path: '/alarms', title: '告警列表' },
  ] },
  { path: '/statistics', title: '统计分析', icon: 'DataAnalysis' },
  { key: 'system', title: '系统管理', icon: 'Setting', children: [
    { path: '/users', title: '用户管理', admin: true },
    { path: '/settings', title: '系统设置', admin: true },
    { path: '/system', title: '接入说明' },
    { path: '/frames', title: '报文日志' },
    { path: '/decoder', title: '报文解析' },
    { path: '/types', title: '设备类型' },
  ] },
];

const router = createRouter({ history: createWebHashHistory(), routes });

/** 登录校验：未登录跳转登录页；管理员页面校验角色 */
router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  if (!session.token) return { path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} };
  if (!session.user) {
    const u = await loadMe();
    if (!u) return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.meta.admin && !isAdmin()) return '/';
  return true;
});
setUnauthorizedHandler(() => {
  const cur = router.currentRoute.value;
  if (!cur.meta.public) router.replace({ path: '/login', query: { redirect: cur.fullPath, expired: '1' } });
});
export default router;
