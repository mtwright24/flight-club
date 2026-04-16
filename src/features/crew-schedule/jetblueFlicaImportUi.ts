/**
 * Display helpers for JetBlue FLICA import review (user-facing, non-technical).
 * Visual tokens are derived from `scheduleTheme` so cards/typography/accent stay aligned with the schedule UI.
 */

import {
  buildRouteSummaryFromDuties,
  formatTripCompactFromDashChain,
  formatTripCompactShorthand,
} from './jetblueFlicaImport';
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

/** Compact trip line: layover pattern + return base (spaced IATA codes). Prefer this on list/tile cards. */
export function formatTripCompactShorthandDisplay(
  legs: Pick<SchedulePairingDutyRow, 'from_airport' | 'to_airport' | 'duty_date'>[],
  baseCode: string | null | undefined
): string {
  return formatTripCompactShorthand(legs, baseCode);
}

export { formatTripCompactFromDashChain };

/** Full leg chain with arrows — expanded pairing editor / duty detail only. */
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

/** List + detail: “Looks good” unless required fields are missing (soft parser flags do not flip the label). */
export function pairingCardPrimaryLabel(v: ValidationSnapshot): { label: string; severity: 'good' | 'missing' | 'review' } {
  if (v.badge === 'good') return { label: 'Looks good', severity: 'good' };
  return { label: 'Needs attention', severity: 'missing' };
}

/** Second line on list cards — only missing required (not soft review counts). */
export function pairingCardAttentionSubtext(v: ValidationSnapshot): string | null {
  if (v.badge === 'good') return null;
  const m = v.counts.missing;
  if (m > 0) return `${m} required field${m === 1 ? '' : 's'} missing`;
  return null;
}

function footline(fs: { reasonDisplay?: string; helper?: string } | undefined): string | null {
  if (!fs) return null;
  const d = fs.reasonDisplay?.trim();
  const h = fs.helper?.trim();
  const t = (d || h || '').trim();
  return t ? shorten(t) : null;
}

/** One short line for card footer when required fields are missing. */
export function pairingCardFootnote(v: ValidationSnapshot): string | null {
  if (v.badge === 'good') return null;
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
  return null;
}

function shorten(s: string, max = 52): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
