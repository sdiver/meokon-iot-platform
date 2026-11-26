import { startTcpServer } from './tcp.js';
import { startUdpServer } from './udp.js';
import { startEmbeddedBroker, startMqttClient } from './mqtt.js';

const mask = (url) => url.replace(/\/\/[^@/]*@/, '//***@');

/**
 * 管理各接入服务的生命周期，支持在修改设置后单独重启 TCP / UDP / MQTT。
 * 启动失败（如端口被占用）只记录错误，不影响平台其他部分运行。
 */
export class TransportManager {
  constructor({ config, ingest, logger }) {
    this.config = config;
    this.ingest = ingest;
    this.logger = logger;
    this.tcp = null;
    this.udp = null;
    this.broker = null;
    this.mqtt = null;
    this.errors = { tcp: null, udp: null, mqttBroker: null };
    this.queue = Promise.resolve();
  }

  /** 串行执行，避免并发重启 */
  run(fn) {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => {});
    return p;
  }

  async startTcp() {
    const c = this.config;
    this.errors.tcp = null;
    if (!c.tcpEnabled) return;
    try {
      this.tcp = await startTcpServer({ port: c.tcpPort, ingest: this.ingest, logger: this.logger, idleCloseMs: () => c.tcpIdleCloseMs });
      this.tcp.port = c.tcpPort;
    } catch (e) {
      this.errors.tcp = e.message;
      this.logger.error(`[tcp] 启动失败：${e.message}`);
    }
  }

  async startUdp() {
    const c = this.config;
    this.errors.udp = null;
    if (!c.udpEnabled) return;
    try {
      this.udp = await startUdpServer({ port: c.udpPort, ingest: this.ingest, logger: this.logger });
      this.udp.port = c.udpPort;
    } catch (e) {
      this.errors.udp = e.message;
      this.logger.error(`[udp] 启动失败：${e.message}`);
    }
  }

  async startMqtt() {
    const c = this.config;
    this.errors.mqttBroker = null;
    if (c.mqttBrokerEnabled) {
      try {
        this.broker = await startEmbeddedBroker({ port: c.mqttBrokerPort, logger: this.logger, username: c.mqttBrokerUsername, password: c.mqttBrokerPassword });
        this.broker.port = c.mqttBrokerPort;
      } catch (e) {
        this.errors.mqttBroker = e.message;
        this.logger.error(`[mqtt] 内置 Broker 启动失败：${e.message}`);
      }
    }
    // 外部 Broker 优先；否则连接内置 Broker
    let url = c.mqttUrl;
    let username = c.mqttUsername;
    let password = c.mqttPassword;
    if (!url && this.broker) {
      url = `mqtt://127.0.0.1:${c.mqttBrokerPort}`;
      username = c.mqttBrokerUsername;
      password = c.mqttBrokerPassword;
    }
    if (url) {
      this.mqtt = startMqttClient({
        url, username, password, uplinkTopic: c.mqttUplinkTopic, downlinkPrefix: c.mqttDownlinkPrefix,
        ingest: this.ingest, logger: this.logger,
      });
      this.mqtt.external = Boolean(c.mqttUrl);
    }
  }

  async stopTcp() { if (this.tcp) { await this.tcp.close(); this.tcp = null; } }
  async stopUdp() { if (this.udp) { await this.udp.close(); this.udp = null; } }
  async stopMqtt() {
    if (this.mqtt) { await this.mqtt.close(); this.mqtt = null; }
    if (this.broker) { await this.broker.close(); this.broker = null; }
  }

  startAll() {
    return this.run(async () => {
      await this.startTcp();
      await this.startUdp();
      await this.startMqtt();
    });
  }

  stopAll() {
    return this.run(async () => {
      await this.stopMqtt();
      await this.stopTcp();
      await this.stopUdp();
    });
  }

  /** @param {Iterable<string>} groups tcp | udp | mqtt */
  restart(groups) {
    return this.run(async () => {
      const g = new Set(groups);
      if (g.has('tcp')) { await this.stopTcp(); await this.startTcp(); }
      if (g.has('udp')) { await this.stopUdp(); await this.startUdp(); }
      if (g.has('mqtt')) {
        await this.stopMqtt();
        await this.startMqtt();
        // 等待客户端连上（最多 2 秒），以便界面立即显示状态
        for (let i = 0; i < 20 && this.mqtt && !this.mqtt.state.connected && !this.mqtt.state.error; i++) await new Promise((r) => setTimeout(r, 100));
      }
    });
  }

  status() {
    const c = this.config;
    const m = this.mqtt?.state;
    return {
      tcp: { enabled: c.tcpEnabled, running: Boolean(this.tcp), port: this.tcp?.port ?? c.tcpPort, error: this.errors.tcp },
      udp: { enabled: c.udpEnabled, running: Boolean(this.udp), port: this.udp?.port ?? c.udpPort, error: this.errors.udp },
      mqttBroker: { enabled: c.mqttBrokerEnabled, running: Boolean(this.broker), port: this.broker?.port ?? c.mqttBrokerPort, auth: Boolean(c.mqttBrokerUsername), error: this.errors.mqttBroker },
      mqtt: m
        ? { enabled: true, running: m.connected, external: this.mqtt.external, url: mask(m.url), connected: m.connected, received: m.received, error: m.error, uplinkTopic: c.mqttUplinkTopic, downlinkPrefix: c.mqttDownlinkPrefix }
        : { enabled: false, running: false, uplinkTopic: c.mqttUplinkTopic, downlinkPrefix: c.mqttDownlinkPrefix },
      http: { enabled: true, running: true, port: c.httpPort, endpoints: ['/api/push/raw', '/api/push/aep', '/api/push/onenet'] },
    };
  }
}
