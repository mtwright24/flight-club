/**
 * Staff Loads tile display helpers — StaffTraveler-style labels (no demo flight strings in UI).
 */

const DEMO_AIRCRAFT = ['E170', 'CRJ9', '73H', '739', '321', '7M8', '32Q'] as const;

/** Stable hash for deterministic mock values from any string id. */
export function staffLoadsHashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** When DB has no aircraft type, show a plausible code for layout (search mocks). */
export function staffLoadsPlaceholderAircraft(flightId: string): string {
  return DEMO_AIRCRAFT[staffLoadsHashString(flightId) % DEMO_AIRCRAFT.length];
}

/** IATA-ish code for logos and labels; never a lone "?" from bad seed data. */
export function normalizeStaffAirlineCode(code: string | null | undefined): string {
  const t = (code || '').trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3);
  return t.length >= 2 ? t : 'XX';
}

/**
 * Realistic flight label like DL123, WN3498. Never surfaces DEMO604-style placeholders.
 */
export function formatDisplayFlightNumber(airlineCode: string, flightNumber: string | null | undefined): string {
  const code = normalizeStaffAirlineCode(airlineCode);
  const raw = (flightNumber || '').trim().replace(/^\?+/, '');
  if (!raw) return `${code}—`;
  const up = raw.toUpperCase();
  if (/DEMO/i.test(up) || up.includes('DEMO')) {
    const n = 100 + (staffLoadsHashString(code + up) % 899);
    return `${code}${n}`;
  }
  if (up.startsWith(code)) {
    return up;
  }
  const digits = up.replace(/\D/g, '');
  if (digits.length > 0) {
    return `${code}${digits.replace(/^0+/, '').slice(0, 4) || digits.slice(-3)}`;
  }
  return `${code}${up.replace(/\?/g, '')}`;
}

/** e.g. "Apr 30 Thu" — month, day, weekday (StaffTraveler reference). */
export function formatStaffTravelerDateLine(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate();
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${month} ${day} ${wd}`;
}

export function formatBlockDuration(depIso: string | null | undefined, arrIso: string | null | undefined): string {
  if (!depIso || !arrIso) return '—';
  const a = new Date(depIso).getTime();
  const b = new Date(arrIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return '—';
  const ms = b - a;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

/** Abbreviated duration for edge stamps: `45s`, `3m`, `5h`, `4d`, `2wk`, `3mo`, `1y`. */
export function formatShortDurationMs(ms: number): string {
  const x = Math.max(0, ms);
  const sec = Math.floor(x / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 14) return `${days}d`;
  const wk = Math.floor(days / 7);
  if (wk < 52) return `${wk}wk`;
  const mo = Math.floor(days / 30);
  if (mo < 24) return `${mo}mo`;
  return `${Math.max(1, Math.floor(days / 365))}y`;
}

/** Age since an ISO timestamp (for request tiles: created or last answer). */
export function formatStaffLoadsEdgeAge(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return formatShortDurationMs(nowMs - t);
}

/** Time until departure for search tiles; empty after departure. */
export function formatStaffLoadsEdgeUntilDeparture(departIso: string | null | undefined, nowMs = Date.now()): string {
  if (!departIso) return '';
  const t = new Date(departIso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = t - nowMs;
  if (diff <= 0) return '';
  return formatShortDurationMs(diff);
}
