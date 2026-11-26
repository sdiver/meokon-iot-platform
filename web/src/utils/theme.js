import { ref, watch } from 'vue';

/** 参考调色板（已通过色盲安全校验），类别色按固定顺序分配，不循环 */
const PALETTE = {
  light: {
    series: ['#257de0', '#f47230', '#00b894', '#f2a600', '#ee7fac', '#008a17', '#6a4ce2', '#ec4647'],
    seq: '#257de0',
    seqLight: '#84b9f3',
    surface: '#ffffff',
    ink: '#191919',
    ink2: '#666666',
    grid: '#e7e7e7',
    axis: '#c2c2c2',
  },
  dark: {
    series: ['#338ced', '#e76624', '#00a888', '#d28e05', '#e24d8b', '#0aac23', '#9887ef', '#eb6263'],
    seq: '#338ced',
    seqLight: '#1757ac',
    surface: '#1d1e1f',
    ink: '#efefef',
    ink2: '#9c9c9c',
    grid: '#303030',
    axis: '#474747',
  },
};
/** 状态色：保留给 正常/警告/严重/危急，始终配合文字使用 */
export const STATUS_COLORS = { good: '#0aac23', warning: '#fbb315', serious: '#f18a59', critical: '#dc3c3d', neutral: '#9c9c9c' };

const KEY = 'meokon.theme';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const isDark = ref(read() ? read() === 'dark' : prefersDark());
watch(isDark, (v) => {
  document.documentElement.classList.toggle('dark', v);
  try { localStorage.setItem(KEY, v ? 'dark' : 'light'); } catch { /* ignore */ }
}, { immediate: true });

export const pal = () => (isDark.value ? PALETTE.dark : PALETTE.light);
