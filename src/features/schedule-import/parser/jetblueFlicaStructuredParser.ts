/**
 * JetBlue FLICA monthly screenshot — structured parse (pairing blocks → duty days → segments).
 * Does not emit one row per OCR line; use persist layer to write schedule_pairings / legs.
 *
 * Obsolete for JetBlue logic: TACLAG, GRNT, DHC (may appear in raw snapshots only).
 *
 * FLICA “split view”: left = monthly list, right = same pairings expanded with detail. OCR returns one
 * unstructured string — not a real table. We model FLICA’s column *semantics* (DY DD → FLTNO → DPS-ARS → DEPL/ARRL)
 * with regex; that matches the screenshot layout in the common case but can still fail if OCR reorders tokens,
 * drops the flight column, or merges/splits lines differently than our golden tests (see `runFlicaFlightNumberGoldenSelfTest`).
 */

import type { StoredImportReviewIssue } from '../../crew-schedule/jetblueFlicaImportReviewIssues';
import {
  reconstructFlicaScreenshotSegmentRows,
  type FlicaReconstructedSegmentInput,
} from './flicaScreenshotTableReconstruct';
import {
  maxIsoDates,
  parseOperateWindowBoundsIso,
  parseOperateWindowEndIso,
} from './jetblueFlicaOperateDates';
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
  /** Screenshot table reconstruction — row text after OCR merge/normalize (for review UX + persistence). */
  reconstructedRowText?: string;
  /** FLTNO candidates from reconstruction when parser is uncertain (best first). */
  candidateFlightNumbers?: string[];
  /** 0–1 confidence for FLTNO from reconstruction pass. */
  fltnoRowConfidence?: number;
  fltnoSuggestionSource?: 'parser' | 'reconstructed_row' | 'ambiguous' | 'external_suggestion';
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
/** DOW + DD often glued on phone OCR (`FR01`); `\s*` allows merge + correct duty-day stripping before FLTNO. */
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

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * When OCR puts "FR 30" on one line and "7 JFK-LHR …" on the next, merge for parsing.
 * If the segment parser left FLTNO empty but the row reconstruction found token(s) before DPS-ARS,
 * always take the best candidate — FLICA uses 1–4+ digit flight ids (e.g. 7, 15, 2301); gating on
 * confidence caused empty DB flight_number + endless “needs review” while the value was already in the row.
 */
function applyScreenshotReconstructionToSegment(
  seg: JetBlueSegmentParsed,
  recon: FlicaReconstructedSegmentInput
): void {
  seg.reconstructedRowText = recon.reconstructedRowText;
  if (recon.candidateFlightNumbers.length) {
    seg.candidateFlightNumbers = [...recon.candidateFlightNumbers];
  }
  seg.fltnoRowConfidence = recon.fltnoConfidence;
  const hasParserFn = Boolean(seg.flightNumber?.trim());
  const c0 = recon.candidateFlightNumbers[0];
  if (!hasParserFn && c0) {
    seg.flightNumber = c0;
    seg.confidence = Math.max(seg.confidence, recon.fltnoConfidence, 0.86);
    seg.fltnoSuggestionSource =
      recon.candidateFlightNumbers.length > 1 && recon.fltnoSuggestionSource === 'ambiguous'
        ? 'ambiguous'
        : 'reconstructed_row';
  } else if (hasParserFn && !seg.fltnoSuggestionSource) {
    seg.fltnoSuggestionSource = 'parser';
  }
}

function mergeDutyLinesForOcrBreaks(sec: string[], monthCtx?: JetBluePairingMonthContext): string[] {
  const out: string[] = [];
  for (let i = 0; i < sec.length; i++) {
    const t = sec[i]!.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const hasPair = extractStationPairs(t).length > 0;
    const next = i + 1 < sec.length ? sec[i + 1]!.replace(/\s+/g, ' ').trim() : '';
    const nextHasPair = next ? extractStationPairs(next).length > 0 : false;
    if (
      !hasPair &&
      DUTY_MARKER.test(t) &&
      next &&
      (nextHasPair || lineLooksLikeSegmentRow(next, monthCtx))
    ) {
      out.push(`${t} ${next}`);
      i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * FLICA column order: DOW DD [FLT] DPS-ARS DEPL ARRL — take the last1–4 digit token before the first airport pair,
 * excluding block times and the duty day when it’s the only token before the pair.
 */
function flightNumberBeforeFirstPair(line: string, usedFourDigit: Set<string>): string | null {
  const t = line.replace(/\s+/g, ' ').trim();
  const pairM = /\b([A-Z]{3})\s*[-–]\s*([A-Z]{3})\b/.exec(t);
  if (!pairM || pairM.index === undefined) return null;
  const head = t.slice(0, pairM.index);
  const dm = DUTY_MARKER.exec(t);
  const dutyDay = dm ? Number(dm[2]) : NaN;
  const nums = [...head.matchAll(/\b(\d{1,4})\b/g)].map((m) => m[1]!);
  const cand: string[] = [];
  for (const d of nums) {
    if (usedFourDigit.has(d)) continue;
    const n = Number(d);
    if (!Number.isFinite(n) || n < 1 || n > 9999) continue;
    cand.push(d);
  }
  if (cand.length === 0) return null;
  let last = cand[cand.length - 1]!;
  if (Number.isFinite(dutyDay) && Number(last) === dutyDay) {
    if (cand.length >= 2) last = cand[cand.length - 2]!;
    else return null;
  }
  return String(Number(last));
}

/**
 * Last-chance: find `FLT AAA-BBB` anywhere in duty section text (multi-line OCR).
 */
function inferFlightFromBlobForRoute(
  blob: string,
  dep: string,
  arr: string,
  used: Set<string>
): string | null {
  const a = dep.toUpperCase().slice(0, 3);
  const b = arr.toUpperCase().slice(0, 3);
  const rx = new RegExp(`\\b(\\d{1,4})\\s+${escapeRe(a)}\\s*[-–]\\s*${escapeRe(b)}\\b`, 'i');
  const m = rx.exec(blob);
  if (!m) return null;
  const fn = m[1]!;
  if (used.has(fn)) return null;
  const n = Number(fn);
  if (!Number.isFinite(n) || n < 1 || n > 9999) return null;
  if (fn.length === 4 && used.has(fn)) return null;
  return String(n);
}

function fillMissingFlightsInDutySection(sec: string[], segments: JetBlueSegmentParsed[]): void {
  const blob = sec.map((s) => s.replace(/\s+/g, ' ').trim()).join('\n');
  for (const seg of segments) {
    if (seg.flightNumber) continue;
    if (!seg.departureStation || !seg.arrivalStation) continue;
    const used = new Set<string>();
    const ff = pickDepArrFourFourMatch(seg.rawLine);
    if (ff) {
      used.add(ff[1]);
      used.add(ff[2]);
    }
    const depD = seg.departureTimeLocal?.replace(/\D/g, '').slice(-4) ?? '';
    const arrD = seg.arrivalTimeLocal?.replace(/\D/g, '').slice(-4) ?? '';
    for (const d of [depD, arrD]) {
      if (d.length >= 3) used.add(d.length === 4 ? d : d.padStart(4, '0').slice(-4));
    }
    for (const ln of sec) {
      if (!ln.includes(seg.departureStation) || !ln.includes(seg.arrivalStation)) continue;
      const fn = flightNumberBeforeFirstPair(ln, used);
      if (fn) {
        seg.flightNumber = fn;
        seg.confidence = Math.max(seg.confidence, 0.72);
        break;
      }
    }
    if (seg.flightNumber) continue;
    const fromBlob = inferFlightFromBlobForRoute(blob, seg.departureStation, seg.arrivalStation, used);
    if (fromBlob) {
      seg.flightNumber = fromBlob;
      seg.confidence = Math.max(seg.confidence, 0.72);
    }
  }
}

/**
 * Repair legs already in DB: when `flight_number` is empty but `raw_text` / route exist, infer FLICA flight column.
 */
export function tryInferFlightNumberFromLegRaw(
  rawText: string | null | undefined,
  dep: string | null | undefined,
  arr: string | null | undefined,
  departureTimeLocal: string | null | undefined,
  arrivalTimeLocal: string | null | undefined
): string | null {
  const a = (dep ?? '').trim().toUpperCase().slice(0, 3);
  const b = (arr ?? '').trim().toUpperCase().slice(0, 3);
  if (!a || !b || !/^[A-Z]{3}$/.test(a) || !/^[A-Z]{3}$/.test(b)) return null;
  const raw = (rawText ?? '').trim();
  if (!raw) return null;
  const used = new Set<string>();
  const depD = departureTimeLocal?.replace(/\D/g, '').slice(-4) ?? '';
  const arrD = arrivalTimeLocal?.replace(/\D/g, '').slice(-4) ?? '';
  for (const d of [depD, arrD]) {
    if (d.length >= 3) used.add(d.length === 4 ? d : d.padStart(4, '0').slice(-4));
  }
  const lines = raw
    .split(/\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  for (const line of lines) {
    if (!line.includes(a) || !line.includes(b)) continue;
    const fn = flightNumberBeforeFirstPair(line, used);
    if (fn) return fn;
  }
  const blob = lines.join(' ');
  return inferFlightFromBlobForRoute(blob, a, b, used);
}

function lineLooksLikeTableHeader(line: string): boolean {
  const u = line.toUpperCase();
  return /^DY\s+DD\s+DHC/i.test(u) || (u.includes('FLTNO') && u.includes('DEPL'));
}

function lineLooksLikeSegmentRow(line: string, monthCtx?: JetBluePairingMonthContext): boolean {
  const t = line.trim();
  if (lineLooksLikeTableHeader(t)) return false;
  if (extractPairingHeaderFromLine(t, monthCtx)) return false;
  if (PAIRING_HEADER.test(t)) return false;
  if (D_END.test(t)) return false;
  /** Phone FLICA often glues `FR 03 7 JFK-LHR 2057 0915` — DOW+day + FLT + pair on one line; must still be a segment row. */
  const pairs = extractStationPairs(t);
  if (pairs.length > 0) return true;
  /**
   * OCR drops DOW: `03 7 JFK-LHR …` (DD + FLTNO + DPS-ARS) — still a table body row.
   * Must run before `DUTY_MARKER` check: `03` alone matches `\d{1,2}` at start… but `03 7 JFK` has pairs — already returned.
   * Lines like `08 2220 LHR-JFK` have pairs. Lines that are only `FR 03` stay false below.
   */
  if (/^\d{1,2}(?:\s+(?:DH|D\/H|DHC))?\s+\d{1,4}\s+[A-Z]{3}\s*[-–]\s*[A-Z]{3}\b/i.test(t)) return true;
  if (DUTY_MARKER.test(t)) return false;
  return /\bDH\b/i.test(t) && extractStationPairs(t.replace(/\bDH\b/g, '')).length >= 0 && /\d{3,4}/.test(t);
}

/**
 * FLICA column order: FLTNO … DPS-ARS … DEPL ARRL — the first `HHMM HHMM` after the first airport pair
 * is almost always block-out / block-in, not the flight number (e.g. `2229 LHR-JFK 0812 1139` must not take 2229+0812 as times).
 */
function pickDepArrFourFourMatch(line: string): RegExpMatchArray | null {
  const pairM = /\b([A-Z]{3})\s*[-–]\s*([A-Z]{3})\b/.exec(line);
  const pairEnd = pairM ? pairM.index! + pairM[0].length : 0;
  const cands = [...line.matchAll(/\b(\d{4})\s+(\d{4})\b/g)];
  if (!cands.length) return null;
  const afterPair = cands.filter((m) => (m.index ?? 0) >= pairEnd);
  if (afterPair.length) return afterPair[0]!;
  return cands[0]!;
}

function tryDutyColumnFlightToken(
  m: RegExpExecArray,
  flightGroup: number,
  firstPairStart: number,
  usedFourDigit: Set<string>
): string | null {
  const flTok = m[flightGroup];
  if (!flTok || !/^\d{1,4}$/.test(flTok)) return null;
  const end = (m.index ?? 0) + m[0].length;
  if (end > firstPairStart) return null;
  if (flTok.length === 4 && usedFourDigit.has(flTok)) return null;
  const n = Number(flTok);
  if (n < 1 || n > 9999) return null;
  return String(n);
}

function isPlausibleHHMM4(s: string): boolean {
  if (!/^\d{4}$/.test(s)) return false;
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(2));
  return h <= 23 && m <= 59;
}

/**
 * OCR often shuffles FLICA columns so FLTNO sits *after* DPS-ARS (`LHR-JFK 2220 0810 1140`).
 * `pickDepArrFourFourMatch` then treats `2220` as DEPL and drops the real flight from the row.
 */
function tryFltDepArrTripleAfterStationPair(
  line: string,
  pairEnd: number
): { flt: string; dep: string; arr: string } | null {
  const tail = line.slice(pairEnd);
  const m = /^\s*(\d{1,4})\s+(\d{4})\s+(\d{4})\b/.exec(tail);
  if (!m) return null;
  const flTok = m[1]!;
  const d1 = m[2]!;
  const d2 = m[3]!;
  if (!isPlausibleHHMM4(d1) || !isPlausibleHHMM4(d2)) return null;
  if (flTok === d1 || flTok === d2) return null;
  const n = Number(flTok);
  if (!Number.isFinite(n) || n < 1 || n > 9999) return null;
  return { flt: String(n), dep: d1, arr: d2 };
}

/**
 * FLICA segment rows: flight column is often 1–4 digits (e.g. 7, 15, 411) before DPS-ARS; dep/arr are 4-digit times.
 * OCR line may be `FR 03 7 JFK-LHR 2057 0915` or `FR037 JFK-LHR` (tight) or `FLTNO 411 JFK-LAS ...`.
 */
function extractFlicaFlightNumberFromLine(line: string, usedFourDigit: Set<string>): string | null {
  const t = line.replace(/\s+/g, ' ').trim();
  const pairM = /\b([A-Z]{3})\s*[-–]\s*([A-Z]{3})\b/.exec(t);
  const firstPairStart = pairM?.index ?? t.length;

  /**
   * FLICA table body (DY DD [DHC] FLTNO DPS-ARS …): flight is always the 1–4 digit token
   * immediately before the first AAA-BBB pair. Handles single-digit FLTNO (e.g. 7) that `\b(\d{3,4})\b` skips.
   */
  const tableRowFull =
    /^(?:SU|MO|TU|WE|TH|FR|SA)\s*\d{1,2}(?:\s+(?:DH|D\/H|DHC))?\s+(\d{1,4})\s+[A-Z]{3}\s*[-–]\s*[A-Z]{3}\b/i.exec(t);
  if (tableRowFull) {
    const flTok = tableRowFull[1]!;
    const n = Number(flTok);
    if (n >= 1 && n <= 9999 && !(flTok.length === 4 && usedFourDigit.has(flTok))) return String(n);
  }
  /** Glued DD+FLTNO before DPS-ARS: `FR01977 FLL-SFO`, `WE2915 JFK-SFO` (no space between DD and flight). */
  const tableRowDdFltGlued =
    /^(?:SU|MO|TU|WE|TH|FR|SA)\s*(\d{1,2})(\d{1,4})(?=\s*[A-Z]{3}\s*[-–]\s*[A-Z]{3}\b)/i.exec(t);
  if (tableRowDdFltGlued) {
    const dd = Number(tableRowDdFltGlued[1]);
    const flTok = tableRowDdFltGlued[2]!;
    const n = Number(flTok);
    if (
      dd >= 1 &&
      dd <= 31 &&
      n >= 1 &&
      n <= 9999 &&
      !(flTok.length === 4 && usedFourDigit.has(flTok)) &&
      !/^0+$/.test(flTok)
    ) {
      return String(n);
    }
  }
  const tableRowNoDow =
    /^(\d{1,2})(?:\s+(?:DH|D\/H|DHC))?\s+(\d{1,4})\s+[A-Z]{3}\s*[-–]\s*[A-Z]{3}\b/i.exec(t);
  if (tableRowNoDow) {
    const flTok = tableRowNoDow[2]!;
    const n = Number(flTok);
    if (n >= 1 && n <= 9999 && !(flTok.length === 4 && usedFourDigit.has(flTok))) return String(n);
  }

  const dutyStrict = /^(SU|MO|TU|WE|TH|FR|SA)\s*\d{1,2}\s+(?:(?:DH|D\/H|DHC)\s+)?(\d{1,4})\b/i.exec(t);
  let fn = dutyStrict ? tryDutyColumnFlightToken(dutyStrict, 2, firstPairStart, usedFourDigit) : null;
  if (!fn) {
    /** Tight OCR: `FR037 JFK-LHR` / `WE 29 15 JFK` — `\b` after DD so `01` cannot split into `0`+`1` (fake FLTNO `1`). */
    const dutyLoose =
      /^(SU|MO|TU|WE|TH|FR|SA)\s*(\d{1,2})\b\s*(?:(?:DH|D\/H|DHC)\s*)?(\d{1,4})(?=\s*[A-Z]{3}\s*[-–])/i.exec(t);
    fn = dutyLoose ? tryDutyColumnFlightToken(dutyLoose, 3, firstPairStart, usedFourDigit) : null;
  }
  if (fn) return fn;

  const fltnoLab = /\b(?:FLTNO|FLT)\s*[ #:]*(\d{1,4})\b/i.exec(t);
  if (fltnoLab) {
    const flTok = fltnoLab[1];
    const n = Number(flTok);
    if (n >= 1 && n <= 9999 && !(flTok.length === 4 && usedFourDigit.has(flTok))) return String(n);
  }

  for (const mm of t.matchAll(/\b(\d{3,4})\b/g)) {
    const d = mm[1];
    if (usedFourDigit.has(d)) continue;
    const idx = mm.index ?? 0;
    if (idx < firstPairStart) {
      const n = Number(d);
      if (n >= 1 && n <= 9999) return d;
    }
  }

  /** Continuation line split from DOW: `7 JFK-LHR 2057 0915` or `DH 411 JFK-LAS …` */
  const leadFl = /^\s*(?:(?:DH|D\/H|DHC)\s+)?(\d{1,4})\s+[A-Z]{3}\s*[-–]/i.exec(t);
  if (leadFl) {
    const flTok = leadFl[1];
    const n = Number(flTok);
    if (n >= 1 && n <= 9999 && !(flTok.length === 4 && usedFourDigit.has(flTok))) return String(n);
  }

  /**
   * Anywhere on the line: `… 7 JFK-LHR` / `… 2220 LHR-JFK` (phone OCR loses column order).
   * Skip token when it equals duty DD only (avoid `MO 30 JFK` → mis-reading30 as FLTNO).
   */
  if (pairM) {
    const a = pairM[1]!;
    const b = pairM[2]!;
    const dm = DUTY_MARKER.exec(t);
    const dutyDd = dm ? Number(dm[2]) : NaN;
    const rx = new RegExp(`\\b(\\d{1,4})\\s+${escapeRe(a)}\\s*[-–]\\s*${escapeRe(b)}\\b`, 'gi');
    for (const m of t.matchAll(rx)) {
      const flTok = m[1]!;
      if (usedFourDigit.has(flTok)) continue;
      const n = Number(flTok);
      if (!Number.isFinite(n) || n < 1 || n > 9999) continue;
      if (Number.isFinite(dutyDd) && n === dutyDd) continue;
      return String(n);
    }
  }

  return null;
}

/**
 * Parse one OCR line that contains a FLICA duty segment (table row or phone-wrapped).
 * Exported for golden regression checks — the app still uses the monthly parser entrypoint.
 */
export function parseJetBlueFlicaSegmentLine(line: string): JetBlueSegmentParsed {
  return parseSegmentFromLine(line);
}

function parseSegmentFromLine(line: string): JetBlueSegmentParsed {
  const pairM = /\b([A-Z]{3})\s*[-–]\s*([A-Z]{3})\b/.exec(line);
  const pairs = extractStationPairs(line);
  /** Prefer multi-pair extraction; fall back to first regex match so confidence/stations aren’t dropped when formats differ slightly. */
  const route = pairs[0] ?? (pairM ? { from: pairM[1], to: pairM[2] } : undefined);
  const isDh = /\bDH\b|\bD\/H\b|\bDEAD\s*HEAD\b/i.test(line);
  let depT: string | null = null;
  let arrT: string | null = null;
  const pairEnd = pairM ? pairM.index! + pairM[0].length : 0;
  const fourFour = pickDepArrFourFourMatch(line);
  if (fourFour) {
    depT = hhmmDigitsToLocal(fourFour[1]);
    arrT = hhmmDigitsToLocal(fourFour[2]);
  } else {
    const times = [...line.matchAll(/\b(\d{4})\b/g)]
      .filter((m) => (m.index ?? 0) >= pairEnd)
      .map((x) => x[1]);
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
    const all4 = [...line.matchAll(/\b(\d{4})\b/g)]
      .filter((m) => (m.index ?? 0) >= pairEnd)
      .map((x) => x[1]);
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

  let fnVal = extractFlicaFlightNumberFromLine(line, usedDigits);
  if (!fnVal) {
    for (const mm of line.matchAll(/\b(\d{3,4})\b/g)) {
      const d = mm[1];
      if (usedDigits.has(d)) continue;
      const n = Number(d);
      if (n < 1 || n > 9999) continue;
      fnVal = d;
      break;
    }
  }
  if (!fnVal) {
    const mB6 = line.match(/\bB6\s*(\d{1,4})\b/i);
    if (mB6) fnVal = String(Number(mB6[1]));
  }
  if (!fnVal) {
    fnVal = flightNumberBeforeFirstPair(line, usedDigits);
  }

  /**
   * OCR column order: FLTNO after DPS-ARS (`WE 01 LHR-JFK 2220 0810 1140`). `pickDepArrFourFourMatch`
   * eats `2220` as DEPL; recover when pre-route head has only duty DD (no FLT token).
   */
  if (!fnVal && pairM && fourFour) {
    const trip = tryFltDepArrTripleAfterStationPair(line, pairEnd);
    const headNumCount = [...line.slice(0, pairM.index!).matchAll(/\b(\d{1,4})\b/g)].length;
    if (
      trip &&
      fourFour[1] === trip.flt &&
      fourFour[2] === trip.dep &&
      headNumCount <= 1
    ) {
      fnVal = trip.flt;
      depT = hhmmDigitsToLocal(trip.dep);
      arrT = hhmmDigitsToLocal(trip.arr);
      usedDigits.clear();
      usedDigits.add(trip.dep);
      usedDigits.add(trip.arr);
      blockTimeLocal = null;
      const all4b = [...line.matchAll(/\b(\d{4})\b/g)]
        .filter((m) => (m.index ?? 0) >= pairEnd)
        .map((x) => x[1]);
      if (all4b.length >= 3) {
        const thirdB = all4b.find((d) => d !== trip.dep && d !== trip.arr && d !== trip.flt);
        if (thirdB) {
          blockTimeLocal = hhmmDigitsToLocal(thirdB);
          usedDigits.add(thirdB);
        }
      }
    }
  }

  const eq =
    line.match(/\b(?:EQUIP|EQ)\s*:?\s*(\d[A-Z0-9]{2}|[A-Z]\d{2,3})\b/i) ??
    line.match(/\b(\d[A-Z0-9]{2})\b(?=.*\d{4})/);
  const hasRoute = !!route;
  let confidence = hasRoute ? (isDh ? 0.75 : depT && arrT ? 0.86 : 0.82) : 0.35;
  if (hasRoute && fnVal && depT && arrT) confidence = Math.max(confidence, 0.84);

  return {
    departureStation: route?.from ?? null,
    arrivalStation: route?.to ?? null,
    flightNumber: fnVal,
    departureTimeLocal: depT,
    arrivalTimeLocal: arrT,
    blockTimeLocal,
    equipmentCode: eq ? eq[1] : null,
    isDeadhead: isDh,
    rawLine: line,
    confidence,
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
  const be =
    BASE_EQUIP.exec(bodyText) ||
    BASE_EQUIP_ALT.exec(bodyText) ||
    /\bBase\s+Equip\s*:?\s*([^|\n]+)/i.exec(bodyText);
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
/** Substring after the first D-END time clause — layover city + rest usually follow on the same OCR line. */
function textAfterDEndClause(line: string): string | null {
  const dm = /\bD-END\s*:?\s*\d{3,4}L?\b/i.exec(line);
  if (!dm) return null;
  const tail = line.slice(dm.index + dm[0].length).trim();
  return tail.length ? tail : null;
}

/** Departure + arrival HHMM on a segment row — never treat those as layover “rest”. */
function segmentDepArrDigitSet(line: string): Set<string> {
  const s = new Set<string>();
  const fourFour = pickDepArrFourFourMatch(line);
  if (fourFour) {
    s.add(fourFour[1]);
    s.add(fourFour[2]);
  }
  return s;
}

function extractLayoverCityRestFromSection(
  sectionLines: string[],
  lastArrivalHint: string | null,
  monthCtx?: JetBluePairingMonthContext
): { city: string | null; rest: string | null } {
  let best: { city: string; rest: string; score: number } | null = null;
  for (const line of sectionLines) {
    const t = line.trim();
    if (/^FLTNO|^DEPL/i.test(t)) continue;
    if (!/\bD-END\b/i.test(t) && /BSE\s*REPT/i.test(t)) continue;

    const dEndParsed = /\bD-END\b/i.test(t) ? parseDEndLine(t) : { dEndLocal: null, nextReportLocal: null };
    const dEndDigits = dEndParsed.dEndLocal?.replace(/\D/g, '').slice(-4) ?? null;
    const reptDigits = dEndParsed.nextReportLocal?.replace(/\D/g, '').slice(-4) ?? null;
    const flightTimes = segmentDepArrDigitSet(t);
    const isSeg = lineLooksLikeSegmentRow(t, monthCtx);

    const scanZones: { text: string; postDEnd: boolean }[] = [];
    if (/\bD-END\b/i.test(t)) {
      const tail = textAfterDEndClause(t);
      if (tail) scanZones.push({ text: tail, postDEnd: true });
    } else {
      scanZones.push({ text: t, postDEnd: false });
    }

    for (const z of scanZones) {
      const re = /\b([A-Z]{3})\s+(\d{4})\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(z.text)) !== null) {
        const city = m[1];
        const rest = m[2];
        const n = Number(rest);
        if (!Number.isFinite(n)) continue;
        if (dEndDigits && rest === dEndDigits) continue;
        if (reptDigits && rest === reptDigits) continue;
        if (flightTimes.has(rest)) continue;
        /** Layover rest display (clock-style); skip narrow band that is usually OCR noise, not layover length. */
        if (n < 900 || n > 4000) continue;
        if (n >= 1900 && n <= 1959) continue;
        /** Segment rows: require layover-like band so we do not pick 0948-style dep times as “rest”. */
        if (isSeg && n < 1000) continue;

        let score = 0;
        if (lastArrivalHint && city === lastArrivalHint) score += 3;
        if (n >= 1100 && n <= 3200) score += 2;
        if (z.postDEnd) score += 5;
        const cand = { city, rest, score };
        if (!best || cand.score > best.score) best = cand;
      }
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

function extractDutyHeadMarker(head: string): { dow: string; day: number } | null {
  const t = head.trim();
  const m =
    DUTY_MARKER.exec(t) ?? /\b(SU|MO|TU|WE|TH|FR|SA)\s*(\d{1,2})\b/i.exec(t);
  if (!m) return null;
  const day = Number(m[2]);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  return { dow: m[1].toUpperCase(), day };
}

/**
 * FLICA duty rows show DY DD only (no month). Old logic used header Y-M for every row, so DD=01 after
 * DD=31 became “Mar 1” instead of “Apr 1” on carry-over trips (Mar 30–31 + Apr 1, credit split across months).
 * Advance month when the calendar date would not be strictly after the previous duty day.
 *
 * **PDF / multi-leg same day:** Two segment rows often repeat the same DY+DD (e.g. two `SU 26` lines for two legs).
 * The global splitter then emits duplicate `26` entries → old logic treated the second `26` as “must be after Apr 26”
 * and rolled to **May 26** incorrectly. Consecutive duplicate DD → same calendar day as previous row.
 *
 * **Operate window:** When `Operates: Apr 26–Apr 27` is present, clamp inferred dates so they never land after the
 * printed trip end (fixes stray **May** from rollover noise).
 */
function inferDutyIsoSequence(
  daysOfMonth: number[],
  pairingStartIso: string | null,
  scheduleYear: number,
  scheduleMonth: number,
  operateWindow?: { startIso: string | null; endIso: string | null } | null
): string[] {
  const out: string[] = [];
  let prevMs: number | null = null;
  let cy: number;
  let cm: number;
  if (pairingStartIso && /^\d{4}-\d{2}-\d{2}$/.test(pairingStartIso)) {
    const [py, pm] = pairingStartIso.split('-').map(Number);
    cy = py;
    cm = pm;
  } else {
    cy = scheduleYear;
    cm = scheduleMonth;
  }

  const opEnd =
    operateWindow?.endIso && /^\d{4}-\d{2}-\d{2}$/.test(operateWindow.endIso) ? operateWindow.endIso : null;
  const endMs = opEnd ? new Date(`${opEnd}T12:00:00`).getTime() : null;

  for (let idx = 0; idx < daysOfMonth.length; idx++) {
    const dom = daysOfMonth[idx];
    if (!Number.isFinite(dom) || dom < 1 || dom > 31) {
      out.push('');
      continue;
    }

    /** Two `26` rows in one pairing (multi-leg same day) — keep **same ISO** as previous; do not roll to May. */
    if (idx > 0 && dom === daysOfMonth[idx - 1] && out[idx - 1] && /^\d{4}-\d{2}-\d{2}$/.test(out[idx - 1])) {
      const same = out[idx - 1];
      out.push(same);
      const pd = new Date(`${same}T12:00:00`);
      prevMs = pd.getTime();
      cy = pd.getFullYear();
      cm = pd.getMonth() + 1;
      continue;
    }

    let tryY = cy;
    let tryM = cm;
    let chosen: Date | null = null;
    for (let guard = 0; guard < 36; guard++) {
      const isoTry = `${tryY}-${pad2(tryM)}-${pad2(dom)}`;
      const d = new Date(`${isoTry}T12:00:00`);
      if (d.getDate() !== dom || d.getMonth() + 1 !== tryM) {
        tryM += 1;
        if (tryM > 12) {
          tryM = 1;
          tryY += 1;
        }
        continue;
      }
      if (prevMs !== null && d.getTime() <= prevMs) {
        tryM += 1;
        if (tryM > 12) {
          tryM = 1;
          tryY += 1;
        }
        continue;
      }
      chosen = d;
      break;
    }
    if (!chosen) {
      out.push(`${scheduleYear}-${pad2(scheduleMonth)}-${pad2(dom)}`);
      continue;
    }

    /** If we rolled past `Operates: … Apr 27` into May, pull back into the end month when DD still fits the window. */
    if (endMs != null && opEnd) {
      const curIso = `${chosen.getFullYear()}-${pad2(chosen.getMonth() + 1)}-${pad2(chosen.getDate())}`;
      if (curIso.localeCompare(opEnd) > 0) {
        const [ey, em] = opEnd.split('-').map(Number);
        const alt = new Date(`${ey}-${pad2(em)}-${pad2(dom)}T12:00:00`);
        if (
          alt.getDate() === dom &&
          alt.getMonth() + 1 === em &&
          alt.getTime() <= endMs &&
          (prevMs === null || alt.getTime() > prevMs)
        ) {
          chosen = alt;
        }
      }
    }

    out.push(`${chosen.getFullYear()}-${pad2(chosen.getMonth() + 1)}-${pad2(chosen.getDate())}`);
    prevMs = chosen.getTime();
    cy = chosen.getFullYear();
    cm = chosen.getMonth() + 1;
  }
  return out;
}

/** Consecutive duty sections that resolved to the same calendar day (multi-leg PDF split) → one row, all segments. */
function mergeAdjacentDutyDaysSameIso(days: JetBlueDutyDayParsed[]): JetBlueDutyDayParsed[] {
  const out: JetBlueDutyDayParsed[] = [];
  for (const d of days) {
    const prev = out[out.length - 1];
    if (prev && d.dutyDateIso && prev.dutyDateIso === d.dutyDateIso) {
      prev.segments = [...prev.segments, ...d.segments];
      prev.rawBlock = [prev.rawBlock, d.rawBlock].filter(Boolean).join('\n');
      prev.confidence = Math.max(prev.confidence, d.confidence);
      if (!prev.dEndNotes && d.dEndNotes) prev.dEndNotes = d.dEndNotes;
      if (!prev.dEndLocal && d.dEndLocal) prev.dEndLocal = d.dEndLocal;
      if (!prev.nextReportLocal && d.nextReportLocal) prev.nextReportLocal = d.nextReportLocal;
      if (!prev.layoverNotes && d.layoverNotes) prev.layoverNotes = d.layoverNotes;
      if (!prev.layoverCityCode && d.layoverCityCode) prev.layoverCityCode = d.layoverCityCode;
      if (!prev.layoverRestDisplay && d.layoverRestDisplay) prev.layoverRestDisplay = d.layoverRestDisplay;
      continue;
    }
    out.push({ ...d, segments: [...d.segments] });
  }
  return out;
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
  const operateBounds = parseOperateWindowBoundsIso(bodyText, scheduleYear, scheduleMonth);
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
  const dutyMonthCtx: JetBluePairingMonthContext = { year: scheduleYear, month: scheduleMonth };

  type PreparedDutySection = {
    sec: string[];
    dow: string | null;
    day: number | null;
  };
  const preparedSections: PreparedDutySection[] = [];
  for (const sec of dutySections) {
    const chunkText = sec.join('\n');
    /** Drop mini-calendar / stray DOW+DD lines (no airport pair, no D-END) — they skew Mar 1–30 “duty” spans. */
    const chunkHasStationPair = /\b[A-Z]{3}\s*[-–]\s*[A-Z]{3}\b/.test(chunkText);
    const chunkHasDEnd = sec.some((l) => D_END.test(l.trim()));
    const chunkHasHotel = sec.some((l) => HOTEL_HINT.test(l.trim()));
    if (!chunkHasStationPair && !chunkHasDEnd && !chunkHasHotel) continue;

    const head = sec[0] ?? '';
    const marker = extractDutyHeadMarker(head);
    preparedSections.push({
      sec,
      dow: marker?.dow ?? null,
      day: marker?.day ?? null,
    });
  }

  const daysForSequence = preparedSections.map((p) => p.day).filter((d): d is number => d != null);
  const dutyDateIsos = inferDutyIsoSequence(
    daysForSequence,
    pairingStartIso,
    scheduleYear,
    scheduleMonth,
    operateBounds
  );
  let dutySeqIdx = 0;

  for (const { sec, dow, day } of preparedSections) {
    const rawIso = day != null ? dutyDateIsos[dutySeqIdx++] : '';
    const iso = rawIso && /^\d{4}-\d{2}-\d{2}$/.test(rawIso) ? rawIso : null;
    const segments: JetBlueSegmentParsed[] = [];
    let layoverNotes: string | null = null;
    let dend: string | null = null;
    let dEndLocal: string | null = null;
    let nextReportLocal: string | null = null;
    const mergedSec = mergeDutyLinesForOcrBreaks(sec, dutyMonthCtx);
    const segmentRawLines: string[] = [];
    for (const ln of mergedSec) {
      const t = ln.trim();
      if (D_END.test(t)) {
        dend = t;
        const pe = parseDEndLine(t);
        dEndLocal = pe.dEndLocal;
        nextReportLocal = pe.nextReportLocal;
        continue;
      }
      if (HOTEL_HINT.test(t)) layoverNotes = t;
      if (lineLooksLikeTableHeader(t)) continue;
      if (lineLooksLikeSegmentRow(t, dutyMonthCtx) || extractStationPairs(t).length > 0) {
        segmentRawLines.push(t);
      }
    }
    const reconRows = reconstructFlicaScreenshotSegmentRows(segmentRawLines);
    for (const recon of reconRows) {
      const seg = parseSegmentFromLine(recon.normalizedLine);
      applyScreenshotReconstructionToSegment(seg, recon);
      segments.push(seg);
    }
    fillMissingFlightsInDutySection(mergedSec, segments);
    const segmentsForDuty = segments.filter(
      (s) => Boolean(s.departureStation?.trim() && s.arrivalStation?.trim())
    );
    const lastArr =
      segmentsForDuty.length > 0
        ? (segmentsForDuty[segmentsForDuty.length - 1]?.arrivalStation ?? null)
        : null;
    const layEx = extractLayoverCityRestFromSection(
      sec.filter((l) => !HOTEL_HINT.test(l)),
      lastArr,
      { year: scheduleYear, month: scheduleMonth }
    );
    const dc = segmentsForDuty.length > 0 ? 0.78 : 0.42;
    dutyDays.push({
      dow,
      dayOfMonth: day,
      dutyDateIso: iso,
      segments: segmentsForDuty,
      layoverNotes,
      dEndNotes: dend,
      dEndLocal,
      nextReportLocal,
      layoverCityCode: (() => {
        const c = (layEx.city ?? '').trim().toUpperCase();
        if (!c) return null;
        if (c === 'JAS') return 'LAS';
        return c;
      })(),
      layoverRestDisplay: layEx.rest,
      hotelNote: layoverNotes,
      rawBlock: sec.join('\n'),
      confidence: dc,
    });
  }

  const dutyDaysMerged = mergeAdjacentDutyDaysSameIso(dutyDays);
  const baseRaw = baseFromEquip;
  normalizePairingSegments(dutyDaysMerged, baseRaw);

  const lastDutyDateIso = maxIsoDates(dutyDaysMerged.map((d) => d.dutyDateIso));
  const lastDayWithLegsIso = maxIsoDates(
    dutyDaysMerged.filter((d) => d.segments.length > 0).map((d) => d.dutyDateIso)
  );
  const operateFromLine = parseOperateWindowEndIso(bodyText, scheduleYear, scheduleMonth);
  /** Last day with parsed legs first; broad template `Operates … through month end` only if duty dates missing. */
  const operateEndIso = lastDayWithLegsIso ?? lastDutyDateIso ?? operateFromLine;

  /** Phantom rows (no parsed route) use confidence 0.35 — ignore them for pairing-level “low segment” penalties. */
  const lowSeg = dutyDaysMerged.some((d) =>
    d.segments.some(
      (s) =>
        Boolean(s.departureStation?.trim() && s.arrivalStation?.trim()) && s.confidence < 0.5
    )
  );
  const totalSegs = dutyDaysMerged.reduce((n, d) => n + d.segments.length, 0);
  const hasLegs = totalSegs > 0;
  const routeSummary = buildRouteChainFromDutyDays(dutyDaysMerged);
  const layoverStations = extractLayoverStationsFromBlock(bodyText);

  let conf = 0.42;
  if (pairingStartIso && hasLegs) {
    conf = lowSeg ? 0.62 : 0.88;
  } else if (pairingStartIso && dutyDaysMerged.length > 0) {
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
    dutyDays: dutyDaysMerged,
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

/**
 * FLICA screenshot: month totals live in the bottom-left summary list, not in pairing bodies.
 * Scan the tail of the OCR line list (last ~120 lines), drop lines that look like trip detail,
 * then take the **last** Block / Credit / YTD / Days Off hits so we do not pick trip-level noise.
 * TAFB is intentionally not parsed here.
 */
function lineLooksLikeTripBodyForTotalsFilter(line: string, monthCtx: JetBluePairingMonthContext): boolean {
  const t = line.trim();
  if (!t) return true;
  if (extractPairingHeaderFromLine(t, monthCtx)) return true;
  if (/\bJ[A-Z0-9]{3,6}\s*[:/.]\s*\d{1,2}\s*[A-Za-z]{3}\b/i.test(t)) return true;
  if (lineLooksLikeTableHeader(t)) return true;
  if (lineLooksLikeSegmentRow(t, monthCtx)) return true;
  if (/\b(BSE\s*REPT|BASE\/EQUIP|OPERATES|FLTNO|DEPL\/|DHC\b)/i.test(t)) return true;
  if (/\b(SU|MO|TU|WE|TH|FR|SA)\s+\d{1,2}\b.*\b[A-Z]{3}\s*[-–]\s*[A-Z]{3}\b/i.test(t)) return true;
  return false;
}

function parseDecimalHoursToken(raw: string): number | null {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n < 500 ? n : null;
}

function extractMonthlyTotals(lines: string[], monthCtx: JetBluePairingMonthContext): JetBlueMonthlyTotalsParsed {
  const rawLines: string[] = [];
  let blockHours: number | null = null;
  let creditHours: number | null = null;
  let ytdHours: number | null = null;
  let daysOff: number | null = null;

  const tailN = Math.min(120, lines.length);
  const tail = lines.slice(-tailN);
  const filtered = tail.filter((ln) => !lineLooksLikeTripBodyForTotalsFilter(ln, monthCtx));
  const scanLines = filtered.length >= 2 ? filtered : tail;

  const dec = '(\\d{1,3}(?:[.,]\\d{2}))';
  for (let i = scanLines.length - 1; i >= 0; i--) {
    const ln = scanLines[i] ?? '';
    if (blockHours == null) {
      const m = new RegExp(`\\bBlock\\s*[:#\\s]+${dec}`, 'i').exec(ln);
      if (m) {
        const v = parseDecimalHoursToken(m[1]);
        if (v != null) blockHours = v;
      }
    }
    if (creditHours == null) {
      const m = new RegExp(`\\bCredit\\s*[:#\\s]+${dec}`, 'i').exec(ln);
      if (m) {
        const v = parseDecimalHoursToken(m[1]);
        if (v != null) creditHours = v;
      }
    }
    if (ytdHours == null) {
      const m = new RegExp(`\\bYTD\\s*[:#\\s]+${dec}`, 'i').exec(ln);
      if (m) {
        const v = parseDecimalHoursToken(m[1]);
        if (v != null) ytdHours = v;
      }
    }
    if (daysOff == null) {
      const m = /\bDays?\s*Off\s*[:#]?\s*(\d{1,3})\b/i.exec(ln);
      if (m) {
        const v = Number(m[1]);
        if (Number.isFinite(v) && v >= 0 && v <= 366) daysOff = v;
      }
    }
    if (blockHours != null && creditHours != null && ytdHours != null && daysOff != null) break;
  }

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

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const g = runFlicaFlightNumberGoldenSelfTest();
    if (!g.ok) {
      // eslint-disable-next-line no-console
      console.warn('[FLICA parser] Golden FLTNO self-test failed:', g.failures);
    }
    const d = runFlicaDutyDateSequenceSelfTest();
    if (!d.ok) {
      // eslint-disable-next-line no-console
      console.warn('[FLICA parser] Duty-date sequence self-test failed:', d.failures);
    }
  }

  const flattened = normalizeOcrLeadIn(
    collapseSplitPairingHeaders(normalizeFlicaOcrNoiseGlobally(ocrText))
  );
  const monthCtx: JetBluePairingMonthContext = { year: y, month: m };

  const lines = flattened
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const meta = extractPageMeta(lines);
  const monthlyTotals = extractMonthlyTotals(lines, monthCtx);

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
    parserVersion: 'jetblue_flica_structured_v20_duty_dates_pdf_dup_dd_operate_clamp',
    debug,
  };
}

/**
 * Concrete review issues for DB (`normalized_json.import_review_issues`) so PDF/OCR imports
 * always have explainable, field-targeted rows in the pairing editor — not just a global flag.
 */
export function buildStoredImportReviewIssues(p: JetBluePairingParsed): StoredImportReviewIssue[] {
  const issues: StoredImportReviewIssue[] = [];
  const totalSegs = p.dutyDays.reduce((n, d) => n + d.segments.length, 0);
  const hasLegs = totalSegs > 0;

  if (!hasLegs) {
    issues.push({
      field_key: 'operate_end_date',
      validation_state: 'needs_review',
      reason_code: 'conflicting_context',
      duty_date_iso: null,
      reason_display:
        'No flight legs were parsed in this pairing block (PDF/OCR may have dropped duty lines). Add legs from the pairing detail or re-import a clearer page.',
    });
  }

  if (p.pairingStartIso && p.confidence < 0.75) {
    issues.push({
      field_key: 'operate_start_date',
      validation_state: 'needs_review',
      reason_code: 'low_confidence_match',
      duty_date_iso: null,
      reason_display:
        `Overall pairing confidence is ${Math.round(p.confidence * 100)}% — confirm trip start / operate dates against your schedule.`,
    });
  }

  const lastDuty = p.lastDutyDateIso;
  const end = p.operateEndIso;
  if (lastDuty && end && lastDuty.localeCompare(end) > 0) {
    issues.push({
      field_key: 'operate_end_date',
      validation_state: 'needs_review',
      reason_code: 'conflicting_context',
      duty_date_iso: null,
      reason_display:
        'The last parsed duty day is after the operate end date — adjust end date or verify duty lines.',
    });
  }

  const seenFlightIssue = new Set<string>();
  for (const d of p.dutyDays) {
    const iso = d.dutyDateIso;
    for (const seg of d.segments) {
      const rf = (seg.departureStation ?? '').trim().toUpperCase();
      const rt = (seg.arrivalStation ?? '').trim().toUpperCase();
      const routeKey = `${iso ?? ''}|${rf}-${rt}`;

      if (!seg.flightNumber?.trim() && (seg.candidateFlightNumbers?.length ?? 0) > 0 && iso) {
        if (seenFlightIssue.has(`sug:${routeKey}`)) continue;
        seenFlightIssue.add(`sug:${routeKey}`);
        const rowSnippet = (seg.reconstructedRowText ?? seg.rawLine).trim();
        issues.push({
          field_key: 'leg:flight_number',
          validation_state: 'needs_review',
          reason_code: 'low_confidence_match',
          duty_date_iso: iso,
          leg_route_from: rf || undefined,
          leg_route_to: rt || undefined,
          reconstructed_row_text: rowSnippet,
          candidate_flight_numbers: seg.candidateFlightNumbers,
          row_confidence: seg.fltnoRowConfidence,
          suggestion_source: 'reconstructed_row',
          reason_display: `Flight number didn’t parse into this leg. Reconstructed row: ${rowSnippet.slice(0, 180)}${
            rowSnippet.length > 180 ? '…' : ''
          }`,
          candidates: (seg.candidateFlightNumbers ?? []).map((v) => ({ value: v, label: `Use ${v}` })),
        });
        continue;
      }

      if (seg.confidence < 0.5 && iso && !seenFlightIssue.has(`low:${routeKey}`)) {
        seenFlightIssue.add(`low:${routeKey}`);
        issues.push({
          field_key: 'leg:flight_number',
          validation_state: 'needs_review',
          reason_code: 'unreadable',
          duty_date_iso: iso,
          leg_route_from: rf || undefined,
          leg_route_to: rt || undefined,
          reconstructed_row_text: (seg.reconstructedRowText ?? seg.rawLine).trim() || undefined,
          reason_display:
            'One flight line on this day had low OCR confidence — verify flight number, route, and times on that line.',
          candidates: seg.flightNumber
            ? [{ value: seg.flightNumber, label: `Use ${seg.flightNumber}` }]
            : undefined,
        });
      }
    }

    if (d.layoverRestDisplay && (!d.layoverCityCode || d.confidence < 0.55)) {
      issues.push({
        field_key: 'leg:layover_city',
        validation_state: 'needs_review',
        reason_code: d.layoverCityCode ? 'suspicious_code' : 'inferred_value',
        duty_date_iso: iso,
        reason_display: d.layoverCityCode
          ? `Layover station “${d.layoverCityCode}” may need confirmation against your pairing line.`
          : 'Layover city did not parse clearly even though rest or hotel timing appeared — enter the station if shown.',
      });
    }
  }

  if (p.needsReview && issues.length === 0) {
    issues.push({
      field_key: 'report_time_local',
      validation_state: 'needs_review',
      reason_code: 'low_confidence_match',
      duty_date_iso: null,
      reason_display:
        'This pairing was flagged for review — confirm report time, base, and every leg against the PDF or original roster.',
    });
  }

  return issues;
}

/**
 * Golden OCR-shaped lines for pairing J1007–style FLICA detail (FLTNO 7 / 2220). Run after parser changes.
 * Not a mathematical proof for all future OCR — a regression lock on the layout you shared.
 */
export const FLICA_GOLDEN_SEGMENT_LINES_J1007 = [
  'FR 03 7 JFK-LHR 2057 0915 0718',
  'WE 08 2220 LHR-JFK 0812 1139 0827',
  '03 7 JFK-LHR 2057 0915 0718',
  '08 2220 LHR-JFK 0812 1139 0827',
] as const;

export type FlicaFltnoGoldenCase = {
  id: string;
  /** One logical row as a single string, or OCR-split fragments (merged by screenshot reconstruction). */
  lines: string | string[];
  want: string;
  /** When multiple segment rows are reconstructed from `lines`, pick the row containing this route. */
  route?: { from: string; to: string };
};

/** Regression lock: J1007/J1016-style, J3258 multi-leg, J4173/J4309 digits, DH, messy OCR splits. */
export const FLICA_FLTNO_GOLDEN_CASES: FlicaFltnoGoldenCase[] = [
  { id: 'J1007-fr03', lines: 'FR 03 7 JFK-LHR 2057 0915 0718', want: '7' },
  { id: 'J1007-we08', lines: 'WE 08 2220 LHR-JFK 0812 1139 0827', want: '2220' },
  { id: 'J1007-nodow-a', lines: '03 7 JFK-LHR 2057 0915 0718', want: '7' },
  { id: 'J1007-nodow-b', lines: '08 2220 LHR-JFK 0812 1139 0827', want: '2220' },
  { id: 'J1016-we01-tight', lines: 'WE01 2220 LHR-JFK 0810 1140 0830', want: '2220' },
  { id: 'J1016-fr03-tight', lines: 'FR03 7 JFK-LHR 2057 0915 0718', want: '7' },
  // OCR splits — station pair on next line
  { id: 'split-fr03', lines: ['FR 03', '7 JFK-LHR 2057 0915 0718'], want: '7' },
  { id: 'split-we01', lines: ['WE 01', '2220 LHR-JFK 0810 1140 0830'], want: '2220' },
  { id: 'split-su05', lines: ['SU 05', '2220 LHR-JFK 0812 1139 0827'], want: '2220' },
  { id: 'split-dow-only', lines: ['FR', '03 7 JFK-LHR 2057 0915 0718'], want: '7' },
  {
    id: 'header-plus-row',
    lines: ['DY DD DHC FLTNO DPS-ARS DEPL ARRL BLKT', 'MO 30 7 JFK-LHR 2107 0918 0711'],
    want: '7',
  },
  // J3258-style multi-leg (same day)
  {
    id: 'J3258-jfk-fll',
    lines: 'SU 26 2301 JFK-FLL 0829 1146 0317',
    want: '2301',
    route: { from: 'JFK', to: 'FLL' },
  },
  {
    id: 'J3258-fll-msy',
    lines: 'SU 26 1823 FLL-MSY 1250 1358 0208',
    want: '1823',
    route: { from: 'FLL', to: 'MSY' },
  },
  {
    id: 'J3258-msy-bos',
    lines: 'MO 27 1300 MSY-BOS 0600 1013 0313',
    want: '1300',
    route: { from: 'MSY', to: 'BOS' },
  },
  {
    id: 'J3258-dh-bos-jfk',
    lines: 'MO27 DH 417 BOS-JFK 1140 1257 0117',
    want: '417',
    route: { from: 'BOS', to: 'JFK' },
  },
  {
    id: 'J3258-dh-split',
    lines: ['MO 27 DH', '417 BOS-JFK 1140 1257 0117'],
    want: '417',
    route: { from: 'BOS', to: 'JFK' },
  },
  // J4173-style flight numbers
  { id: 'J4173-411', lines: 'TU 14 411 JFK-LAS 0815 1142 0527', want: '411' },
  { id: 'J4173-2822', lines: 'TU 14 2822 LAS-JFK 1305 2110 0755', want: '2822' },
  { id: 'J4173-2831', lines: 'WE 16 2831 JFK-SFO 0940 1305 0625', want: '2831' },
  { id: 'J4173-948', lines: 'WE 16 948 SFO-JFK 1510 2345 0845', want: '948' },
  // J4309-style
  { id: 'J4309-115', lines: 'FR 04 115 BOS-MCO 0600 0945 0345', want: '115' },
  { id: 'J4309-434', lines: 'FR 04 434 MCO-BOS 1045 1345 0300', want: '434' },
  { id: 'J4309-919', lines: 'SA 06 919 BOS-SJU 0810 1410 0600', want: '919' },
  { id: 'J4309-290', lines: 'SU 07 290 SJU-BOS 1030 1615 0545', want: '290' },
  // J4195-style (2-digit FLTNO, cross-month DD) + glued OCR
  { id: 'J4195-we29-15', lines: 'WE 29 15 JFK-SFO 0630 0927 0557 0623 225', want: '15' },
  { id: 'J4195-fr01-977', lines: 'FR 01 977 FLL-SFO 0750 1109 0619 32S', want: '977' },
  { id: 'J4195-fr01977-glued', lines: 'FR01977 FLL-SFO 0750 1109 0619 32S', want: '977' },
  { id: 'J4195-we2915-glued', lines: 'WE2915 JFK-SFO 0630 0927 0557 0623 225', want: '15' },
  { id: 'J4195-sa02-816', lines: 'SA 02 816 SFO-JFK 0730 1553 0523 32S', want: '816' },
  { id: 'J3258-su262301-glued', lines: 'SU262301 JFK-FLL 0820 1140 0317 0104 225', want: '2301' },
  // J1016 carry-over: FLTNO before route; phone OCR column drift
  { id: 'J1016-mo30-jfk7', lines: 'MO 30 7 JFK-LHR 2107 0918 0718 3NL', want: '7' },
  // FLTNO after DPS-ARS in OCR stream (only DD before route — not `WE 01 2220 LHR`)
  { id: 'J1016-we01-lhr2220-swapped', lines: 'WE 01 LHR-JFK 2220 0810 1140 3NL', want: '2220' },
];

function goldenPickReconstructedRow(
  recons: FlicaReconstructedSegmentInput[],
  route?: { from: string; to: string }
): FlicaReconstructedSegmentInput | null {
  if (!recons.length) return null;
  if (!route) return recons[0]!;
  const a = route.from.toUpperCase();
  const b = route.to.toUpperCase();
  const rx = new RegExp(`\\b${a}\\s*[-–]\\s*${b}\\b`, 'i');
  const hit = recons.find((r) => rx.test(r.normalizedLine));
  return hit ?? recons[0]!;
}

/** Same path as screenshot import: reconstruct OCR rows → parse segment → apply FLTNO reconstruction. */
export function parseFlicaGoldenScreenshotFltnoCase(c: FlicaFltnoGoldenCase): JetBlueSegmentParsed {
  const rawLines = typeof c.lines === 'string' ? [c.lines] : c.lines;
  const recons = reconstructFlicaScreenshotSegmentRows(rawLines);
  const recon = goldenPickReconstructedRow(recons, c.route);
  if (!recon) {
    return parseSegmentFromLine('');
  }
  const seg = parseSegmentFromLine(recon.normalizedLine);
  applyScreenshotReconstructionToSegment(seg, recon);
  return seg;
}

export function runFlicaFlightNumberGoldenSelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const c of FLICA_FLTNO_GOLDEN_CASES) {
    const seg = parseFlicaGoldenScreenshotFltnoCase(c);
    const got = seg.flightNumber;
    if (got !== c.want) {
      const preview = typeof c.lines === 'string' ? c.lines : c.lines.join(' | ');
      failures.push(`[${c.id}] "${preview.slice(0, 120)}" → want ${c.want}, got ${got ?? 'null'}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

/** Carry-over / cross-month trips: DD after a larger DD must roll into the next calendar month. */
export function runFlicaDutyDateSequenceSelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const carry = inferDutyIsoSequence([30, 31, 1], '2026-03-30', 2026, 3);
  const wantCarry = ['2026-03-30', '2026-03-31', '2026-04-01'];
  if (carry.join('|') !== wantCarry.join('|')) {
    failures.push(`Mar→Apr carry-over: want ${wantCarry.join(', ')}, got ${carry.join(', ')}`);
  }
  const same = inferDutyIsoSequence([5, 6, 7], '2026-03-05', 2026, 3);
  const wantSame = ['2026-03-05', '2026-03-06', '2026-03-07'];
  if (same.join('|') !== wantSame.join('|')) {
    failures.push(`same month: want ${wantSame.join(', ')}, got ${same.join(', ')}`);
  }
  const noHeader = inferDutyIsoSequence([29, 30, 1], null, 2026, 3);
  const wantNoH = ['2026-03-29', '2026-03-30', '2026-04-01'];
  if (noHeader.join('|') !== wantNoH.join('|')) {
    failures.push(`schedule month anchor: want ${wantNoH.join(', ')}, got ${noHeader.join(', ')}`);
  }
  /** J3C58 PDF: duplicate DD=26 for two legs same day — must not roll to May 26. */
  const dup26 = inferDutyIsoSequence([26, 26, 27], '2026-04-26', 2026, 4, {
    startIso: '2026-04-26',
    endIso: '2026-04-27',
  });
  const wantDup = ['2026-04-26', '2026-04-26', '2026-04-27'];
  if (dup26.join('|') !== wantDup.join('|')) {
    failures.push(`duplicate DD same trip: want ${wantDup.join(', ')}, got ${dup26.join(', ')}`);
  }
  return { ok: failures.length === 0, failures };
}
