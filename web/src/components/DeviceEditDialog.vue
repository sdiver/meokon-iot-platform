<template>
  <el-dialog v-model="visible" :title="creating ? '新增设备' : `编辑设备档案 · ${form.id}`" :width="isMobile ? '96%' : '760px'" top="6vh" append-to-body class="dev-dlg">
    <el-form ref="formRef" :model="form" :label-position="isMobile ? 'top' : 'right'" label-width="88px">
      <el-tabs v-model="tab">
        <el-tab-pane label="基本信息" name="base">
          <div class="fgrid">
            <el-form-item label="设备编号" required>
              <el-input v-model="form.id" :disabled="!creating" maxlength="12" class="mono" placeholder="12 位设备编号，如 SHMK24060001" />
            </el-form-item>
            <el-form-item label="设备名称"><el-input v-model="form.name" maxlength="50" placeholder="例如：1号泵房出口压力" /></el-form-item>
            <el-form-item v-if="creating" label="设备类型">
              <el-select v-model="form.typeCode" filterable clearable placeholder="上报后自动识别" style="width: 100%">
                <el-option v-for="t in typeList" :key="t.code" :label="`${t.code} · ${t.name}`" :value="t.code" />
              </el-select>
            </el-form-item>
            <el-form-item label="产品型号"><el-input v-model="form.model" maxlength="50" placeholder="如 MD-S271" /></el-form-item>
            <el-form-item label="产品别名"><el-input v-model="form.alias" maxlength="50" placeholder="如 无线数字压力表" /></el-form-item>
            <el-form-item label="告警推送"><el-switch v-model="form.alarmPush" active-text="开" inactive-text="关" /></el-form-item>
            <el-form-item label="备注" class="full"><el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" /></el-form-item>
          </div>
        </el-tab-pane>
        <el-tab-pane label="归属与联系人" name="owner">
          <div class="fgrid">
            <el-form-item label="项目名称">
              <el-autocomplete v-model="form.project" :fetch-suggestions="(q, cb) => cb(suggest(projects, q))" placeholder="所属项目" style="width: 100%" />
            </el-form-item>
            <el-form-item label="设备分组">
              <el-autocomplete v-model="form.groupName" :fetch-suggestions="(q, cb) => cb(suggest(groups, q))" placeholder="如 供水管网" style="width: 100%" />
            </el-form-item>
            <el-form-item label="设备负责人"><el-input v-model="form.owner" maxlength="30" /></el-form-item>
            <el-form-item label="联系方式"><el-input v-model="form.contact" maxlength="50" /></el-form-item>
            <el-form-item label="资产编号"><el-input v-model="form.assetNo" maxlength="50" /></el-form-item>
          </div>
        </el-tab-pane>
        <el-tab-pane label="安装位置" name="loc">
          <el-form-item label="安装地址"><el-input v-model="form.location" maxlength="100" placeholder="例如：上海市青浦区××路 12 号 3 号井" /></el-form-item>
          <div class="fgrid">
            <el-form-item label="经度"><el-input-number v-model="form.lng" :precision="6" :step="0.0001" :min="-180" :max="180" controls-position="right" style="width: 100%" /></el-form-item>
            <el-form-item label="纬度"><el-input-number v-model="form.lat" :precision="6" :step="0.0001" :min="-90" :max="90" controls-position="right" style="width: 100%" /></el-form-item>
          </div>
          <DeviceMap v-if="tab === 'loc' && visible" mode="pick" :pick="{ lat: form.lat, lng: form.lng }" :height="isMobile ? 240 : 300" :legend="false" @pick="(p) => { form.lat = p.lat; form.lng = p.lng; }" />
          <div class="muted small mt6">点击地图设置位置，坐标按 WGS84 保存（与 GPS 一致）。<a v-if="form.lat != null" class="link" @click="form.lat = null; form.lng = null">清除坐标</a></div>
        </el-tab-pane>
        <el-tab-pane label="硬件信息" name="hw">
          <div class="fgrid">
            <el-form-item label="通讯类型">
              <el-select v-model="form.commType" clearable allow-create filterable style="width: 100%">
                <el-option v-for="c in ['4G', 'NB-IoT', 'LoRa', 'Cat.1', '以太网', 'RS485']" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
            <el-form-item label="IMEI"><el-input v-model="form.imei" class="mono" maxlength="20" /></el-form-item>
            <el-form-item label="ICCID"><el-input v-model="form.iccid" class="mono" maxlength="22" placeholder="修改后自动生成换卡记录" /></el-form-item>
            <el-form-item label="硬件版本"><el-input v-model="form.hwVersion" maxlength="30" /></el-form-item>
            <el-form-item label="软件版本"><el-input v-model="form.swVersion" maxlength="30" /></el-form-item>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-form>
    <template #footer>
      <el-button v-if="!creating" type="danger" plain style="float: left" @click="remove">删除设备</el-button>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, h } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, ElCheckbox } from 'element-plus';
import DeviceMap from './DeviceMap.vue';
import { api, loadTypes } from '../api.js';
import { isMobile } from '../utils/responsive.js';

const emit = defineEmits(['saved']);
const router = useRouter();
const visible = ref(false);
const saving = ref(false);
const creating = ref(false);
const tab = ref('base');
const types = ref(new Map());
const projects = ref([]);
const groups = ref([]);
const typeList = computed(() => [...types.value.values()]);
const FIELDS = ['id', 'name', 'model', 'alias', 'remark', 'project', 'groupName', 'owner', 'contact', 'assetNo', 'location', 'lat', 'lng', 'commType', 'imei', 'iccid', 'hwVersion', 'swVersion'];
const form = reactive({});

const suggest = (list, q) => list.filter((x) => !q || x.includes(q)).map((value) => ({ value }));

async function prepare() {
  const [t, p, g] = await Promise.all([loadTypes(), api.projects(), api.groups()]);
  types.value = t;
  projects.value = p;
  groups.value = g;
}
function open(d) {
  creating.value = !d;
  tab.value = 'base';
  for (const k of FIELDS) form[k] = d?.[k] ?? (k === 'lat' || k === 'lng' ? null : '');
  form.typeCode = null;
  form.alarmPush = d ? d.alarmPush !== false : true;
  visible.value = true;
  prepare();
}
async function save() {
  if (!form.id?.trim()) {
    tab.value = 'base';
    return ElMessage.warning('请填写设备编号');
  }
  saving.value = true;
  try {
    const body = { ...form, lat: form.lat ?? '', lng: form.lng ?? '' };
    const d = creating.value ? await api.createDevice(body) : await api.updateDevice(form.id, body);
    ElMessage.success(creating.value ? '设备已登记，上报后自动上线' : '已保存');
    visible.value = false;
    emit('saved', d);
  } finally {
    saving.value = false;
  }
}
async function remove() {
  const purge = ref(true);
  await ElMessageBox({
    title: `删除设备 ${form.id}`,
    message: () => h('div', [
      h('p', { style: 'margin:0 0 10px' }, '删除后设备再次上报会自动重新登记。'),
      h(ElCheckbox, { modelValue: purge.value, 'onUpdate:modelValue': (v) => { purge.value = v; } }, () => '同时删除该设备的采集数据、报文、报警、轨迹和维保记录'),
    ]),
    showCancelButton: true, confirmButtonText: '删除', confirmButtonClass: 'el-button--danger', type: 'warning',
  });
  await api.deleteDevice(form.id, purge.value);
  visible.value = false;
  ElMessage.success('已删除');
  emit('saved', null);
  if (router.currentRoute.value.name === 'device') router.push('/devices');
}
defineExpose({ open });
</script>

<style scoped>
.fgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; }
.fgrid .full { grid-column: 1 / -1; }
.small { font-size: 12px; }
.mt6 { margin-top: 6px; }
@media (max-width: 768px) { .fgrid { grid-template-columns: minmax(0, 1fr); } }
</style>
