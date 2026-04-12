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
 * Classic list layover column: show the time/duration token only (strip FLICA city prefix).
 * e.g. `DUB 2430` → `2430`; `2430` unchanged.
 */
export function formatLayoverColumnDisplay(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const cityThenDigits = s.match(/^[A-Z]{3,4}\s+(\d{4})\s*$/i);
  if (cityThenDigits) return cityThenDigits[1];
  if (/^\d{4}$/.test(s)) return s;
  const tail = s.match(/(\d{4})\s*$/);
  if (tail && /[A-Za-z]/.test(s)) return tail[1];
  return s;
}
