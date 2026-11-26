/**
 * 表二 设备类型对照表（协议 V3.3，类型 0 ~ 102）。
 *
 * 每个类型描述：
 *   name        名称
 *   alarmGroups 报警组个数（决定报警参数结构体长度，见表四）
 *   params      参数列表（顺序即上传顺序），每个参数：
 *     key    参数标识
 *     name   参数名称
 *     type   i16 | u16 | i32 | u32 | f32 | f64 | u8
 *     scale  1LSB 对应的数值（浮点类型忽略）
 *     unit   单位
 *     kind   'num'(默认，数值) | 'bits'(开关量通道位) | 'enum'(枚举) | 'raw'(原始码值)
 *     bits   kind=bits 时的通道数
 *     enum   kind=enum 时的取值说明
 *     chart  false 表示不适合绘制趋势曲线
 *   special  'modbus' 等特殊结构
 *   alarmNote 报警状态位的特殊含义（表三 注1）
 */

const P = (key, name, type, scale, unit, extra = {}) => ({ key, name, type, scale, unit, kind: 'num', ...extra });
const i16 = (key, name, scale, unit, extra) => P(key, name, 'i16', scale, unit, extra);
const u16 = (key, name, scale, unit, extra) => P(key, name, 'u16', scale, unit, extra);
const i32 = (key, name, scale, unit, extra) => P(key, name, 'i32', scale, unit, extra);
const u32 = (key, name, scale, unit, extra) => P(key, name, 'u32', scale, unit, extra);
const f32 = (key, name, unit, extra) => P(key, name, 'f32', 1, unit, extra);
const f64 = (key, name, unit, extra) => P(key, name, 'f64', 1, unit, extra);
const bits = (key, name, type, n) => P(key, name, type, 1, '', { kind: 'bits', bits: n, chart: false });
const en = (key, name, type, map) => P(key, name, type, 1, '', { kind: 'enum', enum: map, chart: false });

const T = (code, name, category, alarmGroups, params, extra = {}) => ({ code, name, category, alarmGroups, params, ...extra });

const temp = (k = 'temp', n = '温度') => i16(k, n, 0.1, '℃');
const hum = (k = 'hum', n = '湿度') => i16(k, n, 0.1, '%RH');
const mpa = (k = 'pressure', n = '压力') => i16(k, n, 0.001, 'MPa');
const lvl = (k = 'level', n = '液位') => i16(k, n, 0.01, 'm');

const AIR_BASE = [temp(), hum(), i16('pm1', 'PM1.0', 1, 'ug/m³'), i16('pm25', 'PM2.5', 1, 'ug/m³'), i16('pm10', 'PM10', 1, 'ug/m³')];

export const SIZE = { u8: 1, i16: 2, u16: 2, i32: 4, u32: 4, f32: 4, f64: 8 };

const LIST = [
  T(0, '压力表 kPa', '压力', 1, [i16('pressure', '压力', 0.1, 'kPa')]),
  T(1, '压力表 MPa', '压力', 1, [mpa()]),
  T(2, '压力表 BAR', '压力', 1, [i16('pressure', '压力', 0.01, 'Bar')]),
  T(3, '压力表 PSI', '压力', 1, [i16('pressure', '压力', 0.1, 'PSI')]),
  T(4, '压力表 Pa', '压力', 1, [i16('pressure', '压力', 1, 'Pa')]),
  T(5, '压力表 mBAR', '压力', 1, [i16('pressure', '压力', 1, 'mBar')]),
  T(6, '压力表 Kgf/cm2', '压力', 1, [i16('pressure', '压力', 0.01, 'Kgf/cm²')]),
  T(7, '压力表 mmHg', '压力', 1, [i16('pressure', '压力', 0.01, 'mmHg')]),
  T(8, '液位表 m', '液位', 1, [lvl()]),
  T(9, '液位表 cm', '液位', 1, [i16('level', '液位', 0.1, 'cm')]),
  T(10, '液位表 mm', '液位', 1, [i16('level', '液位', 1, 'mm')]),
  T(11, '温度表 ℃', '温湿度', 1, [temp()]),
  T(12, '温度表 ℉', '温湿度', 1, [i16('temp', '温度', 0.1, '℉')]),
  T(13, '湿度表 %RH', '温湿度', 1, [hum()]),
  T(14, '电流表', '电力', 1, [i16('current', '电流', 0.1, 'A')]),
  T(15, '电压表', '电力', 1, [i16('voltage', '电压', 0.1, 'V')]),
  T(16, '差压表（静压/差压）', '压力', 2, [mpa('static', '静压'), i16('diff', '差压', 0.1, 'kPa')]),
  T(17, '温压表（压力/温度）', '压力', 2, [mpa(), temp()]),
  T(18, '温湿度表', '温湿度', 2, [hum(), temp()]),
  T(19, '振动', '振动', 1, [i16('vibration', '振动', 0.1, 'mm/s')]),
  T(20, '水浸', '安防', 1, [i16('water', '水浸模拟量', 1, '')]),
  T(21, '差压表（进压/回压）', '压力', 2, [i16('inlet', '进压', 1, 'kPa'), i16('outlet', '回压', 1, 'kPa')]),
  T(22, '压力表 Pa(10)', '压力', 1, [i16('pressure', '压力', 10, 'Pa')]),
  T(23, '倾角', '姿态', 1, [i16('tilt', '倾角', 1, '°')]),
  T(24, '消火栓（压力/倾角）', '消防', 2, [mpa(), i16('tilt', '倾角', 1, '°')], {
    alarmNote: { 7: '放水报警', 6: '倾斜报警', 5: '撞击报警', 1: '压力高报警', 0: '压力低报警' },
  }),
  T(25, '双温度表', '温湿度', 2, [temp('temp1', '温度1'), temp('temp2', '温度2')]),
  T(26, '力 kN', '力学', 1, [i16('force', '力', 1, 'kN')]),
  T(27, '流量计', '流量', 1, [
    f32('flow', '瞬时流量', 'm³/h'), f32('velocity', '瞬时流速', 'm/s'),
    u32('fwdTotal', '正累积流量', 1, 'm³'), u32('netTotal', '净累积流量', 1, 'm³'),
  ]),
  T(28, '16通道开关量采集终端', '开关量', 1, [bits('di', '1-16通道状态', 'u16', 16)]),
  T(29, '液位表（超声波&液位探头）', '液位', 1, [lvl('probe', '液位探头'), lvl('ultra', '超声波'), lvl('level', '换算值')]),
  T(30, '超声波液位表', '液位', 1, [lvl()]),
  T(31, '可燃气体', '气体', 1, [u16('lel', '浓度', 0.1, '%LEL')]),
  T(32, '定位坐标', '定位', 1, [f64('lng', '经度', '°', { chart: false }), f64('lat', '纬度', '°', { chart: false })], { geo: ['lng', 'lat'] }),
  T(33, '液位&压力表', '液位', 2, [lvl(), mpa()]),
  T(34, '消火栓压力', '消防', 1, [mpa()], { alarmNote: { 7: '放水报警' } }),
  T(35, '差压表 kPa', '压力', 1, [i16('diff', '差压', 0.1, 'kPa')]),
  T(36, '消防栓闷盖', '消防', 2, [i16('water', '水浸AD', 1, ''), i16('cover', '闷盖AD', 1, '')], {
    alarmNote: { 0: '闷盖浸水报警', 6: '开盖报警', 5: '撞击报警' },
  }),
  T(37, '井盖状态仪', '井盖', 1, [i16('switch', '开关AD', 1, '')]),
  T(38, '液位&温度表', '液位', 2, [lvl(), temp()]),
  T(39, '温度&异动', '温湿度', 2, [temp(), i16('switch', '开关AD', 1, '')], { alarmNote: { 5: '异动报警' } }),
  T(40, '井盖液位', '井盖', 1, [lvl()], { alarmNote: { 7: '井盖开启报警' } }),
  T(41, '噪声', '环境', 1, [i16('noise', '噪声', 1, 'dB')]),
  T(42, '雷达测距仪', '液位', 1, [i16('distance', '距离', 0.01, 'm')]),
  T(43, '32通道开关量采集终端', '开关量', 2, [bits('di', '1-32通道状态', 'u32', 32)]),
  T(44, '风速仪', '环境', 1, [i16('dp', '差压', 1, 'Pa'), i16('wind', '风速', 0.01, 'm/s'), i16('airflow', '风量', 1, 'm³/min')]),
  T(45, 'MODBUS 采集终端', '采集终端', 1, [], { special: 'modbus' }),
  T(46, '磁致伸缩液位计', '液位', 1, [i16('level', '液位', 0.001, 'mm')]),
  T(47, 'PH 检测仪', '水质', 1, [i16('ph', 'pH', 0.01, 'pH')]),
  T(48, '电导率检测仪', '水质', 1, [i16('ec', '电导率', 0.1, 'uS/cm')]),
  T(49, '液位&倾角', '液位', 2, [lvl(), i16('tilt', '倾角', 1, '°')]),
  T(50, '4通道压力温度检测仪', '压力', 1, [
    mpa('p1', '压力1'), mpa('p2', '压力2'), temp('t1', '温度1'), temp('t2', '温度2'), i16('flow', '流量', 0.01, 'm³/h'),
  ]),
  T(51, 'ORP 检测仪', '水质', 1, [i16('orp', 'ORP', 1, 'mV')]),
  T(52, '力 kN(32位)', '力学', 1, [i32('force', '力', 1, 'kN')]),
  T(53, '流量计（累计）', '流量', 1, [u32('total', '累计流量', 0.01, 'm³')]),
  T(54, '氨氮检测仪', '水质', 1, [i16('nh3n', '氨氮', 0.1, 'mg/L'), i16('ph', 'pH', 0.1, 'pH'), temp()]),
  T(55, 'COD 检测仪', '水质', 1, [i16('cod', 'COD', 0.1, 'mg/L'), i16('turbidity', '浊度', 0.1, 'NTU'), temp()]),
  T(56, '溶解氧检测仪', '水质', 1, [
    i16('do', '溶解氧', 0.01, 'mg/L'), temp(), en('doUnit', '溶解氧单位', 'i16', { 0: 'mg/L', 1: 'ppm', 2: '%sat' }),
  ]),
  T(57, '浊度检测仪', '水质', 1, [i16('turbidity', '浊度', 0.1, 'NTU')]),
  T(58, '消火栓流量', '消防', 1, [mpa(), i16('tilt', '倾角', 1, '°'), i16('flow', '流量', 0.01, 'L/s'), temp()], {
    alarmNote: { 7: '放水报警', 6: '倾斜报警', 5: '撞击报警', 1: '压力高报警', 0: '压力低报警' },
  }),
  T(59, '门磁开关', '安防', 1, [u16('count', '红外计数', 1, '次')]),
  T(60, '电表', '电力', 1, [
    u32('energy', '有功总电量', 0.01, 'kWh'),
    u16('ua', 'A相电压', 0.1, 'V'), u16('ub', 'B相电压', 0.1, 'V'), u16('uc', 'C相电压', 0.1, 'V'),
    u16('ia', 'A相电流', 0.01, 'A'), u16('ib', 'B相电流', 0.01, 'A'), u16('ic', 'C相电流', 0.01, 'A'),
    u16('power', '总有功功率', 0.001, 'kW'), u16('pf', '总功率因数', 0.001, ''),
  ]),
  T(61, '压力（无符号）', '压力', 1, [u16('pressure', '压力', 0.01, 'MPa')]),
  T(62, '振弦&温度', '力学', 2, [i32('vw', '振弦', 0.01, '模数'), i32('temp', '温度', 0.1, '℃')]),
  T(63, '液位（0.001m）', '液位', 2, [u16('level', '液位', 0.001, 'm')]),
  T(64, '蓝绿藻', '水质', 2, [i32('algae', '蓝绿藻', 1, 'cell/mL'), i32('temp', '温度', 0.1, '℃')]),
  T(65, '三通道温度', '温湿度', 1, [temp('t1', '温度1'), temp('t2', '温度2'), temp('t3', '温度3')]),
  T(66, '双通道压力', '压力', 2, [mpa('p1', '压力1'), i16('p2', '压力2', 0.01, 'kPa')]),
  T(67, '智能井盖监测终端', '井盖', 2, [i16('water', '水浸', 1, ''), i16('tilt', '倾角', 1, '°')], {
    alarmNote: { 0: '闷盖浸水报警', 6: '倾斜报警', 5: '异动报警' },
  }),
  T(68, 'PH 监测终端', '水质', 2, [i16('ph', 'pH', 0.01, 'pH'), temp()]),
  T(69, '电导率监测终端', '水质', 2, [i32('ec', '电导率', 0.1, 'uS/cm'), i32('temp', '温度', 0.1, '℃')]),
  T(70, '拉线位移', '位移', 1, [i32('disp', '位移', 0.01, 'mm')]),
  T(71, '水质分析仪', '水质', 1, [
    i16('nh3n', '氨氮', 0.1, 'mg/L'), i16('no3n', '硝氮', 0.1, 'mg/L'), i16('cl', '氯离子', 0.1, 'mg/L'),
    i16('ph', 'pH', 0.01, 'pH'), temp(),
  ]),
  T(72, '智能空气质量监测终端', '空气质量', 1, [
    ...AIR_BASE, i16('co2', 'CO2', 1, 'ppm'), i16('ch2o', '甲醛', 0.001, 'mg/m³'), i16('tvoc', 'TVOC', 0.01, 'mg/m³'),
  ]),
  T(73, '燃气流量表', '流量', 1, [
    f32('stdFlow', '标况流量', 'm³/h'), f32('workFlow', '工况流量', 'm³/h'),
    f64('stdTotal', '标况累计流量', 'm³'), f64('workTotal', '工况累计流量', 'm³'),
    f32('temp', '温度', '℃'), f32('pressure', '压力', 'kPa'), i16('status', '状态', 1, '', { kind: 'raw', chart: false }),
  ]),
  T(74, '多普勒流速仪', '流量', 1, [i16('velocity', '流速', 0.001, 'm/s'), i16('level', '液位', 0.001, 'm'), temp()]),
  T(75, '光照度', '环境', 1, [i16('lux', '光照度', 1, 'lux')]),
  T(76, '光照度（无符号）', '环境', 1, [u16('lux', '光照度', 1, 'lux')]),
  T(77, '乙醇', '气体', 1, [i16('ethanol', '乙醇', 1, 'ppm')]),
  T(78, '智能空气质量监测终端(02)', '空气质量', 1, [
    ...AIR_BASE, i16('co2', 'CO2', 1, 'ppm'), i16('o2', 'O2', 0.1, '%'), i16('tvoc', 'TVOC', 0.01, 'mg/m³'),
  ]),
  T(79, '智能空气质量监测终端(S)', '空气质量', 1, [
    ...AIR_BASE, i16('h2s', '硫化氢', 0.01, 'ppm'), i16('nh3', '氨气', 0.1, 'ppm'), i16('so2', '二氧化硫', 0.01, 'ppm'),
  ]),
  T(80, '温度表 0.01℃', '温湿度', 1, [i16('temp', '温度', 0.01, '℃')]),
  // 文档中“数据总字节长度”为 1，但参数类型写的是 16 位有符号整型；按 2 字节解析，长度不符时解码器会自动回退。
  T(81, '气体探测器', '气体', 1, [i16('gas', '气体浓度', 1, 'umol/mol')]),
  T(83, '土壤温湿度', '环境', 1, [hum(), temp(), i16('ec', '电导率', 1, 'uS/cm')]),
  T(84, '雷达液位计', '液位', 1, [i32('level', '液位', 0.001, 'm')]),
  T(86, '振弦温度', '力学', 2, [i32('freq', '振弦频率', 0.1, 'Hz'), i32('temp', '温度', 0.1, '℃')]),
  T(87, '余氯检测仪', '水质', 2, [i16('cl', '余氯', 0.01, 'mg/L'), temp()]),
  T(88, '3压力1温度检测仪', '压力', 1, [
    mpa('p1', '压力1'), mpa('p2', '压力2'), mpa('p3', '压力3'), temp(), i16('flow', '流量', 0.01, 'm³/h'),
  ]),
  T(89, '流量定位', '流量', 1, [
    f32('flow', '瞬时流量', 'm³/h'), f32('velocity', '瞬时流速', 'm/s'),
    i32('fwdTotal', '正累积流量', 1, 'm³'), i32('netTotal', '净累积流量', 1, 'm³'), i32('dayTotal', '日累积流量', 0.1, 'm³'),
    f64('lng', '经度', '°', { chart: false }), f64('lat', '纬度', '°', { chart: false }),
  ], { geo: ['lng', 'lat'] }),
  T(90, '液位双路报警器', '液位', 2, [lvl('level1', '液位一'), lvl('level2', '液位二')]),
  T(91, '八通道温度', '温湿度', 1, Array.from({ length: 8 }, (_, i) => temp(`t${i + 1}`, `温度${i + 1}`))),
  T(92, '四通道温度', '温湿度', 1, Array.from({ length: 4 }, (_, i) => temp(`t${i + 1}`, `温度${i + 1}`))),
  T(93, '液位温湿度', '液位', 1, [lvl(), hum(), temp()]),
  T(96, '智能空气质量监测终端(CO/SO2)', '空气质量', 1, [
    ...AIR_BASE, i16('co2', 'CO2', 1, 'ppm'), i16('co', 'CO', 1, 'ppm'), i16('so2', '二氧化硫', 0.01, 'ppm'),
  ]),
  T(99, '可燃气体（多气体）', '气体', 1, [
    en('gasType', '气体类型', 'i16', { 30: '甲烷', 60: '甲烷', 61: '丙烷', 62: '丁烷' }),
    en('sensorStatus', '传感器状态', 'i16', { 0: '正常', 1: 'STEL', 2: 'TWA', 3: '超量程', 4: '传感器损坏', 5: '高浓度保护' }),
    i16('lel', '浓度', 0.1, '%LEL'),
    i16('reserved', '保留', 1, '', { kind: 'raw', chart: false }),
  ]),
  T(100, '16DI+8AI+4DO 采集终端', '开关量', 1, [
    bits('di', 'DI 1-16 通道', 'u16', 16),
    ...Array.from({ length: 8 }, (_, i) => u16(`ai${i + 1}`, `${i + 1}通道电流`, 0.01, 'mA')),
    bits('do', 'DO 1-4 通道', 'u16', 4),
  ]),
  T(101, '控制器 8DI_4DO', '开关量', 1, [
    i16('channels', '采集通道个数', 1, '', { kind: 'raw', chart: false }),
    bits('di', 'DI 1-16 通道', 'i16', 16),
    bits('do', 'DO 1-4 通道', 'i16', 4),
  ]),
  T(102, '声光报警器', '安防', 1, [en('state', '报警状态', 'i16', { 1: '声光报警打开', 2: '声光报警关闭' })]),
];

export const DEVICE_TYPES = new Map(LIST.map((t) => [t.code, t]));

/** 单条数据记录（表五）的字节长度 */
export function recordLength(def) {
  return def.params.reduce((s, p) => s + SIZE[p.type], 0);
}

/**
 * 表四 报警参数结构体的预期长度：每个报警组 = 下限 + 上限，类型与对应参数相同。
 * 报警组个数多于参数个数时（如 43/63 类型）沿用参数①的类型。
 */
export function alarmLength(def) {
  if (def.special === 'modbus') return 4;
  let n = 0;
  for (let g = 0; g < def.alarmGroups; g++) {
    const p = def.params[g] ?? def.params[0];
    n += 2 * SIZE[p.type];
  }
  return n;
}

export function getDeviceType(code) {
  return DEVICE_TYPES.get(code) ?? null;
}

/** 表二简要清单，供前端展示 */
export function listDeviceTypes() {
  return LIST.map((t) => ({
    code: t.code,
    name: t.name,
    category: t.category,
    alarmGroups: t.alarmGroups,
    recordBytes: t.special === 'modbus' ? null : recordLength(t),
    special: t.special ?? null,
    alarmNote: t.alarmNote ?? null,
    geo: t.geo ?? null,
    params: t.params.map(({ key, name, type, scale, unit, kind, bits: b, enum: e, chart }) => ({
      key, name, type, scale, unit, kind, bits: b, enum: e, chart: chart !== false && kind === 'num',
    })),
  }));
}
