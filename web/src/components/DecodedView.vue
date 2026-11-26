<template>
  <div v-if="d" class="decoded">
    <div class="status">
      <el-tag :type="d.ok ? 'success' : 'danger'" effect="plain">{{ d.ok ? '解析成功' : '解析失败' }}</el-tag>
      <el-tag v-if="d.crc" :type="d.crc.ok ? 'success' : 'danger'" effect="plain">CRC {{ d.crc.ok ? '正确' : `错误（应为 ${d.crc.expected}）` }}</el-tag>
      <el-tag effect="plain" type="info">{{ dirText }}</el-tag>
    </div>
    <el-alert v-for="e in d.errors" :key="e" :title="e" type="error" :closable="false" show-icon class="al" />
    <el-alert v-for="w in d.warnings" :key="w" :title="w" type="warning" :closable="false" show-icon class="al" />

    <template v-if="segments.length">
      <h4>字段分解</h4>
      <div class="segs mono">
        <span v-for="(s, i) in segments" :key="i" class="seg" :class="'c' + (i % 2)" :title="s.name">
          <span class="hx">{{ s.hex }}</span><span class="nm">{{ s.name }}</span>
        </span>
      </div>
    </template>

    <template v-if="d.direction === 'up' && d.deviceId">
      <h4>帧头信息</h4>
      <el-descriptions :column="descCols" border size="small">
        <el-descriptions-item label="设备编号"><span class="mono">{{ d.deviceId }}</span></el-descriptions-item>
        <el-descriptions-item label="帧总长度">{{ d.length }} 字节</el-descriptions-item>
        <el-descriptions-item label="设备类型">{{ d.typeCode }} · {{ d.typeName }}</el-descriptions-item>
        <el-descriptions-item label="电量状态">
          {{ hex(d.battery?.raw) }}：{{ d.battery?.source }}，{{ d.battery?.mode }}，电量 {{ d.battery?.level }}%
        </el-descriptions-item>
        <el-descriptions-item label="信号强度">{{ d.signal }} dBm（{{ signalLevel(d.signal).text }}）</el-descriptions-item>
        <el-descriptions-item label="记录间隔">{{ d.interval }} 秒</el-descriptions-item>
        <el-descriptions-item label="缓存记录条数">{{ d.count }}</el-descriptions-item>
        <el-descriptions-item label="UTC 时间">{{ d.utc }}（{{ fmtSec(d.utc) }}）</el-descriptions-item>
        <el-descriptions-item label="报警状态">
          {{ hex(d.alarm?.raw) }}
          <template v-if="d.alarm?.bits?.length">
            ：<el-tag v-for="b in d.alarm.bits" :key="b.bit" type="danger" size="small" class="bt">BIT{{ b.bit }} {{ b.label }}</el-tag>
          </template>
          <span v-else class="muted">（无报警）</span>
        </el-descriptions-item>
      </el-descriptions>

      <template v-if="d.alarmParams?.length">
        <h4>报警设置参数</h4>
        <el-table :data="d.alarmParams" size="small" border>
          <el-table-column prop="group" label="组" width="60" />
          <el-table-column prop="name" label="参数" />
          <el-table-column label="报警下限"><template #default="{ row }">{{ row.low ?? row.value }} {{ row.unit }}</template></el-table-column>
          <el-table-column label="报警上限"><template #default="{ row }">{{ row.high ?? '-' }} {{ row.high != null ? row.unit : '' }}</template></el-table-column>
        </el-table>
      </template>

      <h4>当前实时数据</h4>
      <el-table :data="realtimeRows" size="small" border>
        <el-table-column prop="name" label="参数" />
        <el-table-column label="数值"><template #default="{ row }"><b class="num">{{ row.text }}</b> {{ row.unit }}</template></el-table-column>
        <el-table-column prop="note" label="说明" />
      </el-table>

      <template v-if="d.records?.length">
        <h4>缓存数据记录（{{ d.records.length }} 条，最早 → 最新）</h4>
        <el-table :data="d.records" size="small" border max-height="360">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column label="采集时间" width="170"><template #default="{ row }">{{ fmtSec(row.ts) }}</template></el-table-column>
          <el-table-column v-for="k in recordKeys" :key="k" :label="colLabel(k)">
            <template #default="{ row }"><span class="num">{{ fmtParam(paramOf(k), row.values[k]) }}</span></template>
          </el-table-column>
        </el-table>
      </template>
    </template>

    <template v-else-if="d.deviceId">
      <h4>{{ d.direction === 'ack' ? '设备应答' : '平台下行' }}</h4>
      <el-descriptions :column="descCols" border size="small">
        <el-descriptions-item label="设备编号"><span class="mono">{{ d.deviceId }}</span></el-descriptions-item>
        <el-descriptions-item label="帧总长度">{{ d.length }} 字节</el-descriptions-item>
        <el-descriptions-item label="UTC 时间">{{ d.utc }}（{{ fmtSec(d.utc) }}）</el-descriptions-item>
        <el-descriptions-item label="参数单元长度">{{ d.paramLength }}</el-descriptions-item>
        <el-descriptions-item label="参数设置数据单元"><span class="mono">{{ d.params || '（无，默认应答）' }}</span></el-descriptions-item>
      </el-descriptions>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { loadTypes } from '../api.js';
import { fmtSec, fmtParam, hex, signalLevel, closedChannels } from '../utils/format.js';

const props = defineProps({ d: Object, raw: String });
const types = ref(new Map());
onMounted(async () => { types.value = await loadTypes(); });
const descCols = computed(() => (window.innerWidth < 760 ? 1 : 2));

const def = computed(() => types.value.get(props.d?.typeCode));
const paramOf = (k) => def.value?.params.find((p) => p.key === k);
const colLabel = (k) => {
  const p = paramOf(k);
  return p ? `${p.name}${p.unit ? `(${p.unit})` : ''}` : k;
};
const dirText = computed(() => ({ up: '上行数据帧 0x00', down: '平台下行帧 0xFF', ack: '设备应答帧 0x04' }[props.d?.direction] ?? '-'));

const realtimeRows = computed(() => {
  const rt = props.d?.realtime || {};
  return Object.entries(rt).filter(([k]) => k !== '_modbus').map(([k, v]) => {
    const p = paramOf(k);
    let note = '';
    if (p?.kind === 'bits') {
      const on = closedChannels(v, p.bits);
      note = on.length ? `闭合通道：${on.join(', ')}` : '全部断开';
    }
    return { name: p?.name ?? k, text: fmtParam(p, v), unit: p?.kind === 'num' ? p.unit : '', note };
  }).concat(rt._modbus ? [{ name: 'MODBUS 帧', text: `地址 ${rt._modbus.addr} 功能码 ${rt._modbus.func} 字节数 ${rt._modbus.n}`, unit: '', note: `数据 ${rt._modbus.data}` }] : []);
});
const recordKeys = computed(() => Object.keys(props.d?.records?.[0]?.values || {}).filter((k) => k !== '_modbus'));

const segments = computed(() => {
  const h = (props.raw || '').toLowerCase();
  const d = props.d;
  if (!h || !d || !d.length || h.length / 2 !== d.length) return [];
  const segs = [];
  let o = 0;
  const take = (n, name) => {
    if (n <= 0) return;
    segs.push({ name, hex: h.slice(o * 2, (o + n) * 2) });
    o += n;
  };
  take(2, '起始标记'); take(1, '命令类型'); take(2, '帧总长度'); take(12, '设备编号');
  if (d.direction === 'up') {
    if (!d.recordBytes) return [];
    take(1, '电量状态'); take(1, '信号强度'); take(2, '记录间隔'); take(2, '记录条数'); take(1, '设备类型'); take(1, '报警状态');
    const aLen = d.length - 33 - (d.count + 1) * d.recordBytes;
    take(aLen, '报警参数'); take(d.recordBytes, '实时数据'); take(4, 'UTC 时间');
    for (let i = 0; i < d.count; i++) take(d.recordBytes, `缓存数据 ${i + 1}`);
  } else {
    take(4, 'UTC 时间'); take(2, '参数长度'); take(d.paramLength || 0, '参数单元');
  }
  take(2, 'CRC16'); take(2, '结尾标记');
  return segs;
});
</script>

<style scoped>
h4 { margin: 18px 0 8px; font-size: 14px; }
.status { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.al { margin-top: 6px; }
.bt { margin-right: 4px; }
.segs { display: flex; flex-wrap: wrap; gap: 4px; }
.seg { display: inline-flex; flex-direction: column; border-radius: 6px; padding: 4px 6px; border: 1px solid var(--hair); max-width: 100%; }
.seg.c0 { background: rgba(37, 125, 224, 0.07); }
.seg.c1 { background: rgba(127, 127, 127, 0.06); }
.hx { word-break: break-all; }
.nm { font-size: 11px; color: var(--ink-2); font-family: system-ui, sans-serif; }
</style>
