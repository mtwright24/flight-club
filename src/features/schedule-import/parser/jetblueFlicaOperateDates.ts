/**
 * Derive operate end / last duty dates from FLICA pairing block text + parsed duty rows.
 */

const MONTH_WORD: Record<string, number> = {
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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parse trailing `Apr 13` or `Mar 30` in an Operates line. */
function monthDayToIso(
  monStr: string,
  day: number,
  scheduleYear: number,
  scheduleMonth: number
): string | null {
  const mon = MONTH_WORD[monStr.toUpperCase().slice(0, 3)];
  if (!mon || day < 1 || day > 31) return null;
  let y = scheduleYear;
  if (Math.abs(mon - scheduleMonth) > 6) {
    if (mon < scheduleMonth) y = scheduleYear + 1;
    else if (mon > scheduleMonth) y = scheduleYear - 1;
  }
  const iso = `${y}-${pad2(mon)}-${pad2(day)}`;
  const dt = new Date(`${iso}T12:00:00`);
  if (dt.getMonth() + 1 !== mon || dt.getDate() !== day) return null;
  return iso;
}

/**
 * Priority A: last explicit date in an `Operates: Mar 29-Mar 30` / `Apr 3-Apr 13` style line.
 */
export function parseOperateWindowEndIso(
  bodyText: string,
  scheduleYear: number,
  scheduleMonth: number
): string | null {
  const line = bodyText.match(/Operates\s*:?\s*([^\n]+)/i);
  if (!line) return null;
  const rest = line[1].trim();
  const tokens: { mon: string; day: number }[] = [];
  const re = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    tokens.push({ mon: m[1], day: Number(m[2]) });
  }
  if (tokens.length === 0) return null;
  const last = tokens[tokens.length - 1];
  return monthDayToIso(last.mon, last.day, scheduleYear, scheduleMonth);
}

/** Max ISO date from sorted string compare works for YYYY-MM-DD. */
export function maxIsoDates(isos: (string | null | undefined)[]): string | null {
  const ok = isos.filter((x): x is string => Boolean(x && /^\d{4}-\d{2}-\d{2}$/.test(x)));
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (a >= b ? a : b));
}
