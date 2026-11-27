<template>
  <el-dialog
    :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)"
    :title="forced ? '首次登录，请修改初始密码' : '修改密码'" :width="isMobile ? '94%' : '440px'" append-to-body
    :close-on-click-modal="!forced" :close-on-press-escape="!forced" :show-close="!forced">
    <el-alert v-if="forced" type="warning" :closable="false" show-icon class="tip" title="为保障账号安全，请设置新的登录密码后继续使用" />
    <el-form ref="formRef" :model="f" :rules="rules" label-position="top" @submit.prevent>
      <el-form-item v-if="!oldPassword" label="原密码" prop="old"><el-input v-model="f.old" type="password" show-password autocomplete="current-password" /></el-form-item>
      <el-form-item label="新密码" prop="pw">
        <el-input v-model="f.pw" type="password" show-password autocomplete="new-password" placeholder="至少 8 位，包含字母和数字" />
        <div class="meter" aria-hidden="true"><span v-for="i in 3" :key="i" :class="{ on: strength >= i, [`s${strength}`]: true }" /></div>
        <div class="hint">{{ ['', '强度：弱', '强度：中', '强度：强'][strength] }}</div>
      </el-form-item>
      <el-form-item label="确认新密码" prop="pw2"><el-input v-model="f.pw2" type="password" show-password autocomplete="new-password" @keyup.enter="save" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button v-if="forced" @click="quit">退出登录</el-button>
      <el-button v-else @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api, session, logout } from '../api.js';
import { isMobile } from '../utils/responsive.js';

const props = defineProps({ modelValue: Boolean, forced: Boolean, oldPassword: String });
const emit = defineEmits(['update:modelValue', 'done']);
const formRef = ref(null);
const saving = ref(false);
const f = reactive({ old: '', pw: '', pw2: '' });
watch(() => props.modelValue, (v) => { if (v) Object.assign(f, { old: '', pw: '', pw2: '' }); });

const strength = computed(() => {
  const s = f.pw;
  if (!s) return 0;
  let n = 0;
  if (s.length >= 8) n++;
  if (/[A-Za-z]/.test(s) && /\d/.test(s)) n++;
  if (s.length >= 12 || /[^A-Za-z0-9]/.test(s)) n++;
  return Math.max(1, n);
});
const rules = {
  old: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  pw: [{
    validator: (_, v, cb) => {
      if (!v || v.length < 8) cb(new Error('密码至少 8 位'));
      else if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) cb(new Error('密码需同时包含字母和数字'));
      else cb();
    },
    trigger: 'blur',
  }],
  pw2: [{ validator: (_, v, cb) => (v !== f.pw ? cb(new Error('两次输入的密码不一致')) : cb()), trigger: 'blur' }],
};

async function save() {
  try { await formRef.value.validate(); } catch { return; }
  saving.value = true;
  try {
    const r = await api.changePassword(props.oldPassword || f.old, f.pw);
    session.user = r.user;
    session.mustChange = false;
    ElMessage.success('密码已修改');
    emit('update:modelValue', false);
    emit('done');
  } finally {
    saving.value = false;
  }
}
async function quit() {
  await logout();
  emit('update:modelValue', false);
  location.hash = '#/login';
}
</script>

<style scoped>
.tip { margin-bottom: 14px; }
.meter { display: flex; gap: 4px; width: 100%; margin-top: 6px; }
.meter span { flex: 1; height: 4px; border-radius: 2px; background: var(--hair, #e5e7eb); }
.meter span.on.s1 { background: #dc3c3d; }
.meter span.on.s2 { background: #fbb315; }
.meter span.on.s3 { background: #0aac23; }
.hint { font-size: 12px; color: #8a8f98; line-height: 1.6; }
</style>
