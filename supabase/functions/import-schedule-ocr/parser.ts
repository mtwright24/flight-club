/**
 * Shared **line-level** schedule text → candidates (generic heuristics).
 * Used by Schedule Intelligence parser modules (see schedule-intelligence/registry.ts).
 * Airline-specific table layouts register preprocess + this parse, or replace `parse` entirely.
 */

export type ParsedCandidate = {
  date: string | null;
  day_of_week: string | null;
  pairing_code: string | null;
  report_time: string | null;
  city: string | null;
  d_end_time: string | null;
  layover: string | null;
  wx: string | null;
  status_code: string | null;
  notes: string | null;
  confidence_score: number;
  warning_flag: boolean;
  raw_row_text: string;
};

const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Reject date-only lines (e.g. screenshot header) when they disagree with import month. */
function alignIsoToMonthHintOrNull(iso: string, line: string, monthHint: string): string | null {
  if (iso.slice(0, 7) === monthHint.trim().slice(0, 7)) return iso;
  const tripLike = /\b[A-Z]?\d{3,5}[A-Z]?\b/.test(line);
  const dutyLike = /\b(OFF|PTO|RSV|DH|CONT|UNA|LSB|TAL|BRV)\b/i.test(line);
  if (tripLike || dutyLike) return iso;
  return null;
}

/** Infer YYYY-MM-DD from line text using month_hint "YYYY-MM". */
export function inferIsoDateFromLine(line: string, monthHint: string): string | null {
  const ym = /^(\d{4})-(\d{2})$/.exec(monthHint.trim());
  if (!ym) return null;
  const y = Number(ym[1]);
  const m = Number(ym[2]);

  // 3/24, 03/24, 3-24
  let mre = /\b(\d{1,2})[\/\-](\d{1,2})\b/.exec(line);
  if (mre) {
    const a = Number(mre[1]);
    const b = Number(mre[2]);
    let month = a;
    let day = b;
    if (a > 12) {
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const iso = `${y}-${pad2(month)}-${pad2(day)}`;
      return alignIsoToMonthHintOrNull(iso, line, monthHint);
    }
  }

  // Mar 24, MAR 24
  const monNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monRe = new RegExp(`\\b(${monNames.join('|')})\\.?\\s+(\\d{1,2})\\b`, 'i');
  const mr = monRe.exec(line.toLowerCase());
  if (mr) {
    const mi = monNames.indexOf(mr[1].slice(0, 3));
    const d = Number(mr[2]);
    if (mi >= 0 && d >= 1 && d <= 31) {
      const iso = `${y}-${pad2(mi + 1)}-${pad2(d)}`;
      return alignIsoToMonthHintOrNull(iso, line, monthHint);
    }
  }

  return null;
}

function normalizeTime(t: string): string {
  const s = t.trim();
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(s);
  if (m) {
    let h = Number(m[1]);
    const min = m[2];
    const ap = m[3]?.toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}${min}`;
  }
  const four = /^(\d{3,4})$/.exec(s.replace(/\s/g, ''));
  if (four) {
    const n = four[1].padStart(4, '0');
    return `${n.slice(0, 2)}${n.slice(2)}`;
  }
  return s;
}

/** Main parse: lines → candidates; uses month_hint for dates. */
export function parseScheduleText(raw: string, monthHint: string): ParsedCandidate[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  const out: ParsedCandidate[] = [];
  let lastDate: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const iso = inferIsoDateFromLine(line, monthHint);
    if (iso) lastDate = iso;

    const row = classifyLine(line, monthHint, lastDate);
    out.push(row);

    if (row.date) lastDate = row.date;
  }

  return out;
}

function classifyLine(line: string, monthHint: string, lastDate: string | null): ParsedCandidate {
  const upper = line.toUpperCase();
  const iso = inferIsoDateFromLine(line, monthHint) ?? lastDate;

  const base = {
    date: iso,
    day_of_week: iso ? dayOfWeekFromIso(iso) : null,
    pairing_code: null as string | null,
    report_time: null as string | null,
    city: null as string | null,
    d_end_time: null as string | null,
    layover: null as string | null,
    wx: null as string | null,
    status_code: null as string | null,
    notes: null as string | null,
    confidence_score: 0.55,
    warning_flag: false,
    raw_row_text: line,
  };

  // Standalone duty codes
  if (/^\s*OFF\s*$/i.test(line)) {
    return { ...base, pairing_code: '—', status_code: 'OFF', confidence_score: 0.95 };
  }
  if (/^\s*PTO\s*$/i.test(line)) {
    return { ...base, pairing_code: '—', status_code: 'PTO', confidence_score: 0.95 };
  }
  if (/^\s*CONT\s*$/i.test(line)) {
    return { ...base, pairing_code: 'CONT', status_code: 'CONT', confidence_score: 0.85 };
  }

  // Reserve: RSV1 JFK, RSV 2 LAX
  const rsv = /^(RSV\d?)\s+([A-Z]{3})\s*$/i.exec(line);
  if (rsv) {
    return {
      ...base,
      pairing_code: rsv[1].toUpperCase(),
      city: rsv[2].toUpperCase(),
      status_code: 'RSV',
      confidence_score: 0.88,
    };
  }

  // Deadhead: DH 0530 BOS 0805 JFK
  const dh = /^DH\s+(\d{3,4})\s+([A-Z]{3})\s+(\d{3,4})\s+([A-Z]{3})\s*$/i.exec(line.replace(/\s+/g, ' '));
  if (dh) {
    return {
      ...base,
      pairing_code: 'DH',
      report_time: normalizeTime(dh[1]),
      city: `${dh[2].toUpperCase()}→${dh[4].toUpperCase()}`,
      d_end_time: normalizeTime(dh[3]),
      status_code: 'DH',
      confidence_score: 0.82,
    };
  }

  // Trip-like: J3409 0800 JFK 1430 SFO  (pairing + times + airports)
  const trip = /^([A-Z]?\d{3,5}[A-Z]?)\s+(\d{3,4})\s+([A-Z]{3})\s+(\d{3,4})\s+([A-Z]{3})\b/i.exec(
    line.replace(/\s+/g, ' ')
  );
  if (trip) {
    return {
      ...base,
      pairing_code: trip[1].toUpperCase(),
      report_time: normalizeTime(trip[2]),
      city: `${trip[3].toUpperCase()}→${trip[5].toUpperCase()}`,
      d_end_time: normalizeTime(trip[4]),
      status_code: 'TRIP',
      confidence_score: 0.8,
    };
  }

  // Shorter trip fragment: J3409 0800 JFK
  const shortTrip = /^([A-Z]?\d{3,5}[A-Z]?)\s+(\d{3,4})\s+([A-Z]{3})\b/i.exec(line);
  if (shortTrip) {
    return {
      ...base,
      pairing_code: shortTrip[1].toUpperCase(),
      report_time: normalizeTime(shortTrip[2]),
      city: shortTrip[3].toUpperCase(),
      status_code: 'TRIP',
      confidence_score: 0.65,
      warning_flag: true,
    };
  }

  // Blank / noise
  if (line.length < 2 || /^[\-_.]+$/.test(line)) {
    return {
      ...base,
      status_code: 'BLANK',
      confidence_score: 0.2,
      warning_flag: true,
    };
  }

  // Keyword in line
  if (/\bOFF\b/i.test(line)) {
    return { ...base, status_code: 'OFF', pairing_code: '—', confidence_score: 0.7 };
  }
  if (/\bPTO\b/i.test(line)) {
    return { ...base, status_code: 'PTO', pairing_code: '—', confidence_score: 0.7 };
  }
  if (/\bCONT\b/i.test(line)) {
    return { ...base, status_code: 'CONT', pairing_code: 'CONT', confidence_score: 0.65 };
  }
  if (/\bRSV\b/i.test(line)) {
    return { ...base, status_code: 'RSV', pairing_code: 'RSV', confidence_score: 0.6, warning_flag: true };
  }
  if (/\bDH\b/i.test(line)) {
    return { ...base, status_code: 'DH', confidence_score: 0.55, warning_flag: true };
  }

  return {
    ...base,
    notes: upper.slice(0, 200),
    status_code: 'UNK',
    confidence_score: 0.35,
    warning_flag: true,
  };
}

function dayOfWeekFromIso(iso: string): string | null {
  const p = iso.split('-').map(Number);
  if (p.length !== 3) return null;
  const d = new Date(p[0], p[1] - 1, p[2]);
  if (Number.isNaN(d.getTime())) return null;
  return DOW[d.getDay()] ?? null;
}
