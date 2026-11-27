import { ref, watch } from 'vue';

const KEY = 'meokon.alarmSound';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

/** 报警提示音开关（默认开启；浏览器要求用户先与页面交互后才能发声） */
export const soundOn = ref(read() !== 'off');
watch(soundOn, (v) => { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* ignore */ } });

let ctx = null;
let lastPlay = 0;

/** 解锁音频（在用户点击时调用） */
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* 不支持 */ }
}

/** 两声短促提示音，3 秒内最多响一次 */
export function playAlarm() {
  if (!soundOn.value) return;
  const now = Date.now();
  if (now - lastPlay < 3000) return;
  lastPlay = now;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    [0, 0.22].forEach((dt, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = i ? 660 : 880;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + dt);
      o.stop(t0 + dt + 0.2);
    });
  } catch { /* 不支持 */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
}
