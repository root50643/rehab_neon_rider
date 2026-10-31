import { validProfile } from './resistance';
import type { Settings, RideSummary } from './types';
const prefix = 'neon-rider:v1:';
export const defaults = (): Settings => ({ referenceRpm: 60, sound: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, quality: 'auto', profile: null });
export function loadSettings(): Settings {
  const d = defaults();
  try {
    const s = JSON.parse(localStorage.getItem(prefix+'settings') || '{}');
    return { referenceRpm: Number.isInteger(s.referenceRpm) && s.referenceRpm > 0 && s.referenceRpm <= 65535 ? s.referenceRpm : d.referenceRpm,
      sound: s.sound === true, reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : d.reducedMotion,
      quality: ['auto','high','low'].includes(s.quality) ? s.quality : d.quality, profile: validProfile(s.profile) ? s.profile : null };
  } catch { return d; }
}
export function saveSettings(settings: Settings) { try { localStorage.setItem(prefix+'settings',JSON.stringify(settings)); } catch { /* Private browsing still supports the current ride. */ } }
export function history(): RideSummary[] { try { const items = JSON.parse(localStorage.getItem(prefix+'history') || '[]'); return Array.isArray(items) ? items.filter(v => typeof v.date === 'string' && Number.isFinite(v.distance) && Number.isFinite(v.score)).slice(0,20) : []; } catch { return []; } }
export function saveSummary(summary: RideSummary) { try { localStorage.setItem(prefix+'history',JSON.stringify([summary,...history()].slice(0,20))); } catch {} }
export function clearStorage() { try { localStorage.removeItem(prefix+'settings'); localStorage.removeItem(prefix+'history'); } catch {} }
