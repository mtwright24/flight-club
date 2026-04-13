/**
 * Parse FLICA local time tokens into normalized HH:MM strings (24h) or minutes-from-midnight.
 * Does not apply timezones — preserves schedule-local semantics.
 */

const AMPM = /^(\d{1,2}):(\d{2})\s*(AM|PM)?\s*L?$/i;
const HHMML = /^(\d{3,4})L$/i;

export type ParsedLocalTime = {
  /** 24h "HH:MM" */
  display24: string | null;
  /** Minutes from midnight, 0–1439 */
  minutesFromMidnight: number | null;
};

function toMinutes24(h: number, min: number): number {
  return ((h % 24) + 24) % 24 * 60 + min;
}

/**
 * Examples: 1930L → 19:30, 0500L → 05:00, 0827 → 08:27, 2100 (no colon) → 21:00 when 4 digits.
 */
export function parseFlicaLocalTime(token: string | null | undefined): ParsedLocalTime {
  if (token == null || typeof token !== 'string') return { display24: null, minutesFromMidnight: null };
  const t = token.trim();
  if (!t) return { display24: null, minutesFromMidnight: null };

  const ampm = AMPM.exec(t);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = Number(ampm[2]);
    const ap = ampm[3]?.toUpperCase();
    if (Number.isNaN(h) || Number.isNaN(min) || min > 59) return { display24: null, minutesFromMidnight: null };
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    const hh = String(h).padStart(2, '0');
    const mm = String(min).padStart(2, '0');
    const display24 = `${hh}:${mm}`;
    return { display24, minutesFromMidnight: toMinutes24(h, min) };
  }

  const compact = HHMML.exec(t);
  if (compact) {
    const digits = compact[1];
    if (digits.length === 4) {
      const h = Number(digits.slice(0, 2));
      const min = Number(digits.slice(2, 4));
      if (h <= 23 && min <= 59) {
        const display24 = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        return { display24, minutesFromMidnight: toMinutes24(h, min) };
      }
    }
    if (digits.length === 3) {
      const h = Number(digits.slice(0, 1));
      const min = Number(digits.slice(1, 3));
      if (h <= 9 && min <= 59) {
        const display24 = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        return { display24, minutesFromMidnight: toMinutes24(h, min) };
      }
    }
  }

  return { display24: null, minutesFromMidnight: null };
}
