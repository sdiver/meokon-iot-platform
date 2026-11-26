<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>报文解析工具</h2>
        <div class="sub">粘贴十六进制报文（上行 0x00 / 下行 0xFF / 应答 0x04），按《智能无线终端通讯协议 V3.3》逐字段解析</div>
      </div>
    </div>
    <div class="grid c2">
      <div class="card">
        <div class="card-title">报文解析</div>
        <el-input v-model="hexIn" type="textarea" :rows="5" class="mono" placeholder="a55a00003b53484d4b31393036303031..." />
        <div class="filters mt8">
          <el-button type="primary" @click="decode">解析</el-button>
          <el-button @click="hexIn = SAMPLE">填入文档范例</el-button>
          <el-button @click="hexIn = ''; result = null">清空</el-button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">生成下行帧</div>
        <el-form label-width="96px">
          <el-form-item label="设备编号"><el-input v-model="dl.deviceId" maxlength="12" placeholder="12 位设备编号" class="mono" /></el-form-item>
          <el-form-item label="参数单元"><el-input v-model="dl.params" placeholder="留空为默认应答；ff00 = 读取所有配置" class="mono" /></el-form-item>
          <el-form-item><el-button type="primary" @click="build">生成</el-button></el-form-item>
        </el-form>
        <div v-if="dlHex" class="out mono break">{{ dlHex }} <el-button link type="primary" @click="copy(dlHex)">复制</el-button></div>
      </div>
    </div>
    <div class="card mt" v-if="result">
      <DecodedView :d="result" :raw="normalized" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import DecodedView from '../components/DecodedView.vue';
import { api } from '../api.js';

const SAMPLE = 'a55a00003b53484d4b313930363030313334c8003c000a0102006401f4021a5d1966b60219021a0216021802180213021e021c021d021d7e0355aa';
const hexIn = ref('');
const normalized = ref('');
const result = ref(null);
const dl = reactive({ deviceId: '', params: '' });
const dlHex = ref('');

async function decode() {
  normalized.value = hexIn.value.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  result.value = await api.decode(hexIn.value);
}
async function build() {
  dlHex.value = (await api.downlink({ deviceId: dl.deviceId, params: dl.params })).hex;
}
async function copy(t) {
  try { await navigator.clipboard.writeText(t); ElMessage.success('已复制'); } catch { ElMessage.warning('复制失败，请手动选择'); }
}
</script>

<style scoped>
.mt8 { margin-top: 8px; }
.out { background: var(--page-bg); padding: 10px; border-radius: 8px; }
</style>
