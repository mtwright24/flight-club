/**
 * Parse JetBlue FLICA `scheduledetail.cgi` HTML (post GO=1) into crew-facing trip structures.
 * Strips markup to plain text, then delegates to `parseJetBlueFlicaMonthlyScreenshot` (same logic as OCR imports).
 */

import {
  type JetBlueFlicaParseDebug,
  type JetBluePageMeta,
  type JetBluePairingParsed,
  type JetBlueStructuredParseResult,
  parseJetBlueFlicaMonthlyScreenshot,
} from '../features/schedule-import/parser/jetblueFlicaStructuredParser';

/** One flight / duty segment with airport times. */
export type FlicaScheduleLeg = {
  date: string;
  departCity: string;
  arriveCity: string;
  departTime: string;
  arriveTime: string;
};

/** One pairing (trip) aggregated from FLICA schedule detail. */
export type FlicaSchedulePairing = {
  id: string;
  startDate: string;
  endDate: string;
  reportTime: string;
  dEndTime: string;
  days: number;
  /** Decimal hours when parsed from block text (e.g. 19.54); otherwise 0. */
  blockHours: number;
  creditHours: number;
  layoverCities: string[];
  legs: FlicaScheduleLeg[];
};

/** Month header stats from schedule page (decimal hours where FLICA shows decimals). */
export type FlicaScheduleMonthStats = {
  block: number;
  credit: number;
  tafb: number;
  ytd: number;
  daysOff: number;
};

export type FlicaScheduledetailHtmlParseResult = {
  monthKey: string;
  stats: FlicaScheduleMonthStats;
  pairings: FlicaSchedulePairing[];
  meta: JetBluePageMeta;
  /** Original structured parse (debug, version). */
  source: Pick<JetBlueStructuredParseResult, 'parserVersion' | 'debug'>;
};

const DECIMAL_HOURS = /(\d{1,3}(?:[.,]\d{2}))/;

function parseDecimalHoursToken(raw: string): number | null {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n < 500 ? n : null;
}

function extractTafbFromPlainText(plain: string): number | null {
  const lines = plain.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = new RegExp(`\\bTAFB\\s*[:#\\s]+${DECIMAL_HOURS.source}`, 'i').exec(lines[i] ?? '');
    if (m) {
      const v = parseDecimalHoursToken(m[1]);
      if (v != null) return v;
    }
  }
  return null;
}

function formatReportTime(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '');
  if (d.length >= 4) return `${d.slice(0, 2)}:${d.slice(2, 4)}`;
  return raw;
}

function extractPairingBlockDecimalHours(raw: string, label: 'BLKT' | 'Credit'): number | null {
  const re =
    label === 'BLKT'
      ? /\bBLKT\s*[:#]?\s*(\d{1,3}(?:[.,]\d{2}))/i
      : /\bCredit\s*[:#]?\s*(\d{1,3}(?:[.,]\d{2}))/i;
  const m = re.exec(raw);
  if (!m) return null;
  return parseDecimalHoursToken(m[1]);
}

function mapJetBluePairing(p: JetBluePairingParsed): FlicaSchedulePairing {
  const legs: FlicaScheduleLeg[] = [];
  for (const d of p.dutyDays) {
    const dutyIso = d.dutyDateIso ?? '';
    for (const s of d.segments) {
      legs.push({
        date: dutyIso,
        departCity: s.departureStation ?? '',
        arriveCity: s.arrivalStation ?? '',
        departTime: s.departureTimeLocal ?? '',
        arriveTime: s.arrivalTimeLocal ?? '',
      });
    }
  }

  const lastDuty = p.dutyDays[p.dutyDays.length - 1];
  const lastSeg = lastDuty?.segments[lastDuty.segments.length - 1];
  const dEndTime =
    lastDuty?.dEndLocal ??
    lastSeg?.arrivalTimeLocal ??
    '';

  const dutyDaysWithContext = p.dutyDays.filter((d) => d.dutyDateIso || d.segments.length > 0).length;

  return {
    id: p.pairingCode,
    startDate: p.pairingStartIso ?? '',
    endDate: p.operateEndIso ?? p.lastDutyDateIso ?? '',
    reportTime: formatReportTime(p.baseReportTime),
    dEndTime: dEndTime ?? '',
    days: dutyDaysWithContext || (p.pairingStartIso ? 1 : 0),
    blockHours: extractPairingBlockDecimalHours(p.rawBlock, 'BLKT') ?? 0,
    creditHours: extractPairingBlockDecimalHours(p.rawBlock, 'Credit') ?? 0,
    layoverCities: [...p.layoverStations],
    legs,
  };
}

/**
 * Remove scripts/styles and tags so FLICA table content becomes line-oriented text
 * suitable for the screenshot/OCR structured parser.
 */
export function stripHtmlToFlicaPlainText(html: string): string {
  let t = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  t = t.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/(tr|table|div|p|h\d)\s*>/gi, '\n');
  t = t.replace(/<td\b[^>]*>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;/gi, ' ');
  t = t.replace(/&amp;/g, '&');
  t = t.replace(/&lt;/g, '<');
  t = t.replace(/&gt;/g, '>');
  t = t.replace(/\r\n/g, '\n');
  t = t.replace(/[ \t\f\v]+/g, ' ');
  t = t.replace(/\n\s*\n+/g, '\n');
  return t.trim();
}

/**
 * @param html Raw HTML from `scheduledetail.cgi?GO=1&token=…&BlockDate=MMYY`.
 * @param monthKey Calendar month for pairing date resolution, e.g. `2026-04` for BlockDate 0426.
 */
export function parseFlicaScheduledetailHtml(
  html: string,
  monthKey: string
): FlicaScheduledetailHtmlParseResult {
  const plain = stripHtmlToFlicaPlainText(html);
  const structured = parseJetBlueFlicaMonthlyScreenshot(plain, monthKey);
  const tafb = extractTafbFromPlainText(plain) ?? 0;

  const stats: FlicaScheduleMonthStats = {
    block: structured.monthlyTotals.blockHours ?? 0,
    credit: structured.monthlyTotals.creditHours ?? 0,
    tafb,
    ytd: structured.monthlyTotals.ytdHours ?? 0,
    daysOff: structured.monthlyTotals.daysOff ?? 0,
  };

  const pairings = structured.pairings.map(mapJetBluePairing);

  return {
    monthKey: monthKey.trim(),
    stats,
    pairings,
    meta: structured.meta,
    source: {
      parserVersion: structured.parserVersion,
      debug: structured.debug,
    },
  };
}

export type { JetBlueFlicaParseDebug };
