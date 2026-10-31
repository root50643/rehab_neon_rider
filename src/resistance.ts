import { hasControl, readings } from './types';
import type { ResistanceProfile, Snapshot, Response } from './types';
export function validProfile(p: ResistanceProfile | null): p is ResistanceProfile {
  if (!p || ![p.easy,p.flat,p.hard,p.step].every(v=>Number.isInteger(v)&&v>=1&&v<=65535)) return false;
  return p.easy !== p.hard && p.flat >= Math.min(p.easy,p.hard) && p.flat <= Math.max(p.easy,p.hard) && p.step <= Math.abs(p.hard-p.easy);
}
export function levelForGrade(p: ResistanceProfile, grade: number) {
  return Math.round(grade < 0 ? p.flat+(p.easy-p.flat)*Math.min(1,-grade/6) : p.flat+(p.hard-p.flat)*Math.min(1,grade/8));
}
export class ResistanceController {
  enabled = false;
  target: number | null = null;
  sent: number | null = null;
  error: string | null = null;
  private pending: { level: number; at: number; seq: number; timeouts: number; accepted: boolean } | null = null;
  private lastSent = -Infinity;
  private epoch = 0;
  constructor(public profile: ResistanceProfile | null, private send: (level: number) => Promise<Response>, private onFault: (reason: string) => void) {}
  stop() { ++this.epoch; this.enabled = false; this.pending = null; this.target = null; }
  enable() { if (!validProfile(this.profile)) throw new Error('請先填妥機台阻力設定'); this.error = null; this.enabled = true; this.lastSent = -Infinity; }
  tick(grade: number, snapshot: Snapshot | null, now: number) {
    if (!this.enabled || !validProfile(this.profile)) return;
    const fail = (reason: string) => { this.error = reason; this.stop(); this.onFault(reason); };
    if (!hasControl(snapshot, now)) return fail('控制權已失效，自動阻力已停止。');
    const current = readings(snapshot, now).level;
    if (current === null) return fail('機台阻力資料已過期。');
    const m = snapshot!.state.machine;
    this.target = levelForGrade(this.profile, grade);
    if (this.pending) {
      const p = this.pending;
      if ((m.timeouts ?? 0) > p.timeouts) return fail('機台阻力 ACK 逾時。');
      if (now - p.at >= 5000) return fail('機台未確認阻力，已暫停騎乘。');
      // A matching report must have been sampled after this command, not cached before it.
      const sampledAt = snapshot!.receivedAt - (m.age3f_ms ?? Infinity);
      if (p.accepted && snapshot!.state.seq !== p.seq && sampledAt >= p.at && m.sent_level === p.level && !m.level_ack_pending && !m.level_queued && current === p.level) this.pending = null;
      else return;
    }
    if (m.level_ack_pending || m.level_queued || now-this.lastSent < 1000 || current === this.target) return;
    const min = Math.min(this.profile.easy,this.profile.hard), max = Math.max(this.profile.easy,this.profile.hard);
    if (current < min || current > max) return fail('目前阻力超出設定範圍，請先由機台調整後重新開始。');
    const level = current + Math.sign(this.target-current)*Math.min(this.profile.step,Math.abs(this.target-current));
    const pending = { level, at: now, seq: snapshot!.state.seq, timeouts: m.timeouts ?? 0, accepted: false };
    const epoch = this.epoch;
    this.pending = pending; this.sent = level; this.lastSent = now;
    void this.send(level).then(() => { if (this.epoch === epoch && this.pending === pending) pending.accepted = true; }).catch(e => {
      if (this.epoch === epoch && this.enabled) fail('阻力命令失敗：' + (e instanceof Error ? e.message : String(e)));
    });
  }
}
