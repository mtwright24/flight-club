/**
 * Parse FLICA date tokens with schedule month/year context.
 * Cross-month pairings: caller may pass adjacent months for inference (emit CROSS_MONTH_INFERENCE_USED).
 */

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

/**
 * 03APR → ISO date for given year (defaults schedule year).
 */
export function parseDdMmmToken(token: string, year: number): string | null {
  const m = /^(\d{1,2})([A-Z]{3})$/i.exec(token.trim().replace(/\s+/g, ''));
  if (!m) return null;
  const day = Number(m[1]);
  const mon = MONTHS[m[2].toUpperCase()];
  if (!mon || day < 1 || day > 31) return null;
  const iso = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const d = new Date(`${iso}T12:00:00`);
  if (d.getMonth() + 1 !== mon) return null;
  return iso;
}

/**
 * Infer ISO YYYY-MM-DD from "Apr 3" / "Apr 3-Apr 13" first segment using schedule year.
 */
export function parseMonthNameDay(line: string, year: number): { start: string | null; end: string | null } {
  const re = /\b([A-Za-z]{3,9})\s+(\d{1,2})(?:\s*[-–]\s*(?:[A-Za-z]{3,9}\s+)?(\d{1,2}))?/i;
  const x = re.exec(line);
  if (!x) return { start: null, end: null };
  const m1 = MONTHS[x[1].slice(0, 3).toUpperCase()];
  if (!m1) return { start: null, end: null };
  const d1 = Number(x[2]);
  const start = `${year}-${String(m1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
  let end: string | null = null;
  if (x[3]) {
    const d2 = Number(x[3]);
    end = `${year}-${String(m1).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
  }
  return { start, end };
}
