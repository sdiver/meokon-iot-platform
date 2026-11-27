import { pal } from './theme.js';
import { fmtTime } from './format.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

function base(p = pal()) {
  return {
    color: p.series,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT, color: p.ink2 },
    animationDuration: 300,
    tooltip: {
      backgroundColor: p.surface,
      borderColor: p.grid,
      textStyle: { color: p.ink, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,.12); border-radius: 8px;',
    },
  };
}

function axisStyle(p) {
  return {
    axisLine: { lineStyle: { color: p.axis } },
    axisTick: { show: false },
    axisLabel: { color: p.ink2, fontSize: 11, hideOverlap: true },
    splitLine: { lineStyle: { color: p.grid, width: 1 } },
  };
}

function step(x) {
  const e = 10 ** Math.floor(Math.log10(Math.abs(x) || 1));
  return e / 2;
}
const niceFloor = (x) => Math.floor(x / step(x)) * step(x);
const niceCeil = (x) => Math.ceil(x / step(x)) * step(x);

/** 线条键（非色块）的 tooltip 行 */
function row(color, name, value) {
  const key = `<span style="display:inline-block;width:12px;height:2px;background:${color};vertical-align:middle;margin-right:6px;border-radius:1px"></span>`;
  return `<div style="display:flex;justify-content:space-between;gap:16px">${key ? `<span>${key}${escapeHtml(name)}</span>` : ''}<b>${escapeHtml(value)}</b></div>`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * 时间序列折线（单一 y 轴）。
 * @param {{series: Array<{name:string, data:Array<[number, number|null]>}>, unit?: string, area?: boolean, markLines?: Array<{name:string, value:number}>, timeFmt?: (ms:number)=>string, bar?: boolean}} o
 */
export function timeLine(o) {
  const p = o.palette || pal();
  const multi = o.series.length > 1;
  const fmtT = o.timeFmt || ((ms) => fmtTime(ms, false));
  return {
    ...base(p),
    grid: { left: 8, right: 16, top: multi ? 36 : 16, bottom: o.zoom ? 44 : 8, containLabel: true },
    legend: multi ? { top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 2, textStyle: { color: p.ink2 } } : undefined,
    tooltip: {
      ...base(p).tooltip,
      trigger: 'axis',
      axisPointer: { type: o.bar ? 'shadow' : 'line', lineStyle: { color: p.axis }, shadowStyle: { color: 'rgba(127,127,127,.08)' } },
      formatter: (items) => {
        if (!items.length) return '';
        const head = `<div style="color:${p.ink2};margin-bottom:4px">${fmtT(items[0].value[0])}</div>`;
        return head + items.map((it) => row(it.color, it.seriesName, it.value[1] == null ? '-' : `${+Number(it.value[1]).toFixed(4)}${o.unit ? ' ' + o.unit : ''}`)).join('');
      },
    },
    xAxis: { type: 'time', ...axisStyle(p), splitLine: { show: false }, axisLabel: { ...axisStyle(p).axisLabel, formatter: o.xFmt } },
    // 计数类图表 y 轴从 0 开始；测量值曲线（scale: true）按数据范围缩放
    yAxis: {
      type: 'value', scale: Boolean(o.scale), minInterval: o.scale ? 0 : 1, ...axisStyle(p), axisLine: { show: false },
      // 报警上下限始终可见
      ...(o.markLines?.length ? {
        min: (v) => niceFloor(Math.min(v.min, ...o.markLines.map((m) => m.value))),
        max: (v) => niceCeil(Math.max(v.max, ...o.markLines.map((m) => m.value))),
      } : {}),
    },
    dataZoom: o.zoom ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6, borderColor: 'transparent', textStyle: { color: p.ink2 } }] : undefined,
    series: o.series.map((s, i) => ({
      name: s.name,
      type: o.bar ? 'bar' : 'line',
      data: s.data,
      showSymbol: s.data.length < 40,
      symbolSize: 8,
      symbol: 'circle',
      itemStyle: { borderColor: p.surface, borderWidth: 2, borderRadius: o.bar ? [4, 4, 0, 0] : 0 },
      lineStyle: { width: 2 },
      barMaxWidth: 24,
      connectNulls: false,
      smooth: false,
      areaStyle: o.area && !multi ? { opacity: 0.12 } : undefined,
      color: s.color,
      markLine: i === 0 && o.markLines?.length ? {
        silent: true, symbol: 'none',
        lineStyle: { type: 'dashed', width: 1, color: '#dc3c3d' },
        label: { color: p.ink2, formatter: (d) => `${d.name} ${d.value}`, position: 'insideEndTop', fontSize: 11 },
        data: o.markLines.map((m) => ({ name: m.name, yAxis: m.value })),
      } : undefined,
    })),
  };
}

/** 类别条形图（默认水平，适合长类别名） */
export function categoryBar(items, { horizontal = true, unit = '', color, colors, name = '数量', palette } = {}) {
  const p = palette || pal();
  const cats = items.map((i) => i.name);
  const vals = items.map((i, k) => ({ value: i.value, itemStyle: colors ? { color: colors[k] } : undefined }));
  const cat = { type: 'category', data: horizontal ? [...cats].reverse() : cats, ...axisStyle(p), splitLine: { show: false }, axisLine: { show: !horizontal, lineStyle: { color: p.axis } } };
  const val = { type: 'value', minInterval: 1, ...axisStyle(p), axisLine: { show: false } };
  return {
    ...base(p),
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...base(p).tooltip,
      trigger: 'item',
      formatter: (it) => `<div style="color:${p.ink2};margin-bottom:4px">${escapeHtml(it.name)}</div>${row(it.color, name, `${it.value}${unit}`)}`,
    },
    xAxis: horizontal ? val : { ...cat, axisLabel: { ...cat.axisLabel, interval: 0, rotate: cats.some((c) => c.length > 6) ? 30 : 0 } },
    yAxis: horizontal ? cat : val,
    series: [{
      type: 'bar',
      name,
      data: horizontal ? [...vals].reverse() : vals,
      color: color || p.seq,
      barMaxWidth: horizontal ? 16 : 28,
      itemStyle: { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
      label: { show: items.length <= 12, position: horizontal ? 'right' : 'top', color: p.ink2, fontSize: 11, formatter: (d) => (d.value ? d.value : '') },
    }],
  };
}
