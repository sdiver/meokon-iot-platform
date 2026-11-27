<template>
  <el-table :data="items" size="small" empty-text="暂无命令" @selection-change="(v) => $emit('select', v)">
    <el-table-column v-if="selectable" type="selection" width="44" />
    <el-table-column prop="id" label="ID" width="64" />
    <el-table-column v-if="showDevice" label="设备" min-width="170">
      <template #default="{ row }">
        <a class="link" @click="$router.push(`/devices/${row.deviceId}?tab=commands`)">{{ row.deviceName || row.deviceId }}</a>
        <div class="muted mono">{{ row.deviceId }}</div>
      </template>
    </el-table-column>
    <el-table-column label="配置内容" min-width="170">
      <template #default="{ row }"><div class="mono break">{{ row.params }}</div><div class="muted small" v-if="row.note">{{ row.note }}</div></template>
    </el-table-column>
    <el-table-column label="配置状态" width="96"><template #default="{ row }"><span class="st-tag" :class="ST[row.status].cls">{{ ST[row.status].text }}</span></template></el-table-column>
    <el-table-column v-if="showDevice" label="设备状态" width="92"><template #default="{ row }"><DeviceStatus v-if="row.deviceStatus" :status="row.deviceStatus" /></template></el-table-column>
    <el-table-column label="创建 / 下发 / 应答" min-width="200">
      <template #default="{ row }">
        <div class="small">创建 {{ fmtTime(row.createdAt) }}</div>
        <div class="small muted" v-if="row.sentAt">下发 {{ fmtTime(row.sentAt) }} · {{ TRANSPORT[row.sentVia] || row.sentVia }}</div>
        <div class="small muted" v-if="row.ackAt">应答 {{ fmtTime(row.ackAt) }}</div>
      </template>
    </el-table-column>
    <el-table-column label="设备应答" min-width="130"><template #default="{ row }"><span class="mono break">{{ row.ackParams || '' }}</span></template></el-table-column>
    <el-table-column label="操作" width="80" fixed="right">
      <template #default="{ row }"><el-button v-if="row.status === 'pending'" link type="danger" @click="cancel(row.id)">取消</el-button></template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { ElMessage } from 'element-plus';
import DeviceStatus from './DeviceStatus.vue';
import { api } from '../api.js';
import { fmtTime, TRANSPORT } from '../utils/format.js';

defineProps({ items: Array, showDevice: Boolean, selectable: Boolean });
const emit = defineEmits(['changed', 'select']);
const ST = {
  pending: { text: '待下发', cls: 'warning' },
  sent: { text: '已下发', cls: 'online' },
  acked: { text: '已应答', cls: 'handled' },
  cancelled: { text: '已取消', cls: 'offline' },
};
async function cancel(id) {
  await api.cancelCommand(id);
  ElMessage.success('已取消');
  emit('changed');
}
</script>

<style scoped>
.small { font-size: 12px; }
</style>
