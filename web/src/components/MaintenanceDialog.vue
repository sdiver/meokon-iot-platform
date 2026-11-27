<template>
  <el-dialog v-model="visible" title="登记维保" :width="isMobile ? '94%' : '500px'" append-to-body>
    <el-form :model="form" label-width="88px" :label-position="isMobile ? 'top' : 'right'">
      <el-form-item label="设备" required>
        <el-select v-model="form.deviceId" filterable remote :remote-method="searchDev" placeholder="输入编号或名称搜索" style="width: 100%" :disabled="lockDevice" @change="onDevice">
          <el-option v-for="d in devOptions" :key="d.id" :label="`${d.name || d.id}（${d.id}）`" :value="d.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="维保类型" required>
        <el-radio-group v-model="form.type">
          <el-radio-button v-for="t in TYPES" :key="t" :value="t">{{ t }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <template v-if="form.type === '更换SIM卡'">
        <el-form-item label="旧 ICCID"><el-input v-model="form.oldValue" class="mono" placeholder="默认取设备档案中的 ICCID" /></el-form-item>
        <el-form-item label="新 ICCID" required><el-input v-model="form.newValue" class="mono" placeholder="20 位 ICCID" /></el-form-item>
      </template>
      <template v-else-if="form.type === '更换电池'">
        <el-form-item label="电池型号"><el-input v-model="form.newValue" placeholder="例如 ER34615 3.6V" /></el-form-item>
      </template>
      <el-form-item label="维保时间"><el-date-picker v-model="form.ts" type="datetime" style="width: 100%" /></el-form-item>
      <el-form-item label="说明"><el-input v-model="form.note" type="textarea" :rows="3" maxlength="200" show-word-limit /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api.js';
import { isMobile } from '../utils/responsive.js';

const emit = defineEmits(['saved']);
const TYPES = ['更换SIM卡', '更换电池', '维修', '安装', '巡检', '其他'];
const visible = ref(false);
const saving = ref(false);
const lockDevice = ref(false);
const devOptions = ref([]);
const form = reactive({ deviceId: '', type: '更换电池', oldValue: '', newValue: '', note: '', ts: new Date() });

async function searchDev(kw) {
  devOptions.value = (await api.devices({ keyword: kw, size: 30 })).items;
}
function onDevice(id) {
  const d = devOptions.value.find((x) => x.id === id);
  if (d && form.type === '更换SIM卡' && !form.oldValue) form.oldValue = d.iccid || '';
}
async function open(preset = {}) {
  Object.assign(form, { deviceId: '', type: '更换电池', oldValue: '', newValue: '', note: '', ts: new Date() }, preset);
  lockDevice.value = Boolean(preset.deviceId);
  await searchDev(preset.deviceId || '');
  visible.value = true;
}
async function save() {
  if (!form.deviceId) return ElMessage.warning('请选择设备');
  saving.value = true;
  try {
    await api.addMaintenance({ ...form, ts: form.ts ? form.ts.getTime() : undefined });
    ElMessage.success('已登记');
    visible.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}
defineExpose({ open });
</script>
