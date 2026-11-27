import { onBeforeUnmount, watch } from 'vue';
import { withToken, session } from '../api.js';

/** 全局 SSE 连接，各页面按需订阅 frame / alarm / command 事件 */
const listeners = { frame: new Set(), alarm: new Set(), command: new Set() };
let es = null;

function ensure() {
  if (es || typeof EventSource === 'undefined' || !session.token) return;
  es = new EventSource(withToken('/api/stream'));
  for (const ev of Object.keys(listeners)) {
    es.addEventListener(ev, (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      for (const fn of listeners[ev]) fn(data);
    });
  }
}

export function onStream(event, fn) {
  ensure();
  listeners[event].add(fn);
  onBeforeUnmount(() => listeners[event].delete(fn));
}

/** 合并短时间内的多次触发 */
export function debounce(fn, ms = 1500) {
  let t = null;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/** 登录账号或所选项目变化时重新建立连接 */
watch(() => [session.token, session.project], () => {
  es?.close();
  es = null;
  if (Object.values(listeners).some((s) => s.size)) ensure();
});
