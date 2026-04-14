/**
 * JetBlue FLICA pairing / leg field validation for import review and pairing editor.
 * States: good | needs_review | missing_required
 */

import type { SchedulePairingDutyRow, SchedulePairingRow } from './jetblueFlicaImport';
import type { StoredImportReviewIssue } from './jetblueFlicaImportReviewIssues';
import { DEFAULT_REASON_COPY, type ValidationReasonCode } from './jetblueFlicaImportReasonCopy';

export type FieldReviewState = 'good' | 'needs_review' | 'missing_required';

export type { ValidationReasonCode };

export type FieldCandidate = { value: string; label?: string };

export type FieldStatus = {
  state: FieldReviewState;
  /** Short line under the label (legacy + list cards). */
  helper?: string;
  reasonCode?: ValidationReasonCode;
  /** Plain-English explanation for the review-assist panel. */
  reasonDisplay?: string;
  /** Quick-fix chips; first option is usually the best guess from context. */
  candidates?: FieldCandidate[];
};

export type PairingImportBadge = 'good' | 'needs_review' | 'missing_info';

export type PairingFieldKey =
  | 'pairing_id'
  | 'operate_start_date'
  | 'operate_end_date'
  | 'report_time_local'
  | 'base_code';

export type LegFieldKey =
  | 'duty_date'
  | 'flight_number'
  | 'from_airport'
  | 'to_airport'
  | 'departure_time_local'
  | 'arrival_time_local'
  | 'release_time_local'
  | 'layover_city';

/** Stable iteration order — also used for issue lists and sweep counts. */
export const PAIRING_FIELD_KEYS: PairingFieldKey[] = [
  'pairing_id',
  'operate_start_date',
  'operate_end_date',
  'report_time_local',
  'base_code',
];

export const LEG_FIELD_KEYS: LegFieldKey[] = [
  'duty_date',
  'flight_number',
  'from_airport',
  'to_airport',
  'departure_time_local',
  'arrival_time_local',
  'release_time_local',
  'layover_city',
];

const SEVERITY: Record<FieldReviewState, number> = {
  missing_required: 3,
  needs_review: 2,
  good: 1,
};

/** Merge two field states so the more severe issue wins; combines copy when both are `needs_review`. */
export function mergeFieldWorst(base: FieldStatus | undefined, overlay: FieldStatus): FieldStatus {
  const b = base ?? { state: 'good' as const };
  if (SEVERITY[overlay.state] > SEVERITY[b.state]) return { ...b, ...overlay, state: overlay.state };
  if (SEVERITY[b.state] > SEVERITY[overlay.state]) return b;
  if (b.state === 'needs_review' && overlay.state === 'needs_review') {
    return {
      ...b,
      ...overlay,
      state: 'needs_review',
      helper: overlay.helper ?? b.helper,
      reasonDisplay: overlay.reasonDisplay ?? b.reasonDisplay,
      reasonCode: overlay.reasonCode ?? b.reasonCode,
      candidates: overlay.candidates ?? b.candidates,
    };
  }
  return b;
}

function worst(a: FieldReviewState, b: FieldReviewState): FieldReviewState {
  const rank = { missing_required: 3, needs_review: 2, good: 1 } as const;
  return rank[a] >= rank[b] ? a : b;
}

function empty(s: string | null | undefined): boolean {
  return !String(s ?? '').trim();
}

const OCR_STATION_TYPO = new Set(['JHR', 'SFOX', 'LAXX']); // common OCR slips; expandable

/** Likely corrections for known suspicious 3-letter codes (context-free heuristic). */
function suspiciousStationCandidates(code: string): FieldCandidate[] | undefined {
  const fix: Record<string, string> = { JHR: 'LHR', SFOX: 'SFO', LAXX: 'LAX' };
  const v = fix[code];
  if (v) {
    return [
      { value: v, label: `Use ${v}` },
      { value: code, label: `Keep ${code}` },
    ];
  }
  return undefined;
}

function stationField(raw: string | null | undefined, label: string): FieldStatus {
  const c = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!c) {
    return {
      state: 'missing_required',
      helper: `${label} required`,
      reasonCode: 'required_for_save',
      reasonDisplay: DEFAULT_REASON_COPY.required_for_save,
    };
  }
  if (!/^[A-Z]{3}$/.test(c)) {
    return {
      state: 'needs_review',
      helper: 'Use a 3-letter code',
      reasonCode: 'low_confidence_match',
      reasonDisplay: 'Use a standard 3-letter airport code.',
    };
  }
  if (OCR_STATION_TYPO.has(c)) {
    const cands = suspiciousStationCandidates(c);
    return {
      state: 'needs_review',
      helper: 'This code may be a mistake',
      reasonCode: 'suspicious_code',
      reasonDisplay:
        c === 'JHR'
          ? 'We read JHR, but this may be LHR based on the route and layover context.'
          : DEFAULT_REASON_COPY.suspicious_code,
      candidates: cands,
    };
  }
  return { state: 'good' };
}

function isoDateLooksValid(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return false;
  const t = Date.parse(`${iso.trim()}T12:00:00`);
  return !Number.isNaN(t);
}

function maxDutyDate(legs: SchedulePairingDutyRow[]): string | null {
  const dates = legs.map((l) => l.duty_date).filter((d): d is string => !!d?.trim());
  if (!dates.length) return null;
  return [...dates].sort((a, b) => a.localeCompare(b))[dates.length - 1]!;
}

function isPairingFieldKey(s: string): s is PairingFieldKey {
  return (PAIRING_FIELD_KEYS as readonly string[]).includes(s);
}

/** Merge persisted PDF/OCR review hints (`normalized_json.import_review_issues`) into live field states. */
function applyStoredImportReviewIssues(
  pairingFields: Record<PairingFieldKey, FieldStatus>,
  legFields: Record<string, Partial<Record<LegFieldKey, FieldStatus>>>,
  legs: SchedulePairingDutyRow[],
  normalizedJson: Record<string, unknown> | null | undefined
): void {
  const raw = normalizedJson?.import_review_issues;
  if (!raw || !Array.isArray(raw)) return;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const is = item as StoredImportReviewIssue;
    if (is.validation_state !== 'needs_review') continue;
    const overlay: FieldStatus = {
      state: 'needs_review',
      reasonCode: is.reason_code,
      reasonDisplay: is.reason_display,
      candidates: is.candidates,
    };
    const fk = String(is.field_key ?? '');
    if (fk.startsWith('leg:')) {
      const sub = fk.slice(4) as LegFieldKey;
      if (!(LEG_FIELD_KEYS as readonly string[]).includes(sub)) continue;
      const iso = (is.duty_date_iso ?? '').trim();
      if (!iso) continue;
      const dayLegs = legs
        .filter((l) => (l.duty_date ?? '').trim() === iso)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const target = sub === 'layover_city' ? dayLegs[dayLegs.length - 1] : dayLegs[0];
      if (!target) continue;
      const lf = { ...(legFields[target.id] ?? {}) };
      lf[sub] = mergeFieldWorst(lf[sub], overlay);
      legFields[target.id] = lf;
    } else if (isPairingFieldKey(fk)) {
      pairingFields[fk] = mergeFieldWorst(pairingFields[fk], overlay);
    }
  }
}

function routeHasDuplicateSegments(legs: SchedulePairingDutyRow[]): boolean {
  const segs: string[] = [];
  for (const l of legs) {
    const a = (l.from_airport ?? '').trim().toUpperCase();
    const b = (l.to_airport ?? '').trim().toUpperCase();
    if (a && b) segs.push(`${a}-${b}`);
  }
  const seen = new Set<string>();
  for (const s of segs) {
    if (seen.has(s)) return true;
    seen.add(s);
  }
  return false;
}

/**
 * Single source of truth for counts + badge: derived only from field row states.
 */
function sweepPairingFieldStates(
  pairingFields: Record<PairingFieldKey, FieldStatus>,
  legFields: Record<string, Partial<Record<LegFieldKey, FieldStatus>>>
): { missing: number; review: number; badge: PairingImportBadge } {
  let missing = 0;
  let review = 0;
  for (const k of PAIRING_FIELD_KEYS) {
    const s = pairingFields[k]?.state;
    if (s === 'missing_required') missing += 1;
    else if (s === 'needs_review') review += 1;
  }
  for (const lid of Object.keys(legFields)) {
    const lf = legFields[lid];
    if (!lf) continue;
    for (const fk of LEG_FIELD_KEYS) {
      const st = lf[fk]?.state;
      if (st === 'missing_required') missing += 1;
      else if (st === 'needs_review') review += 1;
    }
  }
  const badge: PairingImportBadge =
    missing > 0 ? 'missing_info' : review > 0 ? 'needs_review' : 'good';
  return { missing, review, badge };
}

export type PairingValidationSnapshot = {
  pairing_id: string;
  operate_start_date: string;
  operate_end_date: string;
  report_time_local: string;
  base_code: string;
};

/**
 * Full validation for one pairing + legs (DB snapshot or live editor strings).
 */
export function validateJetBluePairingImport(
  snap: PairingValidationSnapshot,
  legs: SchedulePairingDutyRow[],
  pairingRow?: SchedulePairingRow | null
): {
  pairingFields: Record<PairingFieldKey, FieldStatus>;
  legFields: Record<string, Partial<Record<LegFieldKey, FieldStatus>>>;
  badge: PairingImportBadge;
  counts: { missing: number; review: number };
  firstMissing?: { scope: 'pairing' | 'leg'; key: PairingFieldKey | LegFieldKey; legId?: string };
} {
  const pairingFields = {} as Record<PairingFieldKey, FieldStatus>;
  const legFields: Record<string, Partial<Record<LegFieldKey, FieldStatus>>> = {};

  // — pairing_id
  if (empty(snap.pairing_id)) {
    pairingFields.pairing_id = {
      state: 'missing_required',
      helper: 'Pairing ID required',
      reasonCode: 'required_for_save',
      reasonDisplay: 'Add the pairing code from the header — it’s required before saving.',
    };
  } else {
    pairingFields.pairing_id = { state: 'good' };
  }

  // — dates
  if (empty(snap.operate_start_date)) {
    pairingFields.operate_start_date = {
      state: 'missing_required',
      helper: 'Start date required',
      reasonCode: 'required_for_save',
      reasonDisplay: 'We need the trip start date before this can be saved.',
    };
  } else if (!isoDateLooksValid(snap.operate_start_date.trim())) {
    pairingFields.operate_start_date = {
      state: 'needs_review',
      helper: 'Check date format',
      reasonCode: 'low_confidence_match',
      reasonDisplay: 'Use the calendar date in YYYY-MM-DD format.',
    };
  } else {
    pairingFields.operate_start_date = { state: 'good' };
  }

  const hasLegs = legs.length > 0;
  if (hasLegs) {
    if (empty(snap.operate_end_date)) {
      pairingFields.operate_end_date = {
        state: 'missing_required',
        helper: 'Operate end required when legs are present',
      };
    } else if (!isoDateLooksValid(snap.operate_end_date.trim())) {
      pairingFields.operate_end_date = { state: 'needs_review', helper: 'Use YYYY-MM-DD' };
    } else {
      const lastDuty = maxDutyDate(legs);
      const endIso = snap.operate_end_date.trim();
      if (lastDuty && lastDuty.localeCompare(endIso) > 0) {
        pairingFields.operate_end_date = {
          state: 'needs_review',
          helper: 'Last duty day is after operate end — check dates',
        };
      } else {
        pairingFields.operate_end_date = { state: 'good' };
      }
    }
  } else {
    pairingFields.operate_end_date = empty(snap.operate_end_date)
      ? { state: 'needs_review', helper: 'No legs yet — add legs or set operate end from screenshot' }
      : isoDateLooksValid(snap.operate_end_date.trim())
        ? { state: 'good' }
        : { state: 'needs_review', helper: 'Use YYYY-MM-DD' };
  }

  // — report
  if (hasLegs && empty(snap.report_time_local)) {
    pairingFields.report_time_local = {
      state: 'missing_required',
      helper: 'Report time required',
      reasonCode: 'required_for_save',
      reasonDisplay: DEFAULT_REASON_COPY.required_for_save,
    };
  } else if (!empty(snap.report_time_local) && !/\d/.test(snap.report_time_local)) {
    pairingFields.report_time_local = {
      state: 'needs_review',
      helper: 'Check time format',
      reasonCode: 'unreadable',
      reasonDisplay: 'Enter report time using numbers (for example 0930 or 09:30).',
    };
  } else {
    pairingFields.report_time_local = empty(snap.report_time_local)
      ? {
          state: 'needs_review',
          helper: 'Add report time if shown',
          reasonCode: 'not_visible',
          reasonDisplay: 'We could not read report time clearly — add it from the pairing header if you see it.',
        }
      : { state: 'good' };
  }

  // — base
  const firstFrom = legs[0]?.from_airport?.trim().toUpperCase() ?? '';
  if (empty(snap.base_code)) {
    if (firstFrom) {
      pairingFields.base_code = {
        state: 'needs_review',
        helper: 'Base may match first departure',
        reasonCode: 'inferred_value',
        reasonDisplay:
          'We could not read the base clearly from the header. Your first departure is often your base — confirm or edit.',
        candidates: [{ value: firstFrom, label: `Use ${firstFrom} (first departure)` }],
      };
    } else {
      pairingFields.base_code = {
        state: 'needs_review',
        helper: 'Base not detected',
        reasonCode: 'not_visible',
        reasonDisplay:
          'We could not read the base from the pairing header. Enter your base — it’s needed to save reliably.',
      };
    }
  } else {
    pairingFields.base_code = stationField(snap.base_code, 'Base');
  }

  if (hasLegs && routeHasDuplicateSegments(legs)) {
    const oe = pairingFields.operate_end_date;
    pairingFields.operate_end_date = {
      state: worst(oe.state, 'needs_review'),
      helper:
        oe.state !== 'good' && oe.helper
          ? `${oe.helper} · Also check duplicate route segment`
          : 'Duplicate route segment — verify legs',
      reasonCode: 'conflicting_context',
      reasonDisplay: 'Two legs show the same city pair — remove a duplicate line or fix station codes.',
    };
  }

  // — legs
  const byDuty = new Map<string, SchedulePairingDutyRow[]>();
  for (const l of legs) {
    const k = l.duty_date ?? '';
    const arr = byDuty.get(k) ?? [];
    arr.push(l);
    byDuty.set(k, arr);
  }

  for (const leg of legs) {
    const lf: Partial<Record<LegFieldKey, FieldStatus>> = {};
    const dutyKey = leg.duty_date ?? '';
    const group = byDuty.get(dutyKey) ?? [];
    const lastInDay =
      group.length > 0 && group[group.length - 1]?.id === leg.id;

    if (empty(leg.duty_date)) {
      lf.duty_date = {
        state: 'missing_required',
        helper: 'Duty date required',
        reasonCode: 'required_for_save',
        reasonDisplay: 'Each leg needs a duty date before saving.',
      };
    } else if (!isoDateLooksValid(String(leg.duty_date).trim())) {
      lf.duty_date = {
        state: 'needs_review',
        helper: 'Check date format',
        reasonCode: 'low_confidence_match',
        reasonDisplay: 'Use the calendar date in YYYY-MM-DD format.',
      };
    } else {
      lf.duty_date = { state: 'good' };
    }

    if (empty(leg.flight_number)) {
      lf.flight_number = {
        state: 'missing_required',
        helper: 'Flight number required',
        reasonCode: 'required_for_save',
        reasonDisplay:
          'We found the route and times, but could not confidently read the flight number. Enter it from the pairing line.',
      };
    } else {
      lf.flight_number = { state: 'good' };
    }

    const fromSt = stationField(leg.from_airport, 'Departure');
    const toSt = stationField(leg.to_airport, 'Arrival');
    lf.from_airport = fromSt;
    lf.to_airport = toSt;

    if (empty(leg.departure_time_local) && empty(leg.arrival_time_local)) {
      lf.departure_time_local = {
        state: 'needs_review',
        helper: 'Times missing',
        reasonCode: 'unreadable',
        reasonDisplay: DEFAULT_REASON_COPY.unreadable,
      };
      lf.arrival_time_local = {
        state: 'needs_review',
        helper: 'Times missing',
        reasonCode: 'unreadable',
        reasonDisplay: DEFAULT_REASON_COPY.unreadable,
      };
    } else {
      if (empty(leg.departure_time_local)) {
        lf.departure_time_local = {
          state: 'needs_review',
          helper: 'Depart time missing',
          reasonCode: 'not_visible',
          reasonDisplay: 'We could not read departure time — add it if it appears on the line.',
        };
      } else {
        lf.departure_time_local = { state: 'good' };
      }
      if (empty(leg.arrival_time_local)) {
        lf.arrival_time_local = {
          state: 'needs_review',
          helper: 'Arrive time missing',
          reasonCode: 'not_visible',
          reasonDisplay: 'We could not read arrival time — add it if it appears on the line.',
        };
      } else {
        lf.arrival_time_local = { state: 'good' };
      }
    }

    if (lastInDay) {
      const lastLegOfDay = group[group.length - 1];
      const ddmeta = lastLegOfDay?.duty_day as { d_end_local?: string; layover_rest_display?: string } | undefined;
      const dEndHint = (ddmeta?.d_end_local as string | undefined)?.trim() || null;
      if (empty(leg.release_time_local)) {
        lf.release_time_local = {
          state: 'needs_review',
          helper: 'Release / D-END missing',
          reasonCode: 'not_visible',
          reasonDisplay:
            'On the last leg of a duty day we usually need release (D-END). If you see it in the duty block below the legs, tap a suggestion or enter it manually.',
          candidates: dEndHint ? [{ value: dEndHint, label: `Use ${dEndHint} (from duty block)` }] : undefined,
        };
      } else {
        lf.release_time_local = { state: 'good' };
      }
      const layRest = (ddmeta?.layover_rest_display as string | undefined)?.trim() ?? '';
      if (layRest && empty(leg.layover_city)) {
        lf.layover_city = {
          state: 'needs_review',
          helper: 'Layover city unclear',
          reasonCode: 'not_visible',
          reasonDisplay:
            'Layover rest or hotel timing appears in this duty block, but the layover city did not parse — add the station if your pairing line shows one.',
        };
      } else {
        lf.layover_city = { state: 'good' };
      }
    } else {
      lf.layover_city = { state: 'good' };
    }

    if (leg.requires_review || (leg.row_confidence != null && leg.row_confidence < 0.65)) {
      const overlay: FieldStatus = {
        state: 'needs_review',
        reasonCode: 'low_confidence_match',
        reasonDisplay:
          leg.requires_review === true
            ? 'This leg was flagged for review — confirm flight number, stations, and times against your pairing line.'
            : `Parser confidence on this leg is ${Math.round((leg.row_confidence ?? 0) * 100)}% — confirm all values.`,
      };
      lf.flight_number = mergeFieldWorst(lf.flight_number, overlay);
    }

    legFields[leg.id] = lf;
  }

  // Merge meta-level flags into concrete field rows (counts roll up with the same sweep).
  if (pairingRow?.pairing_requires_review || pairingRow?.needs_review) {
    pairingFields.pairing_id = mergeFieldWorst(pairingFields.pairing_id, {
      state: 'needs_review',
      reasonCode: 'low_confidence_match',
      reasonDisplay:
        'This pairing was flagged for review during import — double-check the pairing ID and header details.',
    });
  }
  if (pairingRow?.pairing_confidence != null && pairingRow.pairing_confidence < 0.72) {
    pairingFields.operate_start_date = mergeFieldWorst(pairingFields.operate_start_date, {
      state: 'needs_review',
      reasonCode: 'low_confidence_match',
      reasonDisplay: `Parser confidence on the trip header is ${Math.round(pairingRow.pairing_confidence * 100)}% — confirm start date and trip block.`,
    });
  }

  applyStoredImportReviewIssues(
    pairingFields,
    legFields,
    legs,
    (pairingRow?.normalized_json ?? null) as Record<string, unknown> | null | undefined
  );

  // If the row is still globally flagged but nothing surfaced to a field, attach a single explainable row.
  const preSweep = sweepPairingFieldStates(pairingFields, legFields);
  if (
    (pairingRow?.needs_review || pairingRow?.pairing_requires_review) &&
    preSweep.review === 0 &&
    preSweep.missing === 0
  ) {
    pairingFields.report_time_local = mergeFieldWorst(pairingFields.report_time_local, {
      state: 'needs_review',
      reasonCode: 'low_confidence_match',
      reasonDisplay:
        'This pairing was marked for review — confirm report time, base, operate dates, and each leg against your PDF.',
    });
  }

  const { missing, review, badge } = sweepPairingFieldStates(pairingFields, legFields);

  // first missing for focus order
  const pairingOrder: PairingFieldKey[] = [
    'pairing_id',
    'operate_start_date',
    'operate_end_date',
    'report_time_local',
    'base_code',
  ];
  let firstMissing: { scope: 'pairing' | 'leg'; key: PairingFieldKey | LegFieldKey; legId?: string } | undefined;
  for (const key of pairingOrder) {
    if (pairingFields[key]?.state === 'missing_required') {
      firstMissing = { scope: 'pairing', key };
      break;
    }
  }
  if (!firstMissing) {
    for (const leg of legs) {
      const lf = legFields[leg.id];
      if (!lf) continue;
      const order: LegFieldKey[] = [
        'duty_date',
        'flight_number',
        'from_airport',
        'to_airport',
        'departure_time_local',
        'arrival_time_local',
        'release_time_local',
        'layover_city',
      ];
      for (const key of order) {
        if (lf[key]?.state === 'missing_required') {
          firstMissing = { scope: 'leg', key, legId: leg.id };
          break;
        }
      }
      if (firstMissing) break;
    }
  }

  return {
    pairingFields,
    legFields,
    badge,
    counts: { missing, review },
    firstMissing,
  };
}

function formatShortDutyDate(iso: string | null | undefined): string {
  const s = String(iso ?? '').trim();
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || 'this day';
  const [y, mo, d] = s.split('-').map(Number);
  if (!y || !mo || !d) return s;
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function pairingIssueFieldLabel(key: PairingFieldKey): string {
  switch (key) {
    case 'pairing_id':
      return 'Pairing ID';
    case 'operate_start_date':
      return 'Start date';
    case 'operate_end_date':
      return 'End date';
    case 'report_time_local':
      return 'Report time';
    case 'base_code':
      return 'Base';
    default:
      return key;
  }
}

function legIssueFieldLabel(key: LegFieldKey): string {
  switch (key) {
    case 'duty_date':
      return 'Duty date';
    case 'flight_number':
      return 'Flight number';
    case 'from_airport':
      return 'Departure airport';
    case 'to_airport':
      return 'Arrival airport';
    case 'departure_time_local':
      return 'Depart time';
    case 'arrival_time_local':
      return 'Arrive time';
    case 'release_time_local':
      return 'Release / D-END';
    case 'layover_city':
      return 'Layover city';
    default:
      return key;
  }
}

export type PairingIssueNav =
  | { scope: 'pairing'; pairingKey: PairingFieldKey }
  | { scope: 'leg'; legId: string; legFieldKey: LegFieldKey };

export type PairingIssueItem = {
  id: string;
  kind: 'missing_required' | 'needs_review';
  label: string;
  /** Short “why” from `reasonDisplay` / helper when present. */
  detail?: string;
  nav: PairingIssueNav;
};

function issueDetailLine(fs: FieldStatus | undefined): string | undefined {
  if (!fs) return undefined;
  const d = fs.reasonDisplay?.trim();
  const h = fs.helper?.trim();
  const t = (d || h || '').trim();
  return t || undefined;
}

/**
 * Actionable issue rows for pairing detail (missing required first, then needs review).
 */
export function enumeratePairingIssues(
  legs: SchedulePairingDutyRow[],
  pairingFields: Record<PairingFieldKey, FieldStatus>,
  legFields: Record<string, Partial<Record<LegFieldKey, FieldStatus>>>
): PairingIssueItem[] {
  const miss: PairingIssueItem[] = [];
  const rev: PairingIssueItem[] = [];

  const sortedLegs = [...legs].sort((a, b) => {
    const da = (a.duty_date ?? '').localeCompare(b.duty_date ?? '');
    if (da !== 0) return da;
    return String(a.id).localeCompare(String(b.id));
  });
  const legOrdinal = new Map<string, number>();
  sortedLegs.forEach((leg, i) => legOrdinal.set(leg.id, i + 1));

  const pushPairing = (key: PairingFieldKey, fs: FieldStatus | undefined) => {
    if (!fs || fs.state === 'good') return;
    const labelBase = pairingIssueFieldLabel(key);
    const missW = fs.state === 'missing_required' ? 'missing' : 'needs review';
    const item: PairingIssueItem = {
      id: `p:${key}:${fs.state}`,
      kind: fs.state === 'missing_required' ? 'missing_required' : 'needs_review',
      label: `${labelBase} ${missW}`,
      detail: issueDetailLine(fs),
      nav: { scope: 'pairing', pairingKey: key },
    };
    if (fs.state === 'missing_required') miss.push(item);
    else rev.push(item);
  };

  for (const pk of PAIRING_FIELD_KEYS) {
    pushPairing(pk, pairingFields[pk]);
  }

  for (const leg of sortedLegs) {
    const lf = legFields[leg.id];
    if (!lf) continue;
    const ord = legOrdinal.get(leg.id) ?? 1;
    const dayLabel = formatShortDutyDate(leg.duty_date);
    for (const fk of LEG_FIELD_KEYS) {
      const fs = lf[fk];
      if (!fs || fs.state === 'good') continue;
      const labelBase = legIssueFieldLabel(fk);
      const suf = `${dayLabel} (leg ${ord})`;
      const label =
        fs.state === 'missing_required'
          ? `${labelBase} missing on ${suf}`
          : `${labelBase} needs review on ${suf}`;
      const item: PairingIssueItem = {
        id: `l:${leg.id}:${fk}:${fs.state}`,
        kind: fs.state === 'missing_required' ? 'missing_required' : 'needs_review',
        label,
        detail: issueDetailLine(fs),
        nav: { scope: 'leg', legId: leg.id, legFieldKey: fk },
      };
      if (fs.state === 'missing_required') miss.push(item);
      else rev.push(item);
    }
  }

  return [...miss, ...rev];
}

export function snapshotFromPairingRow(p: SchedulePairingRow): PairingValidationSnapshot {
  return {
    pairing_id: p.pairing_id ?? '',
    operate_start_date: p.operate_start_date ?? '',
    operate_end_date: p.operate_end_date ?? '',
    report_time_local: p.report_time_local ?? '',
    base_code: p.base_code ?? '',
  };
}

export type PairingImportValidation = ReturnType<typeof validateJetBluePairingImport>;

export type BatchSaveGate =
  | { ok: true; needsReviewConfirm: boolean; reviewCount: number }
  | { ok: false; reason: 'missing'; message: string; pairingId?: string; pairingCodes: string[] };

/**
 * Validate all pairings in a batch before writing to calendar.
 */
export function evaluateBatchPairingSave(
  pairings: SchedulePairingRow[],
  legsByPairingId: Map<string, SchedulePairingDutyRow[]>
): BatchSaveGate {
  let anyReviewBadge = false;
  let anyMissing = false;
  let firstPairingId: string | undefined;
  let reviewCount = 0;
  const pairingCodesWithMissing: string[] = [];

  for (const p of pairings) {
    const legs = legsByPairingId.get(p.id) ?? [];
    const v = validateJetBluePairingImport(snapshotFromPairingRow(p), legs, p);
    if (v.counts.missing > 0) {
      anyMissing = true;
      firstPairingId = firstPairingId ?? p.id;
      const code = (p.pairing_id ?? '').trim() || p.id;
      pairingCodesWithMissing.push(code);
    }
    if (v.badge === 'needs_review') {
      anyReviewBadge = true;
    }
    reviewCount += v.counts.review;
  }

  if (anyMissing) {
    const unique = [...new Set(pairingCodesWithMissing)];
    const shown = unique.slice(0, 12);
    const list = shown.join(', ');
    const more = unique.length > shown.length ? ` (+${unique.length - shown.length} more)` : '';
    return {
      ok: false,
      reason: 'missing',
      message:
        `Complete required fields before saving. Pairings still missing data: ${list}${more}. Open each pairing from the list and fill highlighted fields.`,
      pairingId: firstPairingId,
      pairingCodes: unique,
    };
  }

  const needsReviewConfirm = anyReviewBadge || reviewCount > 0;
  return { ok: true, needsReviewConfirm, reviewCount };
}
