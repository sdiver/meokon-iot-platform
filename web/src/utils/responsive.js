import { ref } from 'vue';

/** 手机宽度断点 */
export const MOBILE_MAX = 768;
export const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < MOBILE_MAX);
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => { isMobile.value = window.innerWidth < MOBILE_MAX; }, { passive: true });
}
