export type Mode = 'demo' | 'ble';
export interface Lease { owner: number | null; you_control: boolean; remaining_ms: number; stopping: boolean }
export interface Machine {
  rpm: number | null; age28_ms: number | null;
  reported_level: number | null; age3f_ms: number | null;
  target_level: number | null; sent_level: number | null;
  level_ack_pending: boolean; level_queued: boolean;
  tracking: boolean; uart_online: boolean; pulse: string;
  state?: string | null; timeouts?: number; last_error?: string;
}
export interface Telemetry {
  v: 1; type: 'state'; seq: number; uptime_ms: number;
  lease: Lease; machine: Machine;
  heart: { bpm: number | null; age_ms: number | null; ready?: boolean };
}
export interface Response { v: 1; type: 'response'; id: number; cmd: string; ok: boolean; error?: string; lease: Lease }
export interface Snapshot { state: Telemetry; receivedAt: number }
export interface Source {
  readonly mode: Mode; connected: boolean; snapshot: Snapshot | null;
  onState: (snapshot: Snapshot) => void;
  onDisconnect: (reason: string) => void;
  onError: (message: string) => void;
  connect(reuse?: boolean): Promise<void>;
  send(cmd: string, fields?: Record<string, unknown>): Promise<Response>;
  disconnect(): void;
}
export interface ResistanceProfile { easy: number; flat: number; hard: number; step: number }
export type Quality = 'auto' | 'high' | 'low';
export interface Settings { referenceRpm: number; sound: boolean; reducedMotion: boolean; quality: Quality; profile: ResistanceProfile | null }
export interface RideSummary { date: string; mode: Mode; distance: number; seconds: number; averageRpm: number; score: number; maxCombo: number; completed: boolean }
export function fresh(value: number | null | undefined, age: number | null | undefined, receivedAt: number, ttl: number, now: number): number | null {
  // A requestAnimationFrame timestamp can precede a notification received in the
  // same frame. Both clocks are local; clamp that small negative elapsed time.
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && typeof age === 'number' && Number.isFinite(age) && age >= 0 && Math.max(0, now - receivedAt) + age < ttl ? value : null;
}
export function readings(s: Snapshot | null, now: number) {
  return {
    rpm: s ? fresh(s.state.machine.rpm, s.state.machine.age28_ms, s.receivedAt, 5000, now) : null,
    level: s ? fresh(s.state.machine.reported_level, s.state.machine.age3f_ms, s.receivedAt, 5000, now) : null,
    bpm: s ? fresh(s.state.heart.bpm, s.state.heart.age_ms, s.receivedAt, 10000, now) : null,
  };
}
export function hasControl(s: Snapshot | null, now: number): boolean {
  return !!s && s.state.lease.you_control && !s.state.lease.stopping && now - s.receivedAt < Math.min(5000, s.state.lease.remaining_ms);
}
// Drop RFID and other unused personal data immediately at the boundary.
export function telemetry(value: unknown): Telemetry {
  const s = value as Telemetry;
  if (!s || s.v !== 1 || s.type !== 'state' || !s.machine || !s.heart || !s.lease || !Number.isFinite(s.seq) || !Number.isFinite(s.uptime_ms)) throw new Error('不支援的機台資料格式');
  const m = s.machine, h = s.heart, l = s.lease;
  const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  return { v: 1, type: 'state', seq: s.seq, uptime_ms: s.uptime_ms,
    lease: { owner: number(l.owner), you_control: l.you_control === true, remaining_ms: number(l.remaining_ms) ?? 0, stopping: l.stopping === true },
    heart: { bpm: number(h.bpm), age_ms: number(h.age_ms), ready: h.ready === true },
    machine: { rpm: number(m.rpm), age28_ms: number(m.age28_ms), reported_level: number(m.reported_level), age3f_ms: number(m.age3f_ms), target_level: number(m.target_level), sent_level: number(m.sent_level),
      level_ack_pending: m.level_ack_pending === true, level_queued: m.level_queued === true, tracking: m.tracking === true, uart_online: m.uart_online === true,
      pulse: typeof m.pulse === 'string' ? m.pulse : 'unknown', state: typeof m.state === 'string' ? m.state : null, timeouts: number(m.timeouts) ?? 0, last_error: typeof m.last_error === 'string' ? m.last_error : '' },
  };
}
