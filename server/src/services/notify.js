import crypto from 'node:crypto';
import { getDeviceType } from '../protocol/deviceTypes.js';

const LEVEL_TEXT = { high: '高', mid: '中', low: '低' };

function fmtValue(def, key, v) {
  const p = def?.params.find((x) => x.key === key);
  if (!p) return `${key} ${v}`;
  if (p.kind === 'enum') return `${p.name} ${p.enum?.[v] ?? v}`;
  if (p.kind !== 'num') return `${p.name} ${v}`;
  return `${p.name} ${v}${p.unit ? ` ${p.unit}` : ''}`;
}

function fmtTime(ms, tzHours) {
  return new Date(ms + tzHours * 3600000).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * 报警推送：新报警（以及可选的恢复）推送到企业微信 / 钉钉 / 飞书机器人或通用 Webhook。
 * 设备档案中“告警推送”关闭的设备不推送。
 */
export class NotifyService {
  constructor({ config, query, bus, logger, fetchImpl = fetch }) {
    this.config = config;
    this.query = query;
    this.logger = logger;
    this.fetch = fetchImpl;
    this.last = null;
    this.sent = 0;
    this.failed = 0;
    bus.on('alarm', (a) => {
      if (a.state === 'open' || (a.state === 'closed' && this.config.notifyRecover)) {
        this.onAlarm(a).catch((e) => this.logger.warn(`[notify] ${e.message}`));
      }
    });
  }

  status() {
    return { enabled: Boolean(this.config.notifyEnabled && this.config.notifyUrl), sent: this.sent, failed: this.failed, last: this.last };
  }

  async onAlarm(a) {
    if (!this.config.notifyEnabled || !this.config.notifyUrl) return;
    const dev = this.query.getDevice(a.deviceId);
    if (dev && !dev.alarmPush) return;
    await this.send(this.buildMessage(a, dev), { alarm: a, device: dev });
  }

  buildMessage(a, dev) {
    const def = getDeviceType(dev?.typeCode ?? a.typeCode);
    const title = a.state === 'closed' ? '【报警恢复】' : `【设备报警·${LEVEL_TEXT[a.level] ?? '高'}】`;
    const values = Object.entries(a.realtime || dev?.realtime || {}).filter(([k]) => k !== '_modbus').slice(0, 4).map(([k, v]) => fmtValue(def, k, v)).join('，');
    const lines = [
      `${title}${a.label ?? ''}`,
      `设备：${dev?.name ? `${dev.name}（${a.deviceId}）` : a.deviceId}`,
      dev?.typeName ? `类型：${dev.typeName}${dev.model ? ` / ${dev.model}` : ''}` : null,
      values ? `实时数据：${values}` : null,
      dev?.location ? `位置：${dev.location}` : null,
      dev?.owner ? `负责人：${dev.owner}${dev.contact ? ` ${dev.contact}` : ''}` : null,
      `时间：${fmtTime(a.at ?? Date.now(), this.config.tzOffsetHours)}`,
    ];
    return lines.filter(Boolean).join('\n');
  }

  /** 按机器人类型组装请求 */
  buildRequest(text, extra = {}) {
    const type = this.config.notifyType || 'wecom';
    let url = this.config.notifyUrl;
    const secret = this.config.notifySecret;
    let body;
    if (type === 'wecom') {
      body = { msgtype: 'text', text: { content: text } };
    } else if (type === 'dingtalk') {
      body = { msgtype: 'text', text: { content: text } };
      if (secret) {
        const ts = Date.now();
        const sign = crypto.createHmac('sha256', secret).update(`${ts}\n${secret}`).digest('base64');
        url += `${url.includes('?') ? '&' : '?'}timestamp=${ts}&sign=${encodeURIComponent(sign)}`;
      }
    } else if (type === 'feishu') {
      body = { msg_type: 'text', content: { text } };
      if (secret) {
        const ts = Math.floor(Date.now() / 1000);
        body.timestamp = String(ts);
        body.sign = crypto.createHmac('sha256', `${ts}\n${secret}`).update('').digest('base64');
      }
    } else {
      body = { event: extra.alarm?.state === 'closed' ? 'alarm.closed' : 'alarm', text, alarm: extra.alarm ?? null, device: extra.device ?? null };
    }
    return { url, body };
  }

  async send(text, extra) {
    const { url, body } = this.buildRequest(text, extra);
    const at = Date.now();
    try {
      const res = await this.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const resText = (await res.text()).slice(0, 300);
      // 企业微信 / 钉钉 返回 errcode，飞书返回 code，非 0 视为失败
      let ok = res.ok;
      try {
        const j = JSON.parse(resText);
        if ((j.errcode !== undefined && j.errcode !== 0) || (j.code !== undefined && j.code !== 0)) ok = false;
      } catch { /* 非 JSON 响应 */ }
      this.last = { at, ok, status: res.status, response: resText };
      if (ok) this.sent++;
      else this.failed++;
      return this.last;
    } catch (e) {
      this.failed++;
      this.last = { at, ok: false, error: e.name === 'TimeoutError' ? '请求超时' : e.message };
      return this.last;
    }
  }

  async test() {
    if (!this.config.notifyUrl) throw Object.assign(new Error('请先填写推送地址'), { status: 400 });
    return this.send(`【测试消息】平台告警推送配置成功\n时间：${fmtTime(Date.now(), this.config.tzOffsetHours)}`, { alarm: { state: 'test' } });
  }
}
