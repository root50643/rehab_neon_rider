import type { Source, Snapshot, Telemetry, Response } from './types';
export class Simulator implements Source {
  readonly mode = 'demo' as const;
  connected = false;
  snapshot: Snapshot | null = null;
  onState: Source['onState'] = () => {};
  onDisconnect: Source['onDisconnect'] = () => {};
  onError: Source['onError'] = () => {};
  rpm = 60;
  private timer?: ReturnType<typeof setInterval>;
  private seq = 0;
  private running = false;
  private controller = false;
  private level = 10;
  async connect() { this.connected = true; this.publish(); this.timer = setInterval(() => this.publish(), 100); }
  private publish() {
    if (!this.connected) return;
    const now = performance.now();
    const state: Telemetry = { v: 1, type: 'state', seq: ++this.seq, uptime_ms: Math.round(now),
      lease: { owner: this.controller ? 1 : null, you_control: this.controller, remaining_ms: this.controller ? 30000 : 0, stopping: false },
      heart: { bpm: this.running ? Math.round(84 + this.rpm * .36) : 78, age_ms: 0, ready: true },
      machine: { rpm: this.running ? this.rpm : 0, age28_ms: 0, reported_level: this.level, age3f_ms: 0,
        target_level: this.level, sent_level: this.level, level_ack_pending: false, level_queued: false, tracking: this.running, uart_online: true, pulse: 'idle', timeouts: 0 },
    };
    this.snapshot = { state, receivedAt: now }; this.onState(this.snapshot);
  }
  async send(cmd: string, fields: Record<string, unknown> = {}): Promise<Response> {
    if (!this.connected) throw new Error('模擬連線已中斷');
    if (cmd === 'claim') this.controller = true;
    if (cmd === 'start') this.running = true;
    if (cmd === 'stop' || cmd === 'release') this.running = false;
    if (cmd === 'release') this.controller = false;
    if (cmd === 'set_resistance') this.level = Number(fields.level);
    this.publish();
    return { v: 1, type: 'response', id: this.seq, cmd, ok: true, lease: this.snapshot!.state.lease };
  }
  disconnect() { clearInterval(this.timer); this.connected = false; this.controller = false; this.running = false; this.snapshot = null; this.onDisconnect('模擬裝置已斷線，可按重新連接恢復。'); }
}
