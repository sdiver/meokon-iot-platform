import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', name: 'dashboard', component: () => import('./views/Dashboard.vue'), meta: { title: '监控总览', icon: 'Odometer' } },
  { path: '/devices', name: 'devices', component: () => import('./views/Devices.vue'), meta: { title: '设备管理', icon: 'Cpu' } },
  { path: '/devices/:id', name: 'device', component: () => import('./views/DeviceDetail.vue'), meta: { title: '设备详情', hidden: true, parent: 'devices' } },
  { path: '/alarms', name: 'alarms', component: () => import('./views/Alarms.vue'), meta: { title: '报警中心', icon: 'Bell' } },
  { path: '/statistics', name: 'statistics', component: () => import('./views/Statistics.vue'), meta: { title: '统计分析', icon: 'DataAnalysis' } },
  { path: '/frames', name: 'frames', component: () => import('./views/Frames.vue'), meta: { title: '报文日志', icon: 'Tickets' } },
  { path: '/decoder', name: 'decoder', component: () => import('./views/Decoder.vue'), meta: { title: '报文解析', icon: 'Operation' } },
  { path: '/types', name: 'types', component: () => import('./views/DeviceTypes.vue'), meta: { title: '设备类型', icon: 'Collection' } },
  { path: '/settings', name: 'settings', component: () => import('./views/Settings.vue'), meta: { title: '系统设置', icon: 'Setting' } },
  { path: '/system', name: 'system', component: () => import('./views/System.vue'), meta: { title: '接入说明', icon: 'Guide' } },
];

const router = createRouter({ history: createWebHashHistory(), routes });
router.afterEach((to) => { document.title = `${to.meta.title || ''} · 物联网设备监测平台`; });
export default router;
