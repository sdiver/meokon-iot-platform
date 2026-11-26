<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>设备类型对照表</h2>
        <div class="sub">协议表二：上传单位 / 表类型，决定报警参数与数据记录结构。共 {{ list.length }} 种</div>
      </div>
      <el-input v-model="kw" placeholder="搜索类型名称 / 编号 / 参数" clearable style="width: 260px" :prefix-icon="Search" />
    </div>
    <div class="card">
      <el-table :data="filtered" size="small" row-key="code">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="exp">
              <el-table :data="row.params" size="small" border>
                <el-table-column type="index" label="#" width="50" />
                <el-table-column prop="name" label="参数" />
                <el-table-column prop="key" label="字段" width="110"><template #default="{ row: p }"><span class="mono">{{ p.key }}</span></template></el-table-column>
                <el-table-column label="数据类型" width="110"><template #default="{ row: p }">{{ TYPE_TEXT[p.type] }}</template></el-table-column>
                <el-table-column label="1LSB" width="100"><template #default="{ row: p }">{{ p.type.startsWith('f') ? '浮点直接引用' : p.kind === 'num' ? p.scale : '-' }}</template></el-table-column>
                <el-table-column prop="unit" label="单位" width="100" />
                <el-table-column label="说明"><template #default="{ row: p }">{{ note(p) }}</template></el-table-column>
              </el-table>
              <div v-if="row.alarmNote" class="muted small mt8">报警位特殊含义：{{ Object.entries(row.alarmNote).map(([b, t]) => `BIT${b} ${t}`).join('，') }}</div>
              <div v-if="row.special === 'modbus'" class="muted small mt8">MODBUS 采集终端：数据为 地址 + 功能码 + 字节个数 N + N 字节数据 + CRC16；报警参数为 MODBUS 地址 / 读取寄存器个数 / 起始地址。</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="类型值" width="80" />
        <el-table-column prop="name" label="名称" min-width="200" />
        <el-table-column prop="category" label="类别" width="100" />
        <el-table-column prop="alarmGroups" label="报警组个数" width="100" align="right" />
        <el-table-column label="记录字节数" width="100" align="right"><template #default="{ row }">{{ row.recordBytes ?? '可变' }}</template></el-table-column>
        <el-table-column label="参数" min-width="260"><template #default="{ row }">{{ row.params.map((p) => p.name + (p.unit ? `(${p.unit})` : '')).join('、') || '-' }}</template></el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { loadTypes } from '../api.js';

const TYPE_TEXT = { i16: '16位有符号', u16: '16位无符号', i32: '32位有符号', u32: '32位无符号', f32: '单精度浮点', f64: '双精度浮点', u8: '8位无符号' };
const list = ref([]);
const kw = ref('');
const filtered = computed(() => {
  const k = kw.value.trim().toLowerCase();
  if (!k) return list.value;
  return list.value.filter((t) => String(t.code) === k || t.name.toLowerCase().includes(k) || t.category.includes(k) || t.params.some((p) => p.name.toLowerCase().includes(k)));
});
function note(p) {
  if (p.kind === 'bits') return `${p.bits} 个通道，BIT 位 1 闭合 / 0 断开`;
  if (p.kind === 'enum') return Object.entries(p.enum).map(([k, v]) => `${k}=${v}`).join('，');
  return '';
}
onMounted(async () => { list.value = [...(await loadTypes()).values()]; });
</script>

<style scoped>
.exp { padding: 8px 16px 12px 48px; }
.small { font-size: 12px; }
.mt8 { margin-top: 8px; }
</style>
