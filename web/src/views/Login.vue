<template>
  <div class="login">
    <!-- 左侧品牌区 -->
    <section class="brand">
      <div class="brand-top">
        <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#2f8cf0" />
          <path d="M8 20a8 8 0 0 1 16 0M12 20a4 4 0 0 1 8 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" />
          <circle cx="16" cy="20" r="1.8" fill="#fff" />
        </svg>
        <span>{{ ui.platformName }}</span>
      </div>

      <svg class="scene" viewBox="0 0 600 470" role="img" aria-label="物联网设备通过无线网络接入云平台的示意图">
        <defs>
          <linearGradient id="lgTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c4f9c" /><stop offset="1" stop-color="#0f2f66" /></linearGradient>
          <linearGradient id="lgSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#123c7d" /><stop offset="1" stop-color="#0a2148" /></linearGradient>
          <linearGradient id="srvTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fdcff" /><stop offset="1" stop-color="#3b9cff" /></linearGradient>
          <linearGradient id="srvL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f86f0" /><stop offset="1" stop-color="#1650b0" /></linearGradient>
          <linearGradient id="srvR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e6ad6" /><stop offset="1" stop-color="#0f3c8c" /></linearGradient>
          <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#3aa0ff" stop-opacity=".45" /><stop offset="1" stop-color="#3aa0ff" stop-opacity="0" /></radialGradient>
          <filter id="blur"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <ellipse cx="300" cy="330" rx="270" ry="120" fill="url(#glow)" />
        <!-- 平台底座 -->
        <polygon points="80,318 300,428 520,318 520,334 300,444 80,334" fill="#071a3a" />
        <polygon points="80,318 300,428 300,444 80,334" fill="url(#lgSide)" />
        <polygon points="300,428 520,318 520,334 300,444" fill="#0b2752" />
        <polygon points="80,318 300,208 520,318 300,428" fill="url(#lgTop)" stroke="#4fb8ff" stroke-opacity=".55" stroke-width="1.5" />
        <!-- 网格 -->
        <g stroke="#5ec8ff" stroke-opacity=".12">
          <line v-for="i in 7" :key="'a' + i" :x1="80 + i * 27.5" :y1="318 - i * 13.75" :x2="300 + i * 27.5" :y2="428 - i * 13.75" />
          <line v-for="i in 7" :key="'b' + i" :x1="80 + i * 27.5" :y1="318 + i * 13.75" :x2="300 + i * 27.5" :y2="208 + i * 13.75" />
        </g>
        <!-- 数据链路 -->
        <g fill="none" stroke="#5ec8ff" stroke-width="2" stroke-linecap="round" class="links">
          <path d="M165 323 Q230 330 300 318" />
          <path d="M435 323 Q370 330 300 318" />
          <path d="M300 388 Q300 360 300 330" />
        </g>
        <!-- 设备底座 -->
        <g fill="#163f80" stroke="#5ec8ff" stroke-opacity=".7">
          <polygon points="125,323 165,303 205,323 165,343" />
          <polygon points="395,323 435,303 475,323 435,343" />
          <polygon points="260,388 300,368 340,388 300,408" />
        </g>
        <!-- 压力表 -->
        <g transform="translate(165 288)">
          <rect x="-4" y="12" width="8" height="18" fill="#2a6fd0" />
          <circle r="22" fill="#0e2b5c" stroke="#8fdcff" stroke-width="3" />
          <path d="M-14 6 A16 16 0 1 1 14 6" fill="none" stroke="#3b9cff" stroke-width="3" stroke-dasharray="3 3" />
          <line x1="0" y1="0" x2="10" y2="-9" stroke="#ffb547" stroke-width="3" stroke-linecap="round" class="needle" />
          <circle r="3" fill="#ffb547" />
        </g>
        <!-- 信号塔 -->
        <g transform="translate(435 300)">
          <path d="M-12 22 L0 -34 L12 22 M-8 4 H8 M-5 -12 H5" stroke="#8fdcff" stroke-width="3" fill="none" stroke-linejoin="round" />
          <circle cy="-36" r="4" fill="#ffb547" />
          <path d="M-14 -46 a20 20 0 0 1 28 0 M-22 -54 a32 32 0 0 1 44 0" stroke="#5ec8ff" stroke-width="2.5" fill="none" stroke-linecap="round" class="waves" />
        </g>
        <!-- 液位传感器（水滴） -->
        <g transform="translate(300 350)">
          <path d="M0 -26 C12 -10 18 -2 18 8 a18 18 0 0 1 -36 0 C-18 -2 -12 -10 0 -26 Z" fill="#1f7ff0" stroke="#8fdcff" stroke-width="2.5" />
          <path d="M-9 9 q9 -6 18 0" stroke="#bfe9ff" stroke-width="2.5" fill="none" stroke-linecap="round" />
        </g>
        <!-- 云平台主机 -->
        <g>
          <polygon points="250,250 300,275 300,333 250,308" fill="url(#srvL)" />
          <polygon points="300,275 350,250 350,308 300,333" fill="url(#srvR)" />
          <polygon points="250,250 300,225 350,250 300,275" fill="url(#srvTop)" />
          <g stroke="#8fdcff" stroke-opacity=".75" stroke-width="2">
            <line x1="258" y1="270" x2="292" y2="287" /><line x1="258" y1="284" x2="292" y2="301" /><line x1="258" y1="298" x2="292" y2="315" />
          </g>
          <g fill="#2fd36a"><circle cx="318" cy="283" r="2.6" class="led" /><circle cx="330" cy="277" r="2.6" class="led d2" /><circle cx="342" cy="271" r="2.6" class="led d3" /></g>
        </g>
        <!-- 云 -->
        <g transform="translate(300 128)" class="cloud">
          <path d="M-46 18 a22 22 0 0 1 6 -43 a30 30 0 0 1 56 -6 a24 24 0 0 1 30 49 Z" fill="#0f2f66" stroke="#5ec8ff" stroke-width="2.5" />
          <path d="M-14 -2 l10 10 l20 -20" stroke="#2fd36a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </g>
        <g stroke="#5ec8ff" stroke-width="2" stroke-linecap="round" class="uplink">
          <line x1="288" y1="215" x2="288" y2="160" /><line x1="312" y1="160" x2="312" y2="215" />
        </g>
        <!-- 浮动光点 -->
        <g fill="#8fdcff">
          <circle v-for="(d, i) in dots" :key="i" :cx="d[0]" :cy="d[1]" :r="d[2]" class="dot" :style="{ animationDelay: `${i * 0.7}s` }" />
        </g>
      </svg>

      <div class="brand-copy">
        <h1>{{ ui.platformName }}</h1>
        <p>{{ ui.login?.slogan || '设备接入 · 实时监测 · 告警处置 · 数据分析' }}</p>
        <ul class="feats">
          <li><el-icon><Connection /></el-icon>TCP / UDP / MQTT / NB-IoT 多方式接入</li>
          <li><el-icon><Odometer /></el-icon>压力、液位、流量、水质等 100 余种传感器</li>
          <li><el-icon><Bell /></el-icon>报警实时推送，处置全程留痕</li>
        </ul>
      </div>
    </section>

    <!-- 右侧登录 -->
    <section class="panel">
      <div class="form-box">
        <div class="m-brand">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#2f8cf0" /><path d="M8 20a8 8 0 0 1 16 0M12 20a4 4 0 0 1 8 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" /><circle cx="16" cy="20" r="1.8" fill="#fff" /></svg>
          <span>{{ ui.platformName }}</span>
        </div>
        <h2>欢迎登录</h2>
        <div class="sub">请使用平台账号登录</div>
        <el-alert v-if="$route.query.expired" title="登录已过期，请重新登录" type="warning" :closable="false" show-icon class="alert" />
        <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent="submit" @keyup.enter="submit">
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" autocomplete="username" clearable />
          </el-form-item>
          <el-form-item prop="password">
            <el-input v-model="form.password" type="password" show-password placeholder="密码" :prefix-icon="Lock" autocomplete="current-password" />
          </el-form-item>
          <div class="row">
            <el-checkbox v-model="form.remember">7 天内自动登录</el-checkbox>
            <el-popover placement="top" :width="220" trigger="click" content="请联系系统管理员在“用户管理”中重置密码。">
              <template #reference><a class="link">忘记密码？</a></template>
            </el-popover>
          </div>
          <div v-if="error" class="err" role="alert"><el-icon><WarningFilled /></el-icon>{{ error }}</div>
          <el-button type="primary" class="btn" :loading="loading" native-type="submit" @click.prevent="submit">登 录</el-button>
        </el-form>
      </div>
      <footer class="foot">
        <div v-if="ui.login?.copyright">{{ ui.login.copyright }}</div>
        <div v-if="ui.login?.icp"><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">{{ ui.login.icp }}</a></div>
        <div v-if="!ui.login?.copyright && !ui.login?.icp">MEOKON 智能无线终端通讯协议 V3.3</div>
      </footer>
    </section>

    <ChangePasswordDialog v-model="changeOpen" forced :old-password="form.password" @done="afterLogin" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { User, Lock, WarningFilled, Connection, Odometer, Bell } from '@element-plus/icons-vue';
import ChangePasswordDialog from '../components/ChangePasswordDialog.vue';
import { api, ui, loadUiConfig, session, setToken } from '../api.js';

const route = useRoute();
const router = useRouter();
const formRef = ref(null);
const loading = ref(false);
const error = ref('');
const changeOpen = ref(false);
const form = reactive({ username: '', password: '', remember: true });
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};
const dots = [[120, 120, 2.5], [500, 150, 2], [70, 230, 1.8], [540, 250, 2.2], [210, 90, 1.6], [420, 70, 2.4], [560, 400, 1.8], [40, 400, 2]];

onMounted(() => {
  loadUiConfig().then(() => { document.title = `登录 · ${ui.platformName}`; });
  try { form.username = localStorage.getItem('meokon.lastUser') || ''; } catch { /* ignore */ }
});

async function submit() {
  if (loading.value) return;
  error.value = '';
  try { await formRef.value.validate(); } catch { return; }
  loading.value = true;
  try {
    const r = await api.login({ username: form.username.trim(), password: form.password, remember: form.remember });
    setToken(r.token);
    session.user = r.user;
    try { localStorage.setItem('meokon.lastUser', form.username.trim()); } catch { /* ignore */ }
    if (r.user.mustChange) changeOpen.value = true;
    else afterLogin();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
function afterLogin() {
  session.mustChange = false;
  const to = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && route.query.redirect !== '/login' ? route.query.redirect : '/';
  router.replace(to);
}
</script>

<style scoped>
.login { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(420px, 1fr); background: #fff; }
.brand {
  position: relative; overflow: hidden; display: flex; flex-direction: column; color: #e6f0ff; padding: 36px 56px 48px;
  background:
    radial-gradient(ellipse 70% 60% at 50% 45%, rgba(47, 140, 240, 0.25), transparent 70%),
    repeating-linear-gradient(0deg, transparent 0 39px, rgba(94, 200, 255, 0.05) 39px 40px),
    repeating-linear-gradient(90deg, transparent 0 39px, rgba(94, 200, 255, 0.05) 39px 40px),
    linear-gradient(160deg, #061433 0%, #0a2557 55%, #0c1f45 100%);
}
.brand-top { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 700; letter-spacing: 1px; }
.scene { flex: 1; width: 100%; max-height: 520px; margin: 12px auto 0; display: block; min-height: 0; }
.brand-copy { max-width: 560px; }
.brand-copy h1 { margin: 0; font-size: 34px; font-weight: 800; letter-spacing: 3px; background: linear-gradient(90deg, #fff, #9fd8ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
.brand-copy p { margin: 10px 0 18px; font-size: 16px; color: #9fb7da; letter-spacing: 2px; }
.feats { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.feats li { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #c6d8f2; }
.feats .el-icon { width: 28px; height: 28px; border-radius: 8px; background: rgba(94, 200, 255, 0.14); color: #7fd0ff; flex: none; }

/* 动画 */
.links path { stroke-dasharray: 6 8; animation: flow 1.4s linear infinite; }
.uplink line { stroke-dasharray: 4 6; animation: flow 1s linear infinite; }
@keyframes flow { to { stroke-dashoffset: -28; } }
.waves { animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.3; } }
.needle { transform-origin: 0 0; animation: sway 3s ease-in-out infinite; }
@keyframes sway { 50% { transform: rotate(18deg); } }
.led { animation: pulse 1.2s ease-in-out infinite; }
.led.d2 { animation-delay: 0.4s; }
.led.d3 { animation-delay: 0.8s; }
.cloud { animation: float 4s ease-in-out infinite; }
@keyframes float { 50% { transform: translate(300px, 120px); } }
.dot { animation: twinkle 3.5s ease-in-out infinite; }
@keyframes twinkle { 50% { opacity: 0.2; } }
@media (prefers-reduced-motion: reduce) { .links path, .uplink line, .waves, .needle, .led, .cloud, .dot { animation: none; } }

/* 登录面板 */
.panel { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 32px 24px; position: relative; }
.form-box { width: 100%; max-width: 380px; margin: auto 0; }
.m-brand { display: none; align-items: center; gap: 10px; font-size: 17px; font-weight: 700; margin-bottom: 28px; color: #191919; }
.form-box h2 { margin: 0; font-size: 28px; font-weight: 700; color: #191919; }
.sub { color: #8a8f98; margin: 6px 0 28px; font-size: 14px; }
.alert { margin-bottom: 16px; }
.form-box :deep(.el-input__wrapper) { border-radius: 10px; padding: 2px 14px; box-shadow: 0 0 0 1px #e3e7ee inset; background: #f7f9fc; }
.form-box :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1.5px #257de0 inset; background: #fff; }
.form-box :deep(.el-form-item) { margin-bottom: 20px; }
.row { display: flex; justify-content: space-between; align-items: center; margin: -4px 0 20px; font-size: 13px; }
.link { color: #257de0; cursor: pointer; text-decoration: none; }
.err { display: flex; align-items: center; gap: 6px; color: #dc3c3d; font-size: 13px; margin: -8px 0 14px; }
.btn { width: 100%; height: 46px; border-radius: 10px; font-size: 16px; letter-spacing: 6px; border: 0; background: linear-gradient(90deg, #2f8cf0, #1b64be); box-shadow: 0 8px 20px rgba(37, 125, 224, 0.3); }
.btn:hover { filter: brightness(1.06); }
.foot { font-size: 12px; color: #9aa1ab; text-align: center; line-height: 1.8; }
.foot a { color: inherit; text-decoration: none; }

@media (max-width: 1100px) {
  .login { grid-template-columns: minmax(0, 1fr) minmax(380px, 1fr); }
  .brand { padding: 28px 32px 36px; }
  .brand-copy h1 { font-size: 26px; }
}
@media (max-width: 768px) {
  .login { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; }
  .brand { padding: 18px 20px 20px; }
  .brand-top { display: none; }
  .scene { max-height: 200px; margin: 0 auto; }
  .brand-copy { text-align: center; margin: 0 auto; }
  .brand-copy h1 { font-size: 22px; letter-spacing: 2px; }
  .brand-copy p { font-size: 13px; margin: 6px 0 0; letter-spacing: 1px; }
  .feats { display: none; }
  .panel { padding: 28px 20px 20px; justify-content: flex-start; }
  .form-box h2 { font-size: 24px; }
  .sub { margin-bottom: 20px; }
}
</style>
