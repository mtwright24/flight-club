/**
 * FLICA screenshot-specific table-body reconstruction (OCR → logical segment rows).
 * Runs before per-row field extraction so FLTNO / route / times stay row-local like PDF text order.
 */

export type FlicaScreenshotMonthCtx = { year: number; month: number };

export type FlicaReconstructedSegmentInput = {
  /** Single line fed to segment parser */
  normalizedLine: string;
  /** Human-readable reconstructed row (may include merged fragments) */
  reconstructedRowText: string;
  /** FLTNO candidates, best first */
  candidateFlightNumbers: string[];
  /** Confidence that candidates[0] is the real FLTNO (0–1) */
  fltnoConfidence: number;
  fltnoSuggestionSource: 'reconstructed_row' | 'ambiguous';
};

const STATION_PAIR = /\b([A-Z]{3})\s*[-–]\s*([A-Z]{3})\b/g;
const DUTY_LINE_START = /^(SU|MO|TU|WE|TH|FR|SA)\s*(\d{1,2})\b/i;
const TABLE_HEADER_NOISE = /^DY\s+DD\s+DHC|FLTNO\s+DPS|DPS-ARS\s+DEPL/i;

function extractStationPairs(line: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let x: RegExpExecArray | null;
  const re = new RegExp(STATION_PAIR.source, 'g');
  while ((x = re.exec(line)) !== null) out.push({ from: x[1], to: x[2] });
  return out;
}

function lineLooksLikeTableHeader(line: string): boolean {
  const u = line.toUpperCase();
  return TABLE_HEADER_NOISE.test(u) || (u.includes('FLTNO') && u.includes('DEPL'));
}

function pickDepArrFourFourMatch(line: string): RegExpMatchArray | null {
  const pairM = /\b([A-Z]{3})\s*[-–]\s*([A-Z]{3})\b/.exec(line);
  const pairEnd = pairM ? pairM.index! + pairM[0].length : 0;
  const cands = [...line.matchAll(/\b(\d{4})\s+(\d{4})\b/g)];
  if (!cands.length) return null;
  const afterPair = cands.filter((m) => (m.index ?? 0) >= pairEnd);
  if (afterPair.length) return afterPair[0]!;
  return cands[0]!;
}

function buildUsedDigitsForFltno(line: string): Set<string> {
  const used = new Set<string>();
  const fourFour = pickDepArrFourFourMatch(line);
  if (fourFour) {
    used.add(fourFour[1]);
    used.add(fourFour[2]);
  }
  const blkt = /\b(?:BLKT|TBLK|BLOCK)\s*:?\s*(\d{2,4})\b/i.exec(line);
  if (blkt) {
    const b = blkt[1].padStart(4, '0').slice(-4);
    if (/^\d{4}$/.test(b)) used.add(b);
  } else {
    const pairM = /\b([A-Z]{3})\s*[-–]\s*([A-Z]{3})\b/.exec(line);
    const pairEnd = pairM ? pairM.index! + pairM[0].length : 0;
    const all4 = [...line.matchAll(/\b(\d{4})\b/g)]
      .filter((m) => (m.index ?? 0) >= pairEnd)
      .map((x) => x[1]);
    if (fourFour && all4.length >= 3) {
      const third = all4.find((d) => d !== fourFour[1] && d !== fourFour[2]);
      if (third) used.add(third);
    }
  }
  return used;
}

const DUTY_MARKER = /^(SU|MO|TU|WE|TH|FR|SA)\s*(\d{1,2})\b/i;

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

function extractFltnoCandidatesFromRow(line: string): { best: string | null; all: string[]; confidence: number } {
  const t = line.replace(/\s+/g, ' ').trim();
  const used = buildUsedDigitsForFltno(t);
  const all = new Set<string>();

  const tableRowFull =
    /^(?:SU|MO|TU|WE|TH|FR|SA)\s*\d{1,2}(?:\s+(?:DH|D\/H|DHC))?\s+(\d{1,4})\s+[A-Z]{3}\s*[-–]\s*[A-Z]{3}\b/i.exec(t);
  if (tableRowFull) {
    const fl = tableRowFull[1]!;
    const n = Number(fl);
    if (n >= 1 && n <= 9999 && !(fl.length === 4 && used.has(fl))) {
      all.add(String(n));
      return { best: String(n), all: [String(n)], confidence: 0.94 };
    }
  }
  const tableRowDdFltGlued =
    /^(?:SU|MO|TU|WE|TH|FR|SA)\s*(\d{1,2})(\d{1,4})(?=\s*[A-Z]{3}\s*[-–]\s*[A-Z]{3}\b)/i.exec(t);
  if (tableRowDdFltGlued) {
    const dd = Number(tableRowDdFltGlued[1]);
    const fl = tableRowDdFltGlued[2]!;
    const n = Number(fl);
    if (
      dd >= 1 &&
      dd <= 31 &&
      n >= 1 &&
      n <= 9999 &&
      !(fl.length === 4 && used.has(fl)) &&
      !/^0+$/.test(fl)
    ) {
      all.add(String(n));
      return { best: String(n), all: [String(n)], confidence: 0.93 };
    }
  }
  const tableRowNoDow =
    /^(\d{1,2})(?:\s+(?:DH|D\/H|DHC))?\s+(\d{1,4})\s+[A-Z]{3}\s*[-–]\s*[A-Z]{3}\b/i.exec(t);
  if (tableRowNoDow) {
    const fl = tableRowNoDow[2]!;
    const n = Number(fl);
    if (n >= 1 && n <= 9999 && !(fl.length === 4 && used.has(fl))) {
      all.add(String(n));
      return { best: String(n), all: [String(n)], confidence: 0.9 };
    }
  }

  const beforePair = flightNumberBeforeFirstPair(t, used);
  if (beforePair) all.add(beforePair);

  const pairM = /\b([A-Z]{3})\s*[-–]\s*([A-Z]{3})\b/.exec(t);
  const firstPairStart = pairM?.index ?? t.length;
  for (const mm of t.matchAll(/\b(\d{3,4})\b/g)) {
    const d = mm[1];
    if (used.has(d)) continue;
    if ((mm.index ?? 0) >= firstPairStart) continue;
    const n = Number(d);
    if (n >= 1 && n <= 9999) all.add(String(n));
  }
  const leadFl = /^\s*(?:(?:DH|D\/H|DHC)\s+)?(\d{1,4})\s+[A-Z]{3}\s*[-–]/i.exec(t);
  if (leadFl) {
    const fl = leadFl[1]!;
    const n = Number(fl);
    if (n >= 1 && n <= 9999 && !(fl.length === 4 && used.has(fl))) all.add(String(n));
  }

  if (pairM) {
    const a = pairM[1]!;
    const b = pairM[2]!;
    const dm = DUTY_MARKER.exec(t);
    const dutyDd = dm ? Number(dm[2]) : NaN;
    const rx = new RegExp(`\\b(\\d{1,4})\\s+${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–]\\s*${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    for (const m of t.matchAll(rx)) {
      const fl = m[1]!;
      if (used.has(fl)) continue;
      const n = Number(fl);
      if (!Number.isFinite(n) || n < 1 || n > 9999) continue;
      if (Number.isFinite(dutyDd) && n === dutyDd) continue;
      all.add(String(n));
    }
  }

  const sorted = [...all];
  if (sorted.length === 0) return { best: null, all: [], confidence: 0 };
  if (sorted.length === 1) return { best: sorted[0]!, all: sorted, confidence: beforePair ? 0.88 : 0.72 };
  return { best: sorted[0]!, all: sorted, confidence: 0.55 };
}

function shouldMergeWithNextForScreenshot(prev: string, next: string): boolean {
  if (extractStationPairs(prev).length > 0) return false;
  if (extractStationPairs(next).length === 0) return false;
  const p = prev.trim();
  if (DUTY_LINE_START.test(p)) return true;
  if (/^(SU|MO|TU|WE|TH|FR|SA)\s*$/i.test(p)) return true;
  if (/^\d{1,2}\s*$/.test(p)) return true;
  return false;
}

/**
 * Merge OCR-broken rows: "FR 03" + "7 JFK-LHR …" → one string.
 */
export function mergeFlicaScreenshotSplitRows(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let cur = lines[i]!.replace(/\s+/g, ' ').trim();
    if (!cur) continue;
    if (lineLooksLikeTableHeader(cur)) continue;
    while (i + 1 < lines.length && shouldMergeWithNextForScreenshot(cur, lines[i + 1]!)) {
      const nxt = lines[i + 1]!.replace(/\s+/g, ' ').trim();
      if (!nxt || lineLooksLikeTableHeader(nxt)) break;
      i++;
      cur = `${cur} ${nxt}`.replace(/\s+/g, ' ').trim();
    }
    out.push(cur);
  }
  return out;
}

/**
 * Build reconstruction metadata + normalized line for each segment-shaped OCR line.
 */
export function reconstructFlicaScreenshotSegmentRows(lines: string[]): FlicaReconstructedSegmentInput[] {
  const merged = mergeFlicaScreenshotSplitRows(lines);
  const out: FlicaReconstructedSegmentInput[] = [];
  for (const raw of merged) {
    if (extractStationPairs(raw).length === 0) continue;
    const normalizedLine = raw.replace(/\s+/g, ' ').trim();
    const { best, all, confidence } = extractFltnoCandidatesFromRow(normalizedLine);
    const source: 'reconstructed_row' | 'ambiguous' = all.length > 1 && confidence < 0.85 ? 'ambiguous' : 'reconstructed_row';
    out.push({
      normalizedLine,
      reconstructedRowText: normalizedLine,
      candidateFlightNumbers: all.length ? all : best ? [best] : [],
      fltnoConfidence: confidence,
      fltnoSuggestionSource: source,
    });
  }
  return out;
}
