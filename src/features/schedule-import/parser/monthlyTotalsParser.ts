/**
 * Stage 2: monthly totals box (left column) — Block, Credit, YTD, Days Off.
 * TACLAG may appear in raw OCR; do not use for operational logic (store in raw_totals_json only).
 */

import { parseHhmmDurationMinutes } from './durationParsers';
import type { FieldConfidence, ParsedMonthlyTotalsDraft } from '../types';

const TBLK = /TBLK|BLOCK|total\s*block/i;
const TCRD = /TCRD|CREDIT|total\s*credit/i;
const YTD = /YTD/i;
const DAYS_OFF = /days?\s*off|DYOFF/i;

function fc(tier: FieldConfidence['tier'], score: number | null): FieldConfidence {
  return { tier, score, notes: null };
}

/**
 * Very loose line-based extraction — replace with structured block OCR when available.
 */
export function extractMonthlyTotalsFromLines(lines: string[]): ParsedMonthlyTotalsDraft {
  let blockMinutes: number | null = null;
  let creditMinutes: number | null = null;
  let ytdMinutes: number | null = null;
  let daysOff: number | null = null;
  const raw: Record<string, unknown> = {};

  for (const line of lines) {
    const u = line.toUpperCase();
    if (TBLK.test(line)) {
      const m = line.match(/\b(\d{2,4})\b/);
      if (m) blockMinutes = parseHhmmDurationMinutes(m[1]);
    }
    if (TCRD.test(line)) {
      const m = line.match(/\b(\d{2,4})\b/);
      if (m) creditMinutes = parseHhmmDurationMinutes(m[1]);
    }
    if (YTD.test(line)) {
      const m = line.match(/\b(\d{2,4})\b/);
      if (m) ytdMinutes = parseHhmmDurationMinutes(m[1]);
    }
    if (DAYS_OFF.test(line)) {
      const m = line.match(/\b(\d{1,2})\b/);
      if (m) daysOff = Number(m[1]);
    }
    if (/\bTACLAG\b/.test(u)) raw.taclag_line = line;
  }

  return {
    blockMinutes,
    creditMinutes,
    ytdMinutes,
    daysOff,
    rawTotalsJson: raw,
    confidence: fc('medium', 0.55),
  };
}
