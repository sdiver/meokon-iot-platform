<template>
  <el-dialog v-model="visible" title="批量导入设备档案" :width="isMobile ? '96%' : '680px'" append-to-body>
    <ol class="steps">
      <li>下载模板（与“导出”格式相同，可直接导出后修改再导入）。<a class="link" @click="downloadTemplate">下载 CSV 模板</a></li>
      <li>用 Excel 或 WPS 填写后另存为 CSV。“设备编号”必填；已存在的设备会更新档案，不存在的会预先登记。</li>
      <li>选择文件，确认预览无误后导入。</li>
    </ol>
    <div class="drop" :class="{ over: dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop" @click="fileIn.click()">
      <el-icon :size="28"><UploadFilled /></el-icon>
      <div>{{ fileName || '点击选择或拖入 CSV 文件' }}</div>
      <input ref="fileIn" type="file" accept=".csv,text/csv" hidden @change="(e) => readFile(e.target.files[0])" />
    </div>
    <template v-if="rows.length">
      <div class="sum">识别到 <b>{{ rows.length }}</b> 行，字段：{{ cols.map((c) => c.label).join('、') }}</div>
      <el-table :data="rows.slice(0, 50)" size="small" max-height="240" border>
        <el-table-column v-for="c in cols" :key="c.key" :prop="c.key" :label="c.label" min-width="110" show-overflow-tooltip />
      </el-table>
    </template>
    <el-alert v-if="result" :type="result.errors.length ? 'warning' : 'success'" :closable="false" show-icon class="res"
      :title="`新增 ${result.created} 台，更新 ${result.updated} 台${result.errors.length ? `，${result.errors.length} 行失败` : ''}`">
      <div v-for="e in result.errors.slice(0, 10)" :key="e.row" class="small">第 {{ e.row }} 行 {{ e.id }}：{{ e.error }}</div>
    </el-alert>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :disabled="!rows.length" :loading="saving" @click="submit">导入 {{ rows.length || '' }} 行</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import { api } from '../api.js';
import { isMobile } from '../utils/responsive.js';

const emit = defineEmits(['done']);
const COLUMNS = [
  ['id', '设备编号'], ['name', '设备名称'], ['model', '产品型号'], ['alias', '产品别名'], ['typeCode', '设备类型编号'],
  ['project', '项目'], ['groupName', '分组'], ['location', '安装位置'], ['lng', '经度'], ['lat', '纬度'],
  ['owner', '负责人'], ['contact', '联系方式'], ['assetNo', '资产编号'], ['imei', 'IMEI'], ['iccid', 'ICCID'],
  ['hwVersion', '硬件版本'], ['swVersion', '软件版本'], ['commType', '通讯方式'], ['alarmPush', '告警推送'], ['remark', '备注'],
];
const BY_LABEL = new Map(COLUMNS.map(([k, l]) => [l, k]));
const visible = ref(false);
const saving = ref(false);
const dragging = ref(false);
const fileIn = ref(null);
const fileName = ref('');
const rows = ref([]);
const cols = ref([]);
const result = ref(null);

function open() {
  rows.value = [];
  cols.value = [];
  fileName.value = '';
  result.value = null;
  visible.value = true;
}

/** 解析 CSV（支持引号、转义引号、字段内换行） */
function parseCsv(text) {
  const out = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim() !== ''));
}

async function readFile(f) {
  if (!f) return;
  fileName.value = f.name;
  result.value = null;
  const buf = await f.arrayBuffer();
  // Excel 中文版默认保存为 GBK 编码
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) {
    try { text = new TextDecoder('gbk').decode(buf); } catch { /* 浏览器不支持 */ }
  }
  text = text.replace(/^﻿/, '');
  const table = parseCsv(text);
  if (table.length < 2) return ElMessage.warning('文件中没有数据行');
  const head = table[0].map((h) => BY_LABEL.get(h.trim()) ?? (COLUMNS.some(([k]) => k === h.trim()) ? h.trim() : null));
  if (!head.includes('id')) return ElMessage.error('缺少“设备编号”列');
  cols.value = head.map((k, i) => (k ? { key: k, label: table[0][i].trim(), i } : null)).filter(Boolean);
  rows.value = table.slice(1).map((r) => {
    const o = {};
    for (const c of cols.value) {
      const v = (r[c.i] ?? '').trim();
      if (v !== '') o[c.key] = v;
    }
    return o;
  }).filter((o) => o.id);
}
function onDrop(e) {
  dragging.value = false;
  readFile(e.dataTransfer.files[0]);
}
function downloadTemplate() {
  const head = COLUMNS.map(([, l]) => l).join(',');
  const sample = ['SHMK24060001', '1号泵房出口压力', 'MD-S271', '无线数字压力表', '1', '一期工程', '供水管网', '上海市青浦区××路12号', '121.123456', '31.123456', '张工', '13800000000', 'ZC-0001', '', '', '', '', '4G', '开', ''].join(',');
  const blob = new Blob(['﻿' + head + '\n' + sample + '\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '设备档案导入模板.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
async function submit() {
  saving.value = true;
  try {
    result.value = await api.importDevices(rows.value);
    if (!result.value.errors.length) ElMessage.success('导入完成');
    emit('done');
  } finally {
    saving.value = false;
  }
}
defineExpose({ open });
</script>

<style scoped>
.steps { margin: 0 0 14px; padding-left: 20px; font-size: 13px; color: var(--ink-2); line-height: 1.9; }
.drop {
  border: 1.5px dashed var(--hair-strong); border-radius: 12px; padding: 22px; text-align: center; cursor: pointer; color: var(--ink-2);
  display: flex; flex-direction: column; align-items: center; gap: 6px; transition: border-color 0.15s, background 0.15s;
}
.drop:hover, .drop.over { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.sum { font-size: 13px; margin: 14px 0 8px; }
.res { margin-top: 12px; }
.small { font-size: 12px; }
</style>
