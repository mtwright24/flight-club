/**
 * JetBlue FA FLICA monthly detailed list — template detection + confidence (v1).
 * Pairing = Base-to-Base sequence per IFC CBA; footprints / OSP / RIG stored separately in DB.
 *
 * OCR anchors below (including DHC in column-header patterns) exist only to recognize FLICA-shaped
 * screenshots. Do not use obsolete JetBlue fields (TACLAG, GRNT, DHC) for operational logic — see
 * `jetblueFlicaUnderstanding.ts`. OAEQP / OEQP are equipment metadata signals.
 */

import {
  JETBLUE_FLICA_EQUIPMENT_FIELD_CODES,
  JETBLUE_FLICA_OBSOLETE_FIELD_CODES,
} from './jetblueFlicaUnderstanding';

export const JETBLUE_FLICA_TEMPLATE_KEY = 'jetblue_fa_flica_month_detail' as const;

/** Re-export for callers that classify OCR without importing the full understanding module. */
export { JETBLUE_FLICA_OBSOLETE_FIELD_CODES, JETBLUE_FLICA_EQUIPMENT_FIELD_CODES };

export type ConfidenceBand = 'high' | 'medium' | 'low';

/** 0–1 thresholds: high ≥ 0.85, medium 0.60–0.84, low < 0.60 */
export function confidenceBand(score: number | null | undefined): ConfidenceBand {
  if (score == null || Number.isNaN(score)) return 'low';
  if (score >= 0.85) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
}

export function shouldFlagReview(score: number | null | undefined): boolean {
  return confidenceBand(score) === 'low';
}

/** OCR text anchors for jetblue.flica.net month-detail screenshots (not exhaustive). */
export const FLICA_TEMPLATE_ANCHORS = [
  /\bjet\s*blue\b/i,
  /\bflica\b/i,
  /\bschedule\b/i,
  /\b(april|may|june|july|august|september|october|november|december|january|february|march)\b/i,
  /\b(DY|DD|DHC|FLT|DEPL|ARRL|BLKT|TBLK|TCRD|TDHD|TDUTY)\b/i,
  /\b(BSE|REPT|OAEQP|OEQP)\b/i,
] as const;

/**
 * Score 0–1: how likely this OCR text is JetBlue FLICA month-detail template.
 * Does not parse pairings — only classification signal for processing screen.
 */
export function scoreJetBlueFlicaTemplateMatch(ocrText: string): number {
  const t = ocrText || '';
  if (t.length < 80) return 0.2;
  let hits = 0;
  for (const re of FLICA_TEMPLATE_ANCHORS) {
    if (re.test(t)) hits += 1;
  }
  const j = /\bjet\s*blue\b/i.test(t) ? 1 : 0;
  const f = /\bflica\b/i.test(t) ? 1 : 0;
  const base = Math.min(1, hits / FLICA_TEMPLATE_ANCHORS.length + 0.15 * (j + f));
  return Math.round(base * 100) / 100;
}
