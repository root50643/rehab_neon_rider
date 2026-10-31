import type { Mode, RideSummary } from './types';
export const COURSE_LENGTH = 5000;
export const CHAPTERS = [
  { name: '霓虹城市', en: 'NEON DISTRICT', start: 0, end: 1500, color: '#b4ff48' },
  { name: '軌道爬升', en: 'ORBITAL ASCENT', start: 1500, end: 3500, color: '#63dfff' },
  { name: '星際躍遷', en: 'HYPERSPACE', start: 3500, end: 5000, color: '#ff9866' },
];
const grades = [[0,0],[250,0],[600,2],[1000,0],[1500,1],[1800,4],[2400,8],[2900,3],[3300,0],[3700,-6],[4300,-2],[4700,0],[5000,0]];
export function gradeAt(distance: number) {
  const d = Math.max(0, Math.min(COURSE_LENGTH, distance));
  for (let i = 1; i < grades.length; i++) if (d <= grades[i][0]) {
    const [x,a] = grades[i-1], [y,b] = grades[i];
    const t = (1-Math.cos(Math.PI*(d-x)/(y-x)))/2;
    return a + (b-a)*t;
  }
  return 0;
}
export const chapterAt = (d: number) => d < 1500 ? 0 : d < 3500 ? 1 : 2;
export class Ride {
  status: 'ready' | 'running' | 'paused' | 'complete' = 'ready';
  distance = 0; seconds = 0; speed = 0; score = 0; combo = 1; maxCombo = 1; energy = 0;
  private stable = 0; private outside = 0; private rpmSum = 0; private rpmTime = 0;
  referenceRpm = 60;
  get complete() { return this.status === 'complete'; }
  start() { if (this.status !== 'complete') this.status = 'running'; }
  pause() { if (this.status === 'running') this.status = 'paused'; this.speed = 0; }
  tick(dt: number, rpm: number | null) {
    if (this.status !== 'running' || rpm === null || !Number.isFinite(rpm) || rpm <= 0) { this.speed = 0; this.stable = 0; this.combo = 1; return; }
    dt = Math.max(0, Math.min(dt, .25));
    const target = Math.min(60, 30*rpm/this.referenceRpm);
    this.speed += (target-this.speed)*(1-Math.exp(-dt*5));
    this.distance = Math.min(COURSE_LENGTH, this.distance + this.speed/3.6*dt);
    this.seconds += dt; this.rpmSum += rpm*dt; this.rpmTime += dt;
    const ratio = rpm/this.referenceRpm;
    if (ratio >= .8 && ratio <= 1.2) {
      this.stable += dt; this.outside = 0;
      this.combo = Math.min(5, 1 + Math.floor(this.stable/5));
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.energy = Math.min(100, this.energy + dt*5);
      this.score += 10*this.combo*dt;
    } else {
      this.outside += dt; this.energy = Math.max(0, this.energy-dt*8);
      if (this.outside >= 2) { this.stable = 0; this.combo = 1; }
    }
    if (this.distance >= COURSE_LENGTH) { this.status = 'complete'; this.speed = 0; }
  }
  summary(mode: Mode): RideSummary { return { date: new Date().toISOString(), mode, distance: Math.round(this.distance), seconds: Math.round(this.seconds), averageRpm: this.rpmTime ? Math.round(this.rpmSum/this.rpmTime) : 0, score: Math.floor(this.score), maxCombo: this.maxCombo, completed: this.status === 'complete' }; }
}
export function median(values: number[]): number | null {
  const sorted = values.filter(n => Number.isFinite(n) && n > 0).sort((a,b) => a-b);
  if (!sorted.length) return null;
  const i = Math.floor(sorted.length/2);
  return Math.round(sorted.length % 2 ? sorted[i] : (sorted[i-1]+sorted[i])/2);
}
