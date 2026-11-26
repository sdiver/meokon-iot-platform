<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>报文日志</h2>
        <div class="sub">所有上行、下行和设备应答的原始报文，点击任意一行查看逐字段解析</div>
      </div>
    </div>
    <FrameTable />
  </div>
</template>

<script setup>
import FrameTable from '../components/FrameTable.vue';
</script>
