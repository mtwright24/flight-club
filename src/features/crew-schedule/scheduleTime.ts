import { addIsoDays } from './ledgerContext';
import type { CrewScheduleTrip } from './types';

/**
 * If OCR wrote `layover` on a CONT/rest row’s date but not on the flying row’s date, copy the same
 * imported string to the previous leg date (still DB text only — no duration math).
 */
export function mergeLayoverOntoLegDates(trip: CrewScheduleTrip): Record<string, string> | undefined {
  const src = trip.layoverByDate;
  if (!src || Object.keys(src).length === 0) return undefined;
  const legDates = [...new Set(trip.legs.map((l) => l.dutyDate).filter(Boolean))].sort();
  const out: Record<string, string> = { ...src };
  const sortedKeys = Object.keys(src).sort();
  for (const dateIso of sortedKeys) {
    const val = src[dateIso]?.trim();
    if (!val) continue;
    const hasLegOnDay = trip.legs.some((l) => l.dutyDate === dateIso);
    if (hasLegOnDay) continue;
    const prevLegDate = legDates.filter((d): d is string => !!d && d < dateIso).pop();
    if (prevLegDate !== undefined && !out[prevLegDate]?.trim()) {
      out[prevLegDate] = val;
    }
  }
  return out;
}

/**
 * Parse schedule times from imports (FLICA / Crew Line): 0500, 05:00, 5:00 AM, 14:30.
 * Returns minutes from midnight (local) for duty math.
 */
export function parseScheduleTimeMinutes(raw?: string | null): number | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;

  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (m12) {
    let hour = Number(m12[1]);
    const minute = Number(m12[2]);
    const ampm = m12[3].toUpperCase();
    if (minute > 59) return null;
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    if (hour > 23) return null;
    return hour * 60 + minute;
  }

  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const hour = Number(m24[1]);
    const minute = Number(m24[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  /** Four digits without colon: 0500 → 05:00, 1430 → 14:30 (clock time, not layover duration). */
  if (/^\d{4}$/.test(t)) {
    const hh = Number(t.slice(0, 2));
    const mm = Number(t.slice(2, 4));
    if (hh > 23 || mm > 59) return null;
    return hh * 60 + mm;
  }

  return null;
}

/**
 * Classic list layover column: show the time/rest **4-digit** token (FLICA-style), not the station list.
 * Strips a leading city; finds the first valid HHMM 4-digit block (same rules as `parseScheduleTimeMinutes`).
 * Plain station lists (`LAS`, `LAS, MCO`) with no time token return ''.
 */
export function formatLayoverColumnDisplay(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d{4}$/.test(s) && parseScheduleTimeMinutes(s) != null) return s;
  const noSpace = s.match(/^([A-Z]{3,4})(\d{4})$/i);
  if (noSpace && parseScheduleTimeMinutes(noSpace[2]!) != null) return noSpace[2]!;
  const cityThenDigits = s.match(/^[A-Z]{3,4}\s+(\d{4})\s*$/i);
  if (cityThenDigits && parseScheduleTimeMinutes(cityThenDigits[1]!) != null) return cityThenDigits[1]!;
  const tail = s.match(/(\d{4})\s*$/);
  if (tail && /[A-Za-z]/.test(s) && parseScheduleTimeMinutes(tail[1]!) != null) return tail[1]!;
  for (const m of s.matchAll(/\b(\d{4})\b/g)) {
    const token = m[1]!;
    if (parseScheduleTimeMinutes(token) != null) return token;
  }
  const compact = s.replace(/\s+/g, ' ');
  if (/^[A-Z]{3}(?:\s*,\s*[A-Z]{3})*$/i.test(compact)) return '';
  /** Never show route text (JFK-LHR) as layover; digits should have been picked up above. */
  if (/[A-Z]{3}\s*[-–]\s*[A-Z]{3}/i.test(s)) return '';
  return '';
}

/**
 * First valid FLICA-style **rest** HHMM (4 digits) from a duty’s layover line — used when apply rows only
 * stored free text (e.g. `LHR 21:00` → `2100`).
 */
export function extractLayoverRestFourDigits(raw: string | null | undefined): string | null {
  const display = formatLayoverColumnDisplay(raw);
  if (display && /^\d{4}$/.test(display) && parseScheduleTimeMinutes(display) != null) return display;
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const colon = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (colon) {
    const hh = String(colon[1]).padStart(2, '0');
    const mm = colon[2]!;
    const four = `${hh}${mm}`;
    if (parseScheduleTimeMinutes(four) != null) return four;
  }
  return null;
}

/**
 * Classic ledger: `schedule_entries.layover` is often missing on the flying row but present on an
 * adjacent calendar day (CONT / next-day line). Resolve a 4-digit token for this `dateIso`.
 */
export function resolveClassicLayoverColumn(trip: CrewScheduleTrip, dateIso: string): string {
  const by = trip.layoverByDate;
  if (!by || Object.keys(by).length === 0) return '';
  const own = formatLayoverColumnDisplay(by[dateIso]);
  if (own) return own;
  const prev = formatLayoverColumnDisplay(by[addIsoDays(dateIso, -1)]);
  if (prev) return prev;
  return formatLayoverColumnDisplay(by[addIsoDays(dateIso, 1)]) || '';
}
