<template>
  <el-dialog v-model="visible" :title="`编辑设备 ${form.id}`" width="480px" append-to-body>
    <el-form :model="form" label-width="80px">
      <el-form-item label="名称"><el-input v-model="form.name" maxlength="50" /></el-form-item>
      <el-form-item label="安装位置"><el-input v-model="form.location" maxlength="100" /></el-form-item>
      <el-form-item label="分组"><el-input v-model="form.groupName" maxlength="50" placeholder="例如：供水管网" /></el-form-item>
      <el-form-item label="经度"><el-input-number v-model="form.lng" :precision="6" :step="0.001" :min="-180" :max="180" controls-position="right" style="width: 100%" /></el-form-item>
      <el-form-item label="纬度"><el-input-number v-model="form.lat" :precision="6" :step="0.001" :min="-90" :max="90" controls-position="right" style="width: 100%" /></el-form-item>
      <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="3" maxlength="500" /></el-form-item>
    </el-form>
    <template #footer>
      <el-popconfirm title="删除设备档案？（历史数据保留，设备再次上报会重新注册）" width="260" @confirm="remove">
        <template #reference><el-button type="danger" plain style="float: left">删除</el-button></template>
      </el-popconfirm>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../api.js';

const emit = defineEmits(['saved']);
const router = useRouter();
const visible = ref(false);
const saving = ref(false);
const form = reactive({ id: '', name: '', location: '', groupName: '', remark: '', lat: null, lng: null });

function open(d) {
  Object.assign(form, { id: d.id, name: d.name || '', location: d.location || '', groupName: d.groupName || '', remark: d.remark || '', lat: d.lat ?? null, lng: d.lng ?? null });
  visible.value = true;
}
async function save() {
  saving.value = true;
  try {
    const { id, ...body } = form;
    const d = await api.updateDevice(id, { ...body, lat: body.lat ?? '', lng: body.lng ?? '' });
    ElMessage.success('已保存');
    visible.value = false;
    emit('saved', d);
  } finally {
    saving.value = false;
  }
}
async function remove() {
  await api.deleteDevice(form.id);
  visible.value = false;
  ElMessage.success('已删除');
  emit('saved', null);
  if (router.currentRoute.value.name === 'device') router.push('/devices');
}
defineExpose({ open });
</script>
