<template>
  <div class="page" v-if="sys">
    <div class="page-head">
      <div>
        <h2>接入配置</h2>
        <div class="sub">{{ sys.protocol }} · 平台版本 {{ sys.version }}</div>
      </div>
    </div>
    <div class="grid c2">
      <div class="card">
        <div class="card-title">UDP / TCP 直连<span class="hint">二进制报文</span></div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="TCP 端口"><Svc :s="sys.transports.tcp">{{ host }}:{{ sys.transports.tcp.port }}</Svc></el-descriptions-item>
          <el-descriptions-item label="UDP 端口"><Svc :s="sys.transports.udp">{{ host }}:{{ sys.transports.udp.port }}</Svc></el-descriptions-item>
          <el-descriptions-item label="应答">每次上报 5 秒内下发应答帧（有待下发命令时携带参数），TCP 在 5 秒无数据后主动断开</el-descriptions-item>
        </el-descriptions>
      </div>
      <div class="card">
        <div class="card-title">MQTT<span class="hint">十六进制字符串</span></div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="内置 Broker"><Svc :s="sys.transports.mqttBroker">{{ host }}:{{ sys.transports.mqttBroker.port }}</Svc></el-descriptions-item>
          <el-descriptions-item label="平台订阅">
            <Svc :s="{ enabled: sys.transports.mqtt.enabled && sys.transports.mqtt.connected }">{{ sys.transports.mqtt.url || '-' }}</Svc>
            <span class="muted" v-if="sys.transports.mqtt.enabled">（已收 {{ sys.transports.mqtt.received }} 条）</span>
          </el-descriptions-item>
          <el-descriptions-item label="上行主题"><span class="mono">GIOT-GW/UL/&lt;设备ID&gt;</span>（平台订阅 <span class="mono">{{ sys.transports.mqtt.uplinkTopic || 'GIOT-GW/UL/#' }}</span>）</el-descriptions-item>
          <el-descriptions-item label="下行主题"><span class="mono">{{ sys.transports.mqtt.downlinkPrefix || 'GIOT-GW/DL/' }}&lt;设备ID&gt;</span>，仅在有下行指令时发布</el-descriptions-item>
        </el-descriptions>
      </div>
      <div class="card">
        <div class="card-title">电信 AEP<span class="hint">订阅推送</span></div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="推送地址"><span class="mono break">{{ origin }}/api/push/aep</span></el-descriptions-item>
          <el-descriptions-item label="说明">在 AEP 创建透传产品并注册 IMEI，开启自动订阅，订阅“设备数据变化通知”推送到此地址（APPdata 为 base64 报文）。平台自动应答设备，下行命令需通过 AEP 指令缓存下发。</el-descriptions-item>
        </el-descriptions>
      </div>
      <div class="card">
        <div class="card-title">移动 OneNET<span class="hint">HTTP 数据推送</span></div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="推送地址"><span class="mono break">{{ origin }}/api/push/onenet</span></el-descriptions-item>
          <el-descriptions-item label="说明">GET 请求用于 URL 验证（原样返回 msg）；POST 推送中 value 为十六进制字符串报文。平台自动应答设备，下行命令需通过 OneNET 缓存命令下发。</el-descriptions-item>
        </el-descriptions>
      </div>
      <div class="card span2">
        <div class="card-title">通用 HTTP 接入</div>
        <pre class="mono code">curl -X POST {{ origin }}/api/push/raw -H 'Content-Type: application/json' -d '{"hex":"a55a00003b53484d4b..."}'</pre>
        <div class="muted small">若配置了 PUSH_TOKEN，推送接口需带 <span class="mono">?token=...</span>。离线判定：超过 max({{ sys.offlineMinSec }} 秒, 上报周期 × {{ sys.offlineFactor }}) 未上报。统计时区：UTC+{{ sys.tzOffsetHours }}。</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, h } from 'vue';
import { api } from '../api.js';

const Svc = (props, { slots }) => h('span', [
  h('span', { class: ['dot', props.s?.enabled ? 'good' : 'neutral'] }),
  props.s?.enabled ? slots.default?.() : '未启用',
]);
Svc.props = ['s'];
const sys = ref(null);
const host = location.hostname;
const origin = location.origin;
onMounted(async () => { sys.value = await api.system(); });
</script>

<style scoped>
.code { background: var(--page-bg); padding: 10px; border-radius: 8px; white-space: pre-wrap; word-break: break-all; }
.small { font-size: 12px; }
</style>
