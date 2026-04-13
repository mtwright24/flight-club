/**
 * JetBlue FLICA monthly screenshot — structured parse (pairing blocks → duty days → segments).
 * Does not emit one row per OCR line; use persist layer to write schedule_pairings / legs.
 *
 * Obsolete for JetBlue logic: TACLAG, GRNT, DHC (may appear in raw snapshots only).
 *
 * FLICA “split view”: left = monthly list, right = same pairings expanded with detail. OCR is one
 * string (possibly merged from two Vision passes); we do not treat columns as separate sources —
 * pairing blocks are found by header lines anywhere in the blob.
 */

import { maxIsoDates, parseOperateWindowEndIso } from './jetblueFlicaOperateDates';
import { normalizePairingSegments } from './jetblueFlicaStationNormalize';

export type JetBlueMonthlyTotalsParsed = {
  blockHours: number | null;
  creditHours: number | null;
  ytdHours: number | null;
  daysOff: number | null;
  rawLines: string[];
};

export type JetBlueSegmentParsed = {
  departureStation: string | null;
  arrivalStation: string | null;
  flightNumber: string | null;
  departureTimeLocal: string | null;
  arrivalTimeLocal: string | null;
  /** Block duration as HH:MM (from FLICA BLKT / third 4-digit cluster). */
  blockTimeLocal: string | null;
  equipmentCode: string | null;
  isDeadhead: boolean;
  rawLine: string;
  confidence: number;
};

export type JetBlueDutyDayParsed = {
  dow: string | null;
  dayOfMonth: number | null;
  dutyDateIso: string | null;
  segments: JetBlueSegmentParsed[];
  /** Raw line(s) mentioning D-END / hotel (legacy). */
  layoverNotes: string | null;
  dEndNotes: string | null;
  /** Duty-day release — parsed from D-END line (HH:MM). */
  dEndLocal: string | null;
  /** Next report on same line as D-END when present (HH:MM). */
  nextReportLocal: string | null;
  /** Layover station after last leg (IATA), from `LAS 1236`-style column when possible. */
  layoverCityCode: string | null;
  /** Layover rest / duration display e.g. 1236, 2100 */
  layoverRestDisplay: string | null;
  hotelNote: string | null;
  rawBlock: string;
  confidence: number;
};

export type JetBluePairingParsed = {
  pairingCode: string;
  headerDateToken: string;
  pairingStartIso: string | null;
  /** Last calendar day with a parsed duty row / leg (ISO). */
  lastDutyDateIso: string | null;
  /** Operate window end: explicit `Operates:` line when parseable, else last duty date. */
  operateEndIso: string | null;
  operatePatternText: string | null;
  operateWindowText: string | null;
  baseReportTime: string | null;
  baseCode: string | null;
  equipmentSummary: string | null;
  /** Chain of stations from parsed legs, e.g. `JFK → LHR → JFK` */
  routeSummary: string | null;
  /** Layover cities parsed from `AAA 1234`-style tokens in the block */
  layoverStations: string[];
  dutyDays: JetBlueDutyDayParsed[];
  rawBlock: string;
  confidence: number;
  needsReview: boolean;
};

export type JetBluePageMeta = {
  scheduleMonthLabel: string | null;
  crewMemberName: string | null;
  employeeId: string | null;
  lastUpdatedText: string | null;
};

/** Debug for FLICA structured parse (console + optional UI). */
export type JetBlueFlicaParseDebug = {
  pairingHeaderMatchCount: number;
  pairingHeaderList: string[];
  blockCount: number;
  perPairing: {
    header: string;
    dutyRows: number;
    segments: number;
    layoverStations: number;
  }[];
  spotlight: Record<
    string,
    {
      foundInOcr: boolean;
      foundInBlockHeaders: boolean;
      note?: string;
    }
  >;
};

export type JetBlueStructuredParseResult = {
  meta: JetBluePageMeta;
  monthlyTotals: JetBlueMonthlyTotalsParsed;
  pairings: JetBluePairingParsed[];
  parserVersion: string;
  debug?: JetBlueFlicaParseDebug;
};

/** Strict: whole line is only "J1007 : 03APR" — phone OCR rarely matches; use extractPairingHeaderFromLine. */
const PAIRING_HEADER =
  /^\s*(J(?:C)?\d{2,5})\s*:\s*(\d{1,2}[A-Za-z]{3})\s*$/i;
const DUTY_MARKER = /^(SU|MO|TU|WE|TH|FR|SA)\s*(\d{1,2})\b/i;
const STATION_PAIR = /\b([A-Z]{3})\s*[-–]\s*([A-Z]{3})\b/g;
const BSE_REPT = /BSE\s*REPT\s*:?\s*(\d{3,4}L?)/i;
const BASE_EQUIP = /Base\/Equip\s*:?\s*([^|\n]+)/i;
const BASE_EQUIP_ALT = /Base\s*[|/]\s*Equip\s*:?\s*([^|\n]+)/i;
const OPERATES = /Operates\s*:?\s*([^\n]+)/i;
const ONLY_EXCEPT = /(ONLY ON[^|\n]*|EXCEPT ON[^|\n]*)/gi;
const D_END = /D-END\s*:?\s*([^\n]+)/i;
const HOTEL_HINT = /\b(Hilton|Westin|Hyatt|Marriott|Pullman|Holiday Inn|Courtyard|Grand Hyatt|Riverside|Hyatt)\b/i;

const MONTH_MAP: Record<string, number> = {
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

/** 1-based month index → ddMMM token suffix */
const MONTH_ABBREV = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export type JetBluePairingMonthContext = { year: number; month: number };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** FLICA monthly list often uses M/D or MM/DD instead of 03APR (detail view). */
function slashPartsToDdMmm(
  p1: string,
  p2: string,
  scheduleYear: number,
  scheduleMonth: number,
  yPart?: string
): string | null {
  const a = Number(p1);
  const b = Number(p2);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (yPart) {
    const yr = Number(yPart.length === 2 ? `20${yPart}` : yPart);
    if (yr >= 1990 && yr <= 2100 && a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      const iso = `${yr}-${pad2(a)}-${pad2(b)}`;
      const dt = new Date(`${iso}T12:00:00`);
      if (dt.getMonth() + 1 !== a || dt.getDate() !== b) return null;
      return `${pad2(b)}${MONTH_ABBREV[a - 1]}`;
    }
  }
  if (a === scheduleMonth && b >= 1 && b <= 31) {
    return `${pad2(b)}${MONTH_ABBREV[scheduleMonth - 1]}`;
  }
  if (b === scheduleMonth && a >= 1 && a <= 31) {
    return `${pad2(a)}${MONTH_ABBREV[scheduleMonth - 1]}`;
  }
  if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
    if (a === scheduleMonth) return `${pad2(b)}${MONTH_ABBREV[a - 1]}`;
    if (b === scheduleMonth) return `${pad2(a)}${MONTH_ABBREV[b - 1]}`;
    return `${pad2(b)}${MONTH_ABBREV[a - 1]}`;
  }
  return null;
}

function dowDayToDdMmm(dayOfMonth: number, scheduleYear: number, scheduleMonth: number): string | null {
  if (dayOfMonth < 1 || dayOfMonth > 31) return null;
  const md = new Date(scheduleYear, scheduleMonth - 1, dayOfMonth);
  if (md.getMonth() !== scheduleMonth - 1 || md.getDate() !== dayOfMonth) return null;
  return `${pad2(dayOfMonth)}${MONTH_ABBREV[scheduleMonth - 1]}`;
}

/** OCR often reads leading J as lowercase l. */
function normalizeOcrLeadIn(text: string): string {
  return text.replace(/\b(l)(?=[A-Z0-9]{2,5}\s*[:.\s/])/gi, 'J');
}

/** OCR often inserts a space: "03 APR" → "03APR". O vs 0 in day: O4APR → 04APR. */
export function normalizeDdMmmToken(raw: string): string {
  let s = raw.replace(/\s+/g, '').toUpperCase();
  if (/^O\d[A-Z]{3}$/.test(s)) s = `0${s.slice(1)}`;
  return s;
}

/** True only if the 3-letter suffix is JAN..DEC (rejects airport codes like LHR in `6LHR`). */
export function isValidDdMmmCalendarToken(token: string): boolean {
  const t = normalizeDdMmmToken(token);
  const m = /^(\d{1,2})([A-Z]{3})$/i.exec(t);
  if (!m) return false;
  const mon = MONTH_MAP[m[2].toUpperCase().slice(0, 3)];
  return mon != null && mon >= 1 && mon <= 12;
}

/** Global OCR noise: JI012→J1012, Jl012→J1012 (common Vision mistakes). */
export function normalizeFlicaOcrNoiseGlobally(text: string): string {
  let t = text.replace(/\r\n/g, '\n');
  t = t.replace(/\b(J)I(\d{3,5})\b/gi, '$101$2');
  t = t.replace(/\b(J)[l](\d{3,5})\b/gi, '$1$2');
  return t;
}

function normalizePairingHeaderLineForMatch(line: string): string {
  return normalizeFlicaOcrNoiseGlobally(line.trim());
}

function fixOcrPairingCodeToken(code: string): string {
  let c = code.toUpperCase();
  if (/^J[A-Z0-9]{3,6}$/.test(c)) return c;
  const ji = /^JI(\d{3,5})$/.exec(c);
  if (ji) return `J1${ji[1]}`;
  const jl = /^JL(\d{3,5})$/i.exec(c);
  if (jl) return `J1${jl[1]}`;
  return c;
}

/**
 * FLICA pairing header is often embedded in a noisy OCR line (browser chrome, same line as BSE REPT, etc.).
 * Pairing codes vary: J1016, JC58, J3C58 (OCR glues digits + letters), J1037 — use J[A-Z0-9]{2,6}, not J\\d+ only.
 * Returns canonical header line "J1007 : 03APR" and leftover text on that line for the pairing body.
 *
 * Monthly **list** view often uses M/D or DOW+DD instead of ddMMM — pass `monthCtx` so those match.
 */
export function extractPairingHeaderFromLine(
  line: string,
  monthCtx?: JetBluePairingMonthContext
): {
  code: string;
  dateTokenRaw: string;
  headerLine: string;
  restOfLine: string;
} | null {
  line = normalizePairingHeaderLineForMatch(line);
  const patterns: RegExp[] = [
    /\b(J[A-Z0-9]{3,6})\s*:\s*(\d{1,2}\s*[A-Za-z]{3})\b/i,
    /\b(J[A-Z0-9]{3,6})\s*:\s*(\d{1,2}\s+[A-Za-z]{3})\b/i,
    /\b(J[A-Z0-9]{3,6})\s*[/]\s*(\d{1,2}\s*[A-Za-z]{3})\b/i,
    /\b(J[A-Z0-9]{3,6})\s{1,10}(\d{1,2}\s*[A-Za-z]{3})\b/i,
    /\b(J[A-Z0-9]{3,6})\s{1,8}(\d{1,2}\s+[A-Za-z]{3})\b/i,
  ];
  for (const re of patterns) {
    const m = line.match(re);
    if (!m) continue;
    const code = fixOcrPairingCodeToken(m[1]);
    if (!/^J[A-Z0-9]{3,6}$/.test(code)) continue;
    const dateTokenRaw = normalizeDdMmmToken(m[2]);
    if (!/^\d{1,2}[A-Z]{3}$/.test(dateTokenRaw)) continue;
    if (!isValidDdMmmCalendarToken(dateTokenRaw)) continue;
    const headerLine = `${code} : ${dateTokenRaw}`;
    const idx = m.index ?? line.indexOf(m[0]);
    const restOfLine = (line.slice(0, idx) + ' ' + line.slice(idx + m[0].length)).replace(/\s+/g, ' ').trim();
    return { code, dateTokenRaw, headerLine, restOfLine };
  }
  if (monthCtx) {
    const slash = line.match(
      /\b(J[A-Z0-9]{3,6})\s*[:.]?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i
    );
    if (slash && /^J[A-Z0-9]{3,6}$/.test(fixOcrPairingCodeToken(slash[1]))) {
      const code = fixOcrPairingCodeToken(slash[1]);
      const dateTokenRaw = slashPartsToDdMmm(
        slash[2],
        slash[3],
        monthCtx.year,
        monthCtx.month,
        slash[4]
      );
      if (dateTokenRaw && /^\d{1,2}[A-Z]{3}$/.test(dateTokenRaw)) {
        const headerLine = `${code} : ${dateTokenRaw}`;
        const idx = slash.index ?? line.indexOf(slash[0]);
        const restOfLine = (line.slice(0, idx) + ' ' + line.slice(idx + slash[0].length)).replace(/\s+/g, ' ').trim();
        return { code, dateTokenRaw, headerLine, restOfLine };
      }
    }
    const dow = line.match(/\b(J[A-Z0-9]{3,6})\s+(?:SU|MO|TU|WE|TH|FR|SA)\s+(\d{1,2})\b/i);
    if (dow) {
      const code = fixOcrPairingCodeToken(dow[1]);
      if (!/^J[A-Z0-9]{3,6}$/.test(code)) return null;
      const dateTokenRaw = dowDayToDdMmm(Number(dow[2]), monthCtx.year, monthCtx.month);
      if (dateTokenRaw) {
        const headerLine = `${code} : ${dateTokenRaw}`;
        const idx = dow.index ?? line.indexOf(dow[0]);
        const restOfLine = (line.slice(0, idx) + ' ' + line.slice(idx + dow[0].length)).replace(/\s+/g, ' ').trim();
        return { code, dateTokenRaw, headerLine, restOfLine };
      }
    }
  }
  return null;
}

/** OCR often breaks "J1037" and "03APR" across lines (two-column / narrow phone layout). */
function collapseSplitPairingHeaders(text: string): string {
  let t = text.replace(/\r\n/g, '\n');
  t = t.replace(/\b(J[A-Z0-9]{3,6})\s*\n+\s*(\d{1,2}\s*[A-Za-z]{3})\b/gi, (_m, code: string, dRaw: string) => {
    const d = normalizeDdMmmToken(dRaw);
    return `${String(code).toUpperCase()} : ${d}`;
  });
  t = t.replace(/\b(J[A-Z0-9]{3,6})\s*\n+\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/gi, (_m, code: string, slash: string) => {
    return `${String(code).toUpperCase()} ${slash}`;
  });
  return t;
}

function dedupePairingBlocks(blocks: { header: string; body: string[] }[]): { header: string; body: string[] }[] {
  const seen = new Set<string>();
  const out: { header: string; body: string[] }[] = [];
  for (const b of blocks) {
    const k = b.header.replace(/\s+/g, ' ').trim().toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(b);
  }
  return out;
}

/** ddMMM + schedule month/year → ISO date (handles Mar vs Apr in same screenshot). */
export function ddMmmToIso(
  token: string,
  scheduleYear: number,
  scheduleMonth: number
): string | null {
  const m = /^(\d{1,2})([A-Za-z]{3})$/i.exec(normalizeDdMmmToken(token));
  if (!m) return null;
  const d = Number(m[1]);
  const mon = MONTH_MAP[m[2].toUpperCase().slice(0, 3)];
  if (!mon || d < 1 || d > 31) return null;
  let y = scheduleYear;
  let useMonth = mon;
  if (mon === scheduleMonth - 1 || (scheduleMonth === 3 && mon === 12)) {
    /* keep */
  }
  if (Math.abs(mon - scheduleMonth) > 1) {
    if (mon < scheduleMonth) y = scheduleYear;
    else if (mon > scheduleMonth) y = scheduleYear;
  }
  const iso = `${y}-${pad2(useMonth)}-${pad2(d)}`;
  const dt = new Date(`${iso}T12:00:00`);
  if (dt.getMonth() + 1 !== useMonth) return null;
  return iso;
}

function extractStationPairs(line: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let x: RegExpExecArray | null;
  const re = new RegExp(STATION_PAIR.source, 'g');
  while ((x = re.exec(line)) !== null) {
    out.push({ from: x[1], to: x[2] });
  }
  return out;
}

function lineLooksLikeTableHeader(line: string): boolean {
  const u = line.toUpperCase();
  return /^DY\s+DD\s+DHC/i.test(u) || (u.includes('FLTNO') && u.includes('DEPL'));
}

function lineLooksLikeSegmentRow(line: string, monthCtx?: JetBluePairingMonthContext): boolean {
  if (lineLooksLikeTableHeader(line)) return false;
  if (extractPairingHeaderFromLine(line, monthCtx)) return false;
  if (PAIRING_HEADER.test(line)) return false;
  if (DUTY_MARKER.test(line.trim())) return false;
  if (D_END.test(line)) return false;
  const pairs = extractStationPairs(line);
  if (pairs.length > 0) return true;
  return /\bDH\b/i.test(line) && extractStationPairs(line.replace(/\bDH\b/g, '')).length >= 0 && /\d{3,4}/.test(line);
}

function parseSegmentFromLine(line: string): JetBlueSegmentParsed {
  const pairs = extractStationPairs(line);
  const first = pairs[0];
  const isDh = /\bDH\b|\bD\/H\b|\bDEAD\s*HEAD\b/i.test(line);
  let depT: string | null = null;
  let arrT: string | null = null;
  const fourFour = line.match(/\b(\d{4})\s+(\d{4})\b/);
  if (fourFour) {
    depT = hhmmDigitsToLocal(fourFour[1]);
    arrT = hhmmDigitsToLocal(fourFour[2]);
  } else {
    const times = [...line.matchAll(/\b(\d{4})\b/g)].map((x) => x[1]);
    if (times.length >= 2) {
      depT = hhmmDigitsToLocal(times[0]);
      arrT = hhmmDigitsToLocal(times[1]);
    }
  }

  const usedDigits = new Set<string>();
  if (fourFour) {
    usedDigits.add(fourFour[1]);
    usedDigits.add(fourFour[2]);
  }

  let blockTimeLocal: string | null = null;
  const blkt = /\b(?:BLKT|TBLK|BLOCK)\s*:?\s*(\d{2,4})\b/i.exec(line);
  if (blkt) {
    const b = blkt[1].padStart(4, '0').slice(-4);
    if (/^\d{4}$/.test(b)) {
      blockTimeLocal = hhmmDigitsToLocal(b);
      usedDigits.add(b);
    }
  } else {
    const all4 = [...line.matchAll(/\b(\d{4})\b/g)].map((x) => x[1]);
    if (fourFour && all4.length >= 3) {
      const third = all4.find((d) => d !== fourFour[1] && d !== fourFour[2]);
      if (third) {
        blockTimeLocal = hhmmDigitsToLocal(third);
        usedDigits.add(third);
      }
    } else if (!fourFour && all4.length >= 3) {
      const third = all4[2];
      blockTimeLocal = hhmmDigitsToLocal(third);
      usedDigits.add(third);
    }
  }

  let fnVal: string | null = null;
  for (const mm of line.matchAll(/\b(\d{3,4})\b/g)) {
    const d = mm[1];
    if (usedDigits.has(d)) continue;
    const n = Number(d);
    if (n < 1 || n > 9999) continue;
    fnVal = d;
    break;
  }
  if (!fnVal) {
    const mB6 = line.match(/\bB6\s*(\d{3,4})\b/i);
    if (mB6) fnVal = mB6[1];
  }

  const eq =
    line.match(/\b(?:EQUIP|EQ)\s*:?\s*(\d[A-Z0-9]{2}|[A-Z]\d{2,3})\b/i) ??
    line.match(/\b(\d[A-Z0-9]{2})\b(?=.*\d{4})/);
  return {
    departureStation: first?.from ?? null,
    arrivalStation: first?.to ?? null,
    flightNumber: fnVal,
    departureTimeLocal: depT,
    arrivalTimeLocal: arrT,
    blockTimeLocal,
    equipmentCode: eq ? eq[1] : null,
    isDeadhead: isDh,
    rawLine: line,
    confidence: first ? (isDh ? 0.75 : depT && arrT ? 0.86 : 0.82) : 0.35,
  };
}

function splitDutySections(lines: string[]): string[][] {
  const sections: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (DUTY_MARKER.test(t)) {
      if (cur.length) sections.push(cur);
      cur = [t];
    } else if (cur.length) cur.push(t);
  }
  if (cur.length) sections.push(cur);
  return sections;
}

/**
 * Split duty days by scanning the whole block for DOW+day markers (MO30, WE01, …), not only line starts.
 * OCR often glues markers into one line or merges with route text.
 */
function splitDutyBodyByGlobalMarkers(bodyText: string): string[][] {
  const normalized = bodyText.replace(/\r\n/g, '\n');
  const re = /\b(SU|MO|TU|WE|TH|FR|SA)\s*(\d{1,2})\b/gi;
  const indices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    indices.push(m.index);
  }
  if (indices.length === 0) return [];
  const sections: string[][] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : normalized.length;
    const chunk = normalized.slice(start, end).trim();
    const lines = chunk
      .split(/\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (lines.length) sections.push(lines);
  }
  return sections;
}

function hhmmDigitsToLocal(digits: string): string {
  if (!/^\d{4}$/.test(digits)) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** FLICA often prints 948 / 0948L — normalize to HH:MM for storage/UI. */
export function flicaTimeTokenToLocal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '').slice(0, 4);
  if (d.length < 3) return null;
  const pad = d.length === 3 ? `0${d}` : d;
  return hhmmDigitsToLocal(pad.slice(-4));
}

/**
 * Extract Base + equip from FLICA pairing block. Base is pairing-level; never drop an explicit header value.
 */
function extractBaseAndEquipFromBlock(bodyText: string): { baseCode: string | null; equip: string | null } {
  const be = BASE_EQUIP.exec(bodyText) || BASE_EQUIP_ALT.exec(bodyText);
  if (be?.[1]) {
    const chunk = be[1].trim();
    const parts = chunk.split('/').map((p) => p.trim()).filter(Boolean);
    const baseTok = parts[0]?.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) ?? '';
    const baseCode = /^[A-Z]{3}$/.test(baseTok) ? baseTok : null;
    const equip = parts.length > 1 ? parts.slice(1).join('/').trim() : null;
    if (baseCode) return { baseCode, equip };
  }
  return { baseCode: null, equip: null };
}

/**
 * Route chain: ordered dep→arr segments, collapse consecutive duplicate stations (fixes JFK-JFK-LHR-JFK).
 * Output uses hyphens for summaries: JFK-LHR-JFK
 */
export function buildRouteChainFromDutyDays(dutyDays: JetBlueDutyDayParsed[]): string | null {
  const seq: string[] = [];
  for (const dd of dutyDays) {
    for (const seg of dd.segments) {
      if (!seg.departureStation || !seg.arrivalStation) continue;
      seq.push(seg.departureStation, seg.arrivalStation);
    }
  }
  if (seq.length < 2) return null;
  const collapsed: string[] = [];
  for (const s of seq) {
    const t = s.toUpperCase();
    if (collapsed.length === 0 || collapsed[collapsed.length - 1] !== t) collapsed.push(t);
  }
  if (collapsed.length < 2) return null;
  return collapsed.join('-');
}

function parseDEndLine(line: string): { dEndLocal: string | null; nextReportLocal: string | null } {
  const t = line.trim();
  if (!/D-END/i.test(t)) return { dEndLocal: null, nextReportLocal: null };
  const dm = /\bD-END\s*:?\s*(\d{3,4})L?\b/i.exec(t);
  const rm = /\bREPT\s*:?\s*(\d{3,4})L?\b/i.exec(t);
  return {
    dEndLocal: dm ? flicaTimeTokenToLocal(dm[1]) : null,
    nextReportLocal: rm ? flicaTimeTokenToLocal(rm[1]) : null,
  };
}

/**
 * Layover CITY + rest from duty-section lines (FLICA right column: `LAS 1236`).
 * Skips times that look like HHMM flight times when line also has station pair.
 */
function extractLayoverCityRestFromSection(
  sectionLines: string[],
  lastArrivalHint: string | null
): { city: string | null; rest: string | null } {
  let best: { city: string; rest: string; score: number } | null = null;
  for (const line of sectionLines) {
    const t = line.trim();
    if (/BSE\s*REPT|D-END|^FLTNO|^DEPL/i.test(t)) continue;
    const re = /\b([A-Z]{3})\s+(\d{4})\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const city = m[1];
      const rest = m[2];
      const n = Number(rest);
      if (!Number.isFinite(n)) continue;
      if (n < 900 || n > 4000) continue;
      if (n >= 1900 && n <= 1959) continue;
      let score = 0;
      if (lastArrivalHint && city === lastArrivalHint) score += 3;
      if (n >= 1100 && n <= 3200) score += 2;
      const cand = { city, rest, score };
      if (!best || cand.score > best.score) best = cand;
    }
  }
  if (!best || best.score < 1) return { city: null, rest: null };
  return { city: best.city, rest: best.rest };
}

/** FLICA-style layover column: `LHR 2057`, `LAS 1236`, hotel names elsewhere */
function extractLayoverStationsFromBlock(raw: string): string[] {
  const cities = new Set<string>();
  const re = /\b([A-Z]{3})\s+(\d{4})\b/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(raw)) !== null) {
    const n = Number(x[2]);
    if (n >= 1000 && n <= 3159) cities.add(x[1]);
  }
  return [...cities];
}

function inferDutyIso(
  markerLine: string,
  pairingStartIso: string | null,
  scheduleYear: number,
  scheduleMonth: number
): { dow: string | null; day: number | null; iso: string | null } {
  const t = markerLine.trim();
  const m =
    DUTY_MARKER.exec(t) ?? /\b(SU|MO|TU|WE|TH|FR|SA)\s*(\d{1,2})\b/i.exec(t);
  if (!m) return { dow: null, day: null, iso: null };
  const dow = m[1].toUpperCase();
  const day = Number(m[2]);
  if (!pairingStartIso) {
    const iso = `${scheduleYear}-${pad2(scheduleMonth)}-${pad2(day)}`;
    return { dow, day, iso };
  }
  const [py, pm] = pairingStartIso.split('-').map(Number);
  let iso = `${py}-${pad2(pm)}-${pad2(day)}`;
  const tryDate = new Date(`${iso}T12:00:00`);
  if (tryDate.getDate() !== day) {
    iso = `${scheduleYear}-${pad2(scheduleMonth)}-${pad2(day)}`;
  }
  return { dow, day, iso };
}

function parsePairingBlock(
  headerLine: string,
  bodyLines: string[],
  scheduleYear: number,
  scheduleMonth: number
): JetBluePairingParsed {
  const relaxed = extractPairingHeaderFromLine(headerLine, {
    year: scheduleYear,
    month: scheduleMonth,
  });
  const strict = PAIRING_HEADER.exec(headerLine.trim());
  const code = relaxed ? relaxed.code : strict ? strict[1].toUpperCase() : 'UNKNOWN';
  const dateTok = relaxed ? relaxed.dateTokenRaw : strict ? strict[2].toUpperCase() : '';
  const pairingStartIso = dateTok ? ddMmmToIso(dateTok, scheduleYear, scheduleMonth) : null;

  const bodyText = bodyLines.join('\n');
  const br = BSE_REPT.exec(bodyText);
  const beLine = BASE_EQUIP.exec(bodyText) ?? BASE_EQUIP_ALT.exec(bodyText);
  const { baseCode: baseFromEquip, equip: equipPart } = extractBaseAndEquipFromBlock(bodyText);
  const op = OPERATES.exec(bodyText);
  const pats: string[] = [];
  let om: RegExpExecArray | null;
  const re = new RegExp(ONLY_EXCEPT.source, 'gi');
  while ((om = re.exec(bodyText)) !== null) pats.push(om[1].trim());

  const inner = bodyLines.filter((l) => !lineLooksLikeTableHeader(l));
  const innerText = inner.join('\n');
  let dutySections = splitDutyBodyByGlobalMarkers(innerText);
  if (dutySections.length === 0) {
    dutySections = splitDutySections(inner);
  }
  const dutyDays: JetBlueDutyDayParsed[] = [];
  for (const sec of dutySections) {
    const head = sec[0] ?? '';
    const { dow, day, iso } = inferDutyIso(head, pairingStartIso, scheduleYear, scheduleMonth);
    const segments: JetBlueSegmentParsed[] = [];
    let layoverNotes: string | null = null;
    let dend: string | null = null;
    let dEndLocal: string | null = null;
    let nextReportLocal: string | null = null;
    for (const ln of sec.slice(1)) {
      const t = ln.trim();
      if (D_END.test(t)) {
        dend = t;
        const pe = parseDEndLine(t);
        dEndLocal = pe.dEndLocal;
        nextReportLocal = pe.nextReportLocal;
        continue;
      }
      if (HOTEL_HINT.test(t)) layoverNotes = t;
      if (
        lineLooksLikeSegmentRow(t, { year: scheduleYear, month: scheduleMonth }) ||
        extractStationPairs(t).length > 0
      ) {
        segments.push(parseSegmentFromLine(t));
      }
    }
    const lastArr =
      segments.length > 0 ? (segments[segments.length - 1]?.arrivalStation ?? null) : null;
    const layEx = extractLayoverCityRestFromSection(
      sec.filter((l) => !HOTEL_HINT.test(l)),
      lastArr
    );
    const dc = segments.length > 0 ? 0.78 : 0.42;
    dutyDays.push({
      dow,
      dayOfMonth: day,
      dutyDateIso: iso,
      segments,
      layoverNotes,
      dEndNotes: dend,
      dEndLocal,
      nextReportLocal,
      layoverCityCode: layEx.city,
      layoverRestDisplay: layEx.rest,
      hotelNote: layoverNotes,
      rawBlock: sec.join('\n'),
      confidence: dc,
    });
  }

  const baseRaw = baseFromEquip;
  normalizePairingSegments(dutyDays, baseRaw);

  const lastDutyDateIso = maxIsoDates(dutyDays.map((d) => d.dutyDateIso));
  const lastDayWithLegsIso = maxIsoDates(
    dutyDays.filter((d) => d.segments.length > 0).map((d) => d.dutyDateIso)
  );
  const operateFromLine = parseOperateWindowEndIso(bodyText, scheduleYear, scheduleMonth);
  /** Last day with parsed legs first; broad template `Operates … through month end` only if duty dates missing. */
  const operateEndIso = lastDayWithLegsIso ?? lastDutyDateIso ?? operateFromLine;

  const lowSeg = dutyDays.some((d) => d.segments.some((s) => s.confidence < 0.5));
  const totalSegs = dutyDays.reduce((n, d) => n + d.segments.length, 0);
  const hasLegs = totalSegs > 0;
  const routeSummary = buildRouteChainFromDutyDays(dutyDays);
  const layoverStations = extractLayoverStationsFromBlock(bodyText);

  let conf = 0.42;
  if (pairingStartIso && hasLegs) {
    conf = lowSeg ? 0.62 : 0.88;
  } else if (pairingStartIso && dutyDays.length > 0) {
    conf = 0.44;
  } else if (pairingStartIso) {
    conf = 0.46;
  }

  const needsReview = !hasLegs || lowSeg || conf < 0.75;

  return {
    pairingCode: code,
    headerDateToken: dateTok,
    pairingStartIso,
    lastDutyDateIso,
    operateEndIso,
    operatePatternText: pats.length ? pats.join(' · ') : null,
    operateWindowText: op ? op[1].trim() : null,
    baseReportTime: br ? br[1].trim() : null,
    baseCode: baseRaw,
    equipmentSummary: beLine ? beLine[1].trim() : baseRaw && equipPart ? `${baseRaw}/${equipPart}` : null,
    routeSummary,
    layoverStations,
    dutyDays,
    rawBlock: [headerLine, ...bodyLines].join('\n'),
    confidence: conf,
    needsReview,
  };
}

function extractPageMeta(lines: string[]): JetBluePageMeta {
  const head = lines.slice(0, 60).join('\n');
  const monthLabel = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+Schedule\b/i.exec(
    head
  );
  const name = /([A-Z][a-z]+\s+[A-Z][a-z]+)/.exec(head);
  const emp = /\b(\d{5})\b/.exec(head);
  const upd = /(Last\s+updated|Apr\s+\d+,\s*\d{4})/i.exec(head);
  return {
    scheduleMonthLabel: monthLabel ? monthLabel[0] : null,
    crewMemberName: name ? name[1].trim() : null,
    employeeId: emp ? emp[1] : null,
    lastUpdatedText: upd ? upd[0] : null,
  };
}

function extractMonthlyTotals(lines: string[]): JetBlueMonthlyTotalsParsed {
  const text = lines.join('\n');
  const rawLines: string[] = [];
  let blockHours: number | null = null;
  let creditHours: number | null = null;
  let ytdHours: number | null = null;
  let daysOff: number | null = null;

  const blockM = /\bBlock\s+(\d+\.\d{2})/i.exec(text);
  if (blockM) blockHours = Number(blockM[1]);
  const credM = /\bCredit\s+(\d+\.\d{2})/i.exec(text);
  if (credM) creditHours = Number(credM[1]);
  const ytdM = /\bYTD\s+(\d+\.\d{2})/i.exec(text);
  if (ytdM) ytdHours = Number(ytdM[1]);
  const doM = /\bDays?\s*Off\s+(\d+)/i.exec(text);
  if (doM) daysOff = Number(doM[1]);

  for (const ln of lines) {
    if (/\bTACLAG\b/i.test(ln)) rawLines.push(`[obsolete_field_raw] ${ln}`);
  }

  return { blockHours, creditHours, ytdHours, daysOff, rawLines };
}

type HeaderPos = { headerLine: string; start: number; end: number };

/**
 * Scan the full merged OCR string for every pairing header (not first-match only).
 * Used as the primary block splitter when the line-by-line pass collapses to a single block.
 */
function collectPairingHeaderPositions(
  raw: string,
  scheduleYear: number,
  scheduleMonth: number
): HeaderPos[] {
  const full = raw.replace(/\r\n/g, '\n');
  const matches: HeaderPos[] = [];

  const push = (headerLine: string, start: number, end: number) => {
    matches.push({ headerLine, start, end });
  };

  const re = /\b(J[A-Z0-9]{3,6})\s*[:/.]?\s*(\d{1,2}\s*[A-Za-z]{3})\b/gi;
  let x: RegExpExecArray | null;
  while ((x = re.exec(full)) !== null) {
    const code = fixOcrPairingCodeToken(x[1]);
    if (!/^J[A-Z0-9]{3,6}$/.test(code)) continue;
    const dateTok = normalizeDdMmmToken(x[2]);
    if (!/^\d{1,2}[A-Z]{3}$/.test(dateTok)) continue;
    if (!isValidDdMmmCalendarToken(dateTok)) continue;
    push(`${code} : ${dateTok}`, x.index, x.index + x[0].length);
  }

  const reSlash = /\b(J[A-Z0-9]{3,6})\s*[:.]?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/gi;
  while ((x = reSlash.exec(full)) !== null) {
    const code = x[1].toUpperCase();
    if (!/^J[A-Z0-9]{3,6}$/.test(code)) continue;
    const dateTok = slashPartsToDdMmm(x[2], x[3], scheduleYear, scheduleMonth, x[4]);
    if (!dateTok || !/^\d{1,2}[A-Z]{3}$/.test(dateTok)) continue;
    if (!isValidDdMmmCalendarToken(dateTok)) continue;
    push(`${code} : ${dateTok}`, x.index, x.index + x[0].length);
  }

  const reDow = /\b(J[A-Z0-9]{3,6})\s+(?:SU|MO|TU|WE|TH|FR|SA)\s+(\d{1,2})\b/gi;
  while ((x = reDow.exec(full)) !== null) {
    const code = fixOcrPairingCodeToken(x[1]);
    if (!/^J[A-Z0-9]{3,6}$/.test(code)) continue;
    const dateTok = dowDayToDdMmm(Number(x[2]), scheduleYear, scheduleMonth);
    if (!dateTok || !isValidDdMmmCalendarToken(dateTok)) continue;
    push(`${code} : ${dateTok}`, x.index, x.index + x[0].length);
  }

  matches.sort((a, b) => a.start - b.start);
  const deduped: HeaderPos[] = [];
  for (const h of matches) {
    if (deduped.length && h.start === deduped[deduped.length - 1].start) continue;
    deduped.push(h);
  }
  return deduped;
}

/** When line-by-line OCR does not align with pairing headers, scan the full blob (web screenshots). */
function fallbackBlocksFromFullText(raw: string, scheduleYear: number, scheduleMonth: number): { header: string; body: string[] }[] {
  const full = raw.replace(/\r\n/g, '\n');
  const deduped = collectPairingHeaderPositions(raw, scheduleYear, scheduleMonth);

  const out: { header: string; body: string[] }[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const bodyStart = deduped[i].end;
    const bodyEnd = i + 1 < deduped.length ? deduped[i + 1].start : full.length;
    const chunk = full.slice(bodyStart, bodyEnd);
    const body = chunk
      .split(/\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    out.push({ header: deduped[i].headerLine, body });
  }
  return out;
}

/**
 * Last resort: scan full OCR for loose `J#### : ddMMM` headers and build pairing blocks (low confidence).
 */
function salvagePairingsFromWeakOcr(
  fullText: string,
  scheduleYear: number,
  scheduleMonth: number
): JetBluePairingParsed[] {
  const re = /\b(J[A-Z0-9]{3,6})\s*[:/.]?\s*(\d{1,2}\s*[A-Za-z]{3})\b/gi;
  const matches: { headerLine: string; start: number; end: number }[] = [];
  let x: RegExpExecArray | null;
  while ((x = re.exec(fullText)) !== null) {
    const code = fixOcrPairingCodeToken(x[1]);
    if (!/^J[A-Z0-9]{3,6}$/.test(code)) continue;
    const dateTok = normalizeDdMmmToken(x[2]);
    if (!/^\d{1,2}[A-Z]{3}$/.test(dateTok)) continue;
    if (!isValidDdMmmCalendarToken(dateTok)) continue;
    const headerLine = `${code} : ${dateTok}`;
    matches.push({ headerLine, start: x.index, end: x.index + x[0].length });
  }
  if (matches.length === 0) return [];

  const out: JetBluePairingParsed[] = [];
  for (let i = 0; i < matches.length; i++) {
    const bodyStart = matches[i].end;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].start : fullText.length;
    const bodyChunk = fullText.slice(bodyStart, bodyEnd);
    const bodyLines = bodyChunk
      .split(/\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const p = parsePairingBlock(matches[i].headerLine, bodyLines, scheduleYear, scheduleMonth);
    out.push({
      ...p,
      confidence: Math.min(p.confidence, 0.42),
      needsReview: true,
    });
  }
  return out;
}

/**
 * Main entry: full OCR text + schedule month context.
 */
export function parseJetBlueFlicaMonthlyScreenshot(
  ocrText: string,
  monthKey: string
): JetBlueStructuredParseResult {
  const ym = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  const y = ym ? Number(ym[1]) : new Date().getFullYear();
  const m = ym ? Number(ym[2]) : new Date().getMonth() + 1;

  const flattened = normalizeOcrLeadIn(
    collapseSplitPairingHeaders(normalizeFlicaOcrNoiseGlobally(ocrText))
  );
  const monthCtx: JetBluePairingMonthContext = { year: y, month: m };

  const lines = flattened
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const meta = extractPageMeta(lines);
  const monthlyTotals = extractMonthlyTotals(lines);

  const blocks: { header: string; body: string[] }[] = [];
  let current: { header: string; body: string[] } | null = null;

  for (const line of lines) {
    const ph = extractPairingHeaderFromLine(line, monthCtx);
    if (ph) {
      if (current) blocks.push(current);
      const body: string[] = [];
      if (ph.restOfLine) body.push(ph.restOfLine);
      current = { header: ph.headerLine, body };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) blocks.push(current);

  const lineBlocks = blocks;
  const globalHeaderPositions = collectPairingHeaderPositions(flattened, y, m);
  const globalBlocks = fallbackBlocksFromFullText(flattened, y, m);
  /** Prefer full-text header scan whenever it finds headers — line-by-line often yields one mega-block. */
  let blockList = globalBlocks.length > 0 ? globalBlocks : lineBlocks;
  blockList = dedupePairingBlocks(blockList);

  let pairings = blockList.map((b) => parsePairingBlock(b.header, b.body, y, m));
  if (!pairings.some((p) => p.pairingCode !== 'UNKNOWN')) {
    const salvaged = salvagePairingsFromWeakOcr(flattened, y, m);
    if (salvaged.length) pairings = salvaged;
  }

  const spotlightCodes = ['J1016', 'J1007', 'J4173', 'J4309', 'J4041', 'J4262', 'JC58', 'J4195'];
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const spotlight: JetBlueFlicaParseDebug['spotlight'] = {};
  for (const code of spotlightCodes) {
    const foundInOcr = new RegExp(`\\b${escapeRe(code)}\\b`, 'i').test(flattened);
    const foundInBlockHeaders = blockList.some((b) =>
      b.header.toUpperCase().startsWith(`${code.toUpperCase()} :`)
    );
    let note: string | undefined;
    if (foundInOcr && !foundInBlockHeaders) {
      note =
        'code appears in OCR but no pairing block header after dedupe (duplicate header dropped, or date token mismatch)';
    } else if (!foundInOcr && foundInBlockHeaders) {
      note = 'header produced by normalizer/fixOcr; exact code not matched as standalone token in OCR';
    }
    spotlight[code] = { foundInOcr, foundInBlockHeaders, note };
  }

  const debug: JetBlueFlicaParseDebug = {
    pairingHeaderMatchCount: globalHeaderPositions.length,
    pairingHeaderList: globalHeaderPositions.map((h) => h.headerLine),
    blockCount: blockList.length,
    perPairing: pairings.map((p) => ({
      header: `${p.pairingCode} : ${p.headerDateToken}`,
      dutyRows: p.dutyDays.length,
      segments: p.dutyDays.reduce((n, d) => n + d.segments.length, 0),
      layoverStations: p.layoverStations.length,
    })),
    spotlight,
  };

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log('[parseJetBlueFlica]', JSON.stringify(debug));
  }

  return {
    meta,
    monthlyTotals,
    pairings,
    parserVersion: 'jetblue_flica_structured_v9_duty_hierarchy',
    debug,
  };
}
