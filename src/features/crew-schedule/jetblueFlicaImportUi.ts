/**
 * Display helpers for JetBlue FLICA import review (user-facing, non-technical).
 * Visual tokens are derived from `scheduleTheme` so cards/typography/accent stay aligned with the schedule UI.
 */

import { buildRouteSummaryFromDuties } from './jetblueFlicaImport';
import type { SchedulePairingDutyRow } from './jetblueFlicaImport';
import type { PairingFieldKey, PairingImportValidation } from './jetblueFlicaImportValidation';
import { scheduleTheme as T } from './scheduleTheme';

/** Import-review palette: surfaces + text from schedule theme; semantic status colors from `T.importReview`. */
export const FC = {
  pageBg: T.importReview.pageBg,
  card: T.surface,
  text: T.text,
  textMuted: T.textSecondary,
  textSubtle: T.importReview.textSubtle,
  border: T.line,
  accent: T.accent,
  good: T.importReview.good,
  goodBg: T.importReview.goodBg,
  warn: T.importReview.warn,
  warnBg: T.importReview.warnBg,
  bad: T.importReview.bad,
  badBg: T.importReview.badBg,
} as const;

const PAIRING_FIELD_ORDER: PairingFieldKey[] = [
  'pairing_id',
  'operate_start_date',
  'operate_end_date',
  'report_time_local',
  'base_code',
];

/** Route: JFK-LAX-SFO as JFK → LAX → SFO (deduped chain from legs). */
export function formatTripRouteArrows(legs: Pick<SchedulePairingDutyRow, 'from_airport' | 'to_airport'>[]): string {
  const dash = buildRouteSummaryFromDuties(legs);
  if (dash === '—') return '—';
  return dash.split('-').join(' → ');
}

/** Apr 14 – Apr 17, 2026 */
export function formatDateRangeDisplay(startIso: string | null | undefined, endIso: string | null | undefined): string {
  const a = (startIso ?? '').trim();
  const b = (endIso ?? '').trim();
  if (!a && !b) return '—';
  if (!b || a === b) {
    if (!a) return '—';
    return formatOne(a);
  }
  return `${formatOne(a)} – ${formatOne(b)}`;
}

function formatOne(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number);
  if (!y || !mo || !d) return iso;
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export type ValidationSnapshot = PairingImportValidation;

/** List + detail: single rule — good vs any attention; severity distinguishes missing vs review-only. */
export function pairingCardPrimaryLabel(v: ValidationSnapshot): { label: string; severity: 'good' | 'missing' | 'review' } {
  if (v.badge === 'good') return { label: 'Looks good', severity: 'good' };
  if (v.badge === 'missing_info') return { label: 'Needs attention', severity: 'missing' };
  return { label: 'Needs attention', severity: 'review' };
}

/** Second line on list cards — required missing vs fields that need review. */
export function pairingCardAttentionSubtext(v: ValidationSnapshot): string | null {
  if (v.badge === 'good') return null;
  const m = v.counts.missing;
  const r = v.counts.review;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} required field${m === 1 ? '' : 's'} missing`);
  if (r > 0) parts.push(`${r} field${r === 1 ? '' : 's'} need review`);
  return parts.length ? parts.join(' · ') : null;
}

function footline(fs: { reasonDisplay?: string; helper?: string } | undefined): string | null {
  if (!fs) return null;
  const d = fs.reasonDisplay?.trim();
  const h = fs.helper?.trim();
  const t = (d || h || '').trim();
  return t ? shorten(t) : null;
}

/** One short line for card footer when not “Looks good”. */
export function pairingCardFootnote(v: ValidationSnapshot): string | null {
  for (const key of PAIRING_FIELD_ORDER) {
    const f = v.pairingFields[key];
    if (f?.state === 'missing_required') {
      return footline(f) ?? shorten('Required field missing');
    }
  }
  for (const leg of Object.values(v.legFields)) {
    if (!leg) continue;
    for (const fs of Object.values(leg)) {
      if (fs?.state === 'missing_required') {
        const line = footline(fs);
        if (line) return line;
      }
    }
  }
  for (const key of PAIRING_FIELD_ORDER) {
    const f = v.pairingFields[key];
    if (f?.state === 'needs_review') {
      const line = footline(f);
      if (line) return line;
    }
  }
  for (const leg of Object.values(v.legFields)) {
    if (!leg) continue;
    for (const fs of Object.values(leg)) {
      if (fs?.state === 'needs_review') {
        const line = footline(fs);
        if (line) return line;
      }
    }
  }
  if (v.badge === 'needs_review') return 'Some details need review';
  return null;
}

function shorten(s: string, max = 52): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
