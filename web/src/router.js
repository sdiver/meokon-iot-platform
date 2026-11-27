import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', name: 'dashboard', component: () => import('./views/Dashboard.vue'), meta: { title: '数据概览' } },
  { path: '/devices', name: 'devices', component: () => import('./views/Devices.vue'), meta: { title: '设备列表' } },
  { path: '/devices/map', name: 'device-map', component: () => import('./views/DeviceDistribution.vue'), meta: { title: '设备分布', full: true } },
  { path: '/devices/:id', name: 'device', component: () => import('./views/DeviceDetail.vue'), meta: { title: '设备详情', parent: '/devices' } },
  { path: '/maintenance', name: 'maintenance', component: () => import('./views/Maintenance.vue'), meta: { title: '维保记录' } },
  { path: '/commands', name: 'commands', component: () => import('./views/Commands.vue'), meta: { title: '远程配置' } },
  { path: '/alarm-monitor', name: 'alarm-monitor', component: () => import('./views/AlarmMonitor.vue'), meta: { title: '告警监控' } },
  { path: '/alarms', name: 'alarms', component: () => import('./views/Alarms.vue'), meta: { title: '告警列表' } },
  { path: '/statistics', name: 'statistics', component: () => import('./views/Statistics.vue'), meta: { title: '统计分析' } },
  { path: '/frames', name: 'frames', component: () => import('./views/Frames.vue'), meta: { title: '报文日志' } },
  { path: '/decoder', name: 'decoder', component: () => import('./views/Decoder.vue'), meta: { title: '报文解析' } },
  { path: '/types', name: 'types', component: () => import('./views/DeviceTypes.vue'), meta: { title: '设备类型' } },
  { path: '/settings', name: 'settings', component: () => import('./views/Settings.vue'), meta: { title: '系统设置' } },
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
  { key: 'alarm', title: '告警管理', icon: 'Bell', children: [
    { path: '/alarm-monitor', title: '告警监控' },
    { path: '/alarms', title: '告警列表' },
  ] },
  { path: '/statistics', title: '统计分析', icon: 'DataAnalysis' },
  { key: 'system', title: '系统管理', icon: 'Setting', children: [
    { path: '/settings', title: '系统设置' },
    { path: '/system', title: '接入说明' },
    { path: '/frames', title: '报文日志' },
    { path: '/decoder', title: '报文解析' },
    { path: '/types', title: '设备类型' },
  ] },
];

const router = createRouter({ history: createWebHashHistory(), routes });
export default router;
