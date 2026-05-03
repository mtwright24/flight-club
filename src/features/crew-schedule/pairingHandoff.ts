/**
 * Pairing tap/long-press handoff: resolve the best `CrewScheduleTrip` from the **same list that rendered**
 * the visible month. Missing base/stats is OK — UI shows dashes; never reject a visible pairing for that.
 */
import type { CrewScheduleTrip } from './types';

export type ScheduleVisibleMonth = { year: number; month: number };

function normCode(t: CrewScheduleTrip | null | undefined): string {
  return String(t?.pairingCode ?? '')
    .trim()
    .toUpperCase();
}

function pad2(m: number): string {
  return String(m).padStart(2, '0');
}

function monthWindowIso(y: number, mo: number): { first: string; last: string } {
  const first = `${y}-${pad2(mo)}-01`;
  const lastD = new Date(y, mo, 0).getDate();
  const last = `${y}-${pad2(mo)}-${pad2(lastD)}`;
  return { first, last };
}

function isoOk(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '').slice(0, 10));
}

/** Candidate overlaps calendar view month [first, last]. */
function overlapsVisibleMonth(t: CrewScheduleTrip, vy: number, vm: number): boolean {
  if (!isoOk(t.startDate) || !isoOk(t.endDate)) return false;
  const { first, last } = monthWindowIso(vy, vm);
  const ts = t.startDate.slice(0, 10);
  const te = t.endDate.slice(0, 10);
  return ts <= last && te >= first;
}

function dateInTripSpan(dateIso: string, t: CrewScheduleTrip): boolean {
  if (!isoOk(dateIso) || !isoOk(t.startDate) || !isoOk(t.endDate)) return false;
  const d = dateIso.slice(0, 10);
  return d >= t.startDate.slice(0, 10) && d <= t.endDate.slice(0, 10);
}

function sameVisibleMonthAnchor(t: CrewScheduleTrip, vy: number, vm: number): boolean {
  return t.year === vy && t.month === vm;
}

/** Calendar distance from anchor to nearest point in [start, end]. */
function anchorDistanceToSpan(anchor: string, t: CrewScheduleTrip): number {
  if (!isoOk(anchor) || !isoOk(t.startDate) || !isoOk(t.endDate)) return 99999;
  const d = anchor.slice(0, 10);
  const s = t.startDate.slice(0, 10);
  const e = t.endDate.slice(0, 10);
  if (d >= s && d <= e) return 0;
  if (d < s) return dayDiffApprox(d, s);
  return dayDiffApprox(d, e);
}

function dayDiffApprox(a: string, b: string): number {
  const t1 = Date.parse(`${a}T12:00:00`);
  const t2 = Date.parse(`${b}T12:00:00`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 9999;
  return Math.round(Math.abs(t1 - t2) / 86400000);
}

function hasMeaningfulRoute(t: CrewScheduleTrip): boolean {
  const r = (t.routeSummary ?? '').trim();
  if (r && r !== '—' && r !== '-' && r !== '–') return true;
  const sr = (t.summary?.route ?? '').trim();
  if (sr && sr !== '—' && sr !== '-') return true;
  return (t.legs ?? []).some((l) => String(l.departureAirport ?? '').trim() && String(l.arrivalAirport ?? '').trim());
}

/** Prefer richer objects when breaking ties (carryover / duplicate code). */
function handoffRichnessScore(t: CrewScheduleTrip): number {
  let s = 0;
  s += (t.legs?.length ?? 0) * 8;
  if (t.canonicalPairingDays) s += Object.keys(t.canonicalPairingDays).length * 6;
  const b = t.base?.trim();
  if (b && b !== '—' && b !== '-') s += 25;
  if (hasMeaningfulRoute(t)) s += 18;
  if (t.pairingBlockHours != null && t.pairingBlockHours > 0) s += 8;
  if (t.pairingCreditHours != null && t.pairingCreditHours > 0) s += 8;
  if (t.pairingTafbHours != null && t.pairingTafbHours > 0) s += 8;
  if ((t.crewMembers?.length ?? 0) > 0) s += 6;
  if (t.hotel?.name || t.hotel?.city) s += 4;
  return s;
}

export type VisibleTripHandoffMatchType =
  | 'exact_id'
  | 'code_date_in_span'
  | 'code_overlap_visible_month'
  | 'code_same_month_anchor'
  | 'code_visible_month_fallback'
  | 'none';

/**
 * Resolve handoff trip from the same merged month list that rendered classic/calendar.
 * `selectedDateIso`: classic row date or calendar cell (strongly recommended for multi-day pairings).
 */
export function resolveVisibleTripForHandoff(
  selected: CrewScheduleTrip,
  visibleTrips: CrewScheduleTrip[],
  visibleMonth: ScheduleVisibleMonth,
  selectedDateIso?: string | null,
): { trip: CrewScheduleTrip; matchType: VisibleTripHandoffMatchType } {
  const code = normCode(selected);
  const anchor =
    selectedDateIso && isoOk(selectedDateIso)
      ? selectedDateIso.slice(0, 10)
      : isoOk(selected.startDate)
        ? selected.startDate.slice(0, 10)
        : null;
  const vy = visibleMonth.year;
  const vm = visibleMonth.month;

  if (!visibleTrips.length) {
    return { trip: selected, matchType: 'none' };
  }

  const pickBest = (cands: CrewScheduleTrip[], matchType: VisibleTripHandoffMatchType): CrewScheduleTrip => {
    if (cands.length === 1) return cands[0]!;
    const withScore = cands.map((t) => ({
      t,
      dist: anchor ? anchorDistanceToSpan(anchor, t) : 0,
      score: handoffRichnessScore(t),
    }));
    withScore.sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : b.score - a.score));
    return withScore[0]!.t;
  };

  if (selected.id?.trim()) {
    const idHit = visibleTrips.filter((t) => t.id === selected.id);
    if (idHit.length) {
      const best = pickBest(idHit, 'exact_id');
      devCarryoverLogs(best, 'exact_id');
      return { trip: best, matchType: 'exact_id' };
    }
  }

  if (code) {
    const byCode = visibleTrips.filter((t) => normCode(t) === code);

    if (anchor && byCode.length) {
      const inSpan = byCode.filter((t) => dateInTripSpan(anchor, t));
      if (inSpan.length) {
        const best = pickBest(inSpan, 'code_date_in_span');
        devCarryoverLogs(best, 'code_date_in_span');
        return { trip: best, matchType: 'code_date_in_span' };
      }
    }

    if (byCode.length) {
      const ov = byCode.filter((t) => overlapsVisibleMonth(t, vy, vm));
      if (ov.length) {
        const best = pickBest(ov, 'code_overlap_visible_month');
        devCarryoverLogs(best, 'code_overlap_visible_month');
        return { trip: best, matchType: 'code_overlap_visible_month' };
      }

      const mo = byCode.filter((t) => sameVisibleMonthAnchor(t, vy, vm));
      if (mo.length) {
        const best = pickBest(mo, 'code_same_month_anchor');
        devCarryoverLogs(best, 'code_same_month_anchor');
        return { trip: best, matchType: 'code_same_month_anchor' };
      }

      const best = pickBest(byCode, 'code_visible_month_fallback');
      devCarryoverLogs(best, 'code_visible_month_fallback');
      return { trip: best, matchType: 'code_visible_month_fallback' };
    }
  }

  return { trip: selected, matchType: 'none' };
}

function devCarryoverLogs(_trip: CrewScheduleTrip, _matchType: string): void {}

/** @deprecated Use {@link resolveVisibleTripForHandoff} with visible month + row date. */
export function resolveFullPairingForHandoff(
  selected: CrewScheduleTrip | null | undefined,
  monthTrips: CrewScheduleTrip[],
): CrewScheduleTrip {
  if (!selected) throw new Error('resolveFullPairingForHandoff: missing selected');
  const vm = { year: selected.year, month: selected.month };
  return resolveVisibleTripForHandoff(selected, monthTrips, vm, selected.startDate).trip;
}

export type PairingHandoffValidity = { ok: boolean; reason?: string };

/** Handoff from a **visible** row: pairing code + trip id only (no base/stats gate). */
export function validateVisibleTripHandoff(trip: CrewScheduleTrip, _anchorDateIso?: string | null): PairingHandoffValidity {
  const code = normCode(trip);
  if (!code || code === '—' || code === '-' || code === '–') return { ok: false, reason: 'no_pairing_code' };
  if (!trip.id?.trim()) return { ok: false, reason: 'no_trip_id' };
  return { ok: true };
}

/** Patch trip so detail VM always has ISO dates when grid supplied only an anchor day. */
export function applyAnchorDatesIfNeeded(trip: CrewScheduleTrip, anchorDateIso?: string | null): CrewScheduleTrip {
  if (!anchorDateIso || !isoOk(anchorDateIso)) return trip;
  const sd = String(trip.startDate ?? '').slice(0, 10);
  const ed = String(trip.endDate ?? '').slice(0, 10);
  if (isoOk(sd) && isoOk(ed)) return trip;
  const d = anchorDateIso.slice(0, 10);
  return { ...trip, startDate: d, endDate: d };
}

/**
 * Strict validation (e.g. optional prefetch) — kept for tooling; **do not** use for visible-row instant paint.
 */
export function validateFullPairingHandoff(trip: CrewScheduleTrip): PairingHandoffValidity {
  return validateVisibleTripHandoff(trip, trip.startDate);
}

export function devLogCarryoverOrInternationalCheck(_trip: CrewScheduleTrip, _context: string): void {}
