import * as P from './vendor/protocol.js';
import { telemetry } from './types';
import type { Source, Snapshot, Response } from './types';

type Job = { cmd: string; fields: Record<string, unknown>; resolve: (v: Response) => void; reject: (e: Error) => void };
type Pending = Job & { timer: ReturnType<typeof setTimeout> };
const controlCommands = new Set(['start', 'set_resistance']);
const asError = (e: unknown) => e instanceof Error ? e : new Error(String(e));

export class RehabBleClient implements Source {
  readonly mode = 'ble' as const;
  connected = false;
  snapshot: Snapshot | null = null;
  onState: Source['onState'] = () => {};
  onDisconnect: Source['onDisconnect'] = () => {};
  onError: Source['onError'] = () => {};
  private device?: BluetoothDevice;
  private characteristic?: BluetoothRemoteGATTCharacteristic;
  private subscriptions: Array<[BluetoothRemoteGATTCharacteristic, EventListener]> = [];
  private epoch = 0;
  private requestId = 0;
  private messageId = 0;
  private pumping = false;
  private queue: Job[] = [];
  private pending = new Map<number, Pending>();
  private heartbeat?: ReturnType<typeof setInterval>;
  private controller = false;
  private connecting = false;
  private disconnected = () => this.cleanup('藍牙連線已中斷，請重新連接單車。');

  async connect(reuse = false): Promise<void> {
    if (this.connecting || this.connected) throw new Error('正在連線或已連線');
    if (!globalThis.isSecureContext || !navigator.bluetooth) throw new Error('實機連線需要 HTTPS 或 localhost，並使用支援 Web Bluetooth 的 Chrome／Edge。你仍可使用模擬體驗。');
    this.connecting = true;
    const epoch = ++this.epoch;
    try {
      if (!reuse || !this.device) {
        this.device?.removeEventListener('gattserverdisconnected', this.disconnected);
        this.device = await navigator.bluetooth.requestDevice({ filters: [{ services: [P.UUID.service] }] });
        if (epoch !== this.epoch) throw new Error('連線已取消');
        this.device.addEventListener('gattserverdisconnected', this.disconnected);
      }
      const server = await this.device.gatt!.connect();
      const service = await server.getPrimaryService(P.UUID.service);
      const info = P.decodeJson(await (await service.getCharacteristic(P.UUID.info)).readValue());
      if (info.v !== 1 || info.protocol !== 1) throw new Error('不支援的韌體協定版本，需要 WebBLE v1。');
      if (epoch !== this.epoch) throw new Error('連線已取消');
      this.characteristic = await service.getCharacteristic(P.UUID.command);
      this.requestId = 0;
      this.messageId = 0;
      for (const kind of ['response', 'event', 'state'] as const) {
        const ch = await service.getCharacteristic(P.UUID[kind]);
        const assembler = new P.FrameReassembler(P.CHANNEL[kind]);
        const listener: EventListener = (e) => {
          if (epoch !== this.epoch) return;
          try {
            const frame = assembler.push((e.target as BluetoothRemoteGATTCharacteristic).value!, performance.now());
            if (!frame) return;
            const value = P.decodeJson(frame);
            if (value.v !== 1 || value.type !== kind) throw new Error('不支援的通知格式');
            if (kind === 'state') {
              const state = telemetry(value);
              if (this.snapshot && state.uptime_ms >= this.snapshot.state.uptime_ms && state.seq <= this.snapshot.state.seq) return;
              this.snapshot = { state, receivedAt: performance.now() };
              this.controller = state.lease.you_control && !state.lease.stopping;
              this.onState(this.snapshot);
            } else if (kind === 'response') {
              const job = this.pending.get(value.id);
              if (!job || job.cmd !== value.cmd) return;
              this.pending.delete(value.id); clearTimeout(job.timer);
              this.controller = value.lease?.you_control === true && !value.lease?.stopping;
              if (this.snapshot && value.lease) this.snapshot.state.lease = { ...value.lease };
              if (value.ok === true) job.resolve(value);
              else job.reject(new Error(value.error || '命令被機台拒絕'));
            }
            // Events may contain card identifiers; deliberately do not retain them.
          } catch (error) { assembler.reset(); this.onError('接收資料失敗：' + asError(error).message); }
        };
        ch.addEventListener('characteristicvaluechanged', listener);
        this.subscriptions.push([ch, listener]);
        await ch.startNotifications();
      }
      if (epoch !== this.epoch) throw new Error('連線已取消');
      this.connected = true;
      await this.send('get_state');
      this.heartbeat = setInterval(() => {
        if (this.connected && this.controller) void this.send('heartbeat').catch(e => {
          this.onError('控制權續租失敗：' + asError(e).message);
          // Closing GATT lets firmware revoke the lease, rather than retaining an uncertain owner.
          this.disconnect();
        });
      }, 10000);
    } catch (error) {
      if (epoch === this.epoch) this.disconnect();
      throw asError(error);
    } finally { this.connecting = false; }
  }

  send(cmd: string, fields: Record<string, unknown> = {}): Promise<Response> {
    if (!this.connected || !this.characteristic) return Promise.reject(new Error('尚未連線'));
    try { P.command(cmd, 1, fields); } catch (e) { return Promise.reject(e); }
    return new Promise((resolve, reject) => {
      const job = { cmd, fields, resolve, reject };
      if (cmd === 'stop' || cmd === 'release') {
        this.queue = this.queue.filter(old => {
          if (!controlCommands.has(old.cmd)) return true;
          old.reject(new Error('控制命令已由停止操作取消')); return false;
        });
        this.queue.unshift(job);
      } else this.queue.push(job);
      void this.pump();
    });
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    const epoch = this.epoch, characteristic = this.characteristic!;
    try {
      while (this.queue.length && this.connected && epoch === this.epoch) {
        const job = this.queue.shift()!;
        if (this.requestId >= 0xffffffff) { job.reject(new Error('命令序號已用盡，請重新連線')); this.disconnect(); break; }
        // IDs follow actual write order, including priority Stop, never enqueue order.
        const id = ++this.requestId;
        const data = P.encodeJson(P.command(job.cmd, id, job.fields));
        const timer = setTimeout(() => {
          if (epoch !== this.epoch) return;
          this.pending.delete(id); job.reject(new Error('命令回覆逾時，未自動重送'));
        }, 8000);
        this.pending.set(id, { ...job, timer });
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          const write = async () => {
            for (const frame of P.chunkPayload(data, 20, this.messageId = (this.messageId + 1) & 0xffff, P.CHANNEL.command)) {
              if (epoch !== this.epoch) throw new Error('舊連線命令已取消');
              await characteristic.writeValueWithResponse(frame as Uint8Array<ArrayBuffer>);
            }
          };
          await Promise.race([write(), new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('藍牙寫入逾時')), 1900); })]);
        } catch (error) {
          if (epoch === this.epoch) {
            this.pending.delete(id); clearTimeout(timer); job.reject(asError(error));
            // Never send another fragmented command after a partial/unknown write.
            this.disconnect();
          }
          break;
        } finally { clearTimeout(deadline); }
      }
    } finally { if (epoch === this.epoch) this.pumping = false; }
  }

  private cleanup(reason: string) {
    ++this.epoch;
    const hadConnection = this.connected;
    this.connected = false; this.controller = false; this.snapshot = null; this.characteristic = undefined; this.pumping = false;
    clearInterval(this.heartbeat);
    for (const [ch, listener] of this.subscriptions) ch.removeEventListener('characteristicvaluechanged', listener);
    this.subscriptions.length = 0;
    for (const job of this.queue) job.reject(new Error(reason));
    this.queue.length = 0;
    for (const job of this.pending.values()) { clearTimeout(job.timer); job.reject(new Error(reason)); }
    this.pending.clear();
    if (hadConnection) this.onDisconnect(reason);
  }
  disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    // The disconnect event can be deferred; invalidate immediately either way.
    this.cleanup('已斷開連線，未完成的命令已取消。');
  }
}
