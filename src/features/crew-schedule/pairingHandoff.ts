/**
 * Pairing tap/long-press handoff: resolve the richest `CrewScheduleTrip` from the month list
 * (same trip_group / pairing + overlapping span). Never treat a thin row as merge source of truth.
 */
import type { CrewScheduleTrip } from './types';
import { isFlicaNonFlyingActivityId } from '../../services/flicaScheduleHtmlParser';
import { pairingNavigationSessionKey } from './scheduleStableSnapshots';

const INTL_CODES = new Set(['J1012', 'J1010', 'J1015', 'J1002', 'J4195', 'J4173', 'J3H95', 'J1028', 'J1030']);

function normCode(t: CrewScheduleTrip): string {
  return String(t.pairingCode ?? '')
    .trim()
    .toUpperCase();
}

function rangesOverlap(a: CrewScheduleTrip, b: CrewScheduleTrip): boolean {
  const as = String(a.startDate ?? '').slice(0, 10);
  const ae = String(a.endDate ?? '').slice(0, 10);
  const bs = String(b.startDate ?? '').slice(0, 10);
  const be = String(b.endDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(as) || !/^\d{4}-\d{2}-\d{2}$/.test(ae)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bs) || !/^\d{4}-\d{2}-\d{2}$/.test(be)) return false;
  return as <= be && bs <= ae;
}

function hasMeaningfulRoute(t: CrewScheduleTrip): boolean {
  const r = (t.routeSummary ?? '').trim();
  if (r && r !== '—' && r !== '-' && r !== '–') return true;
  const sr = (t.summary?.route ?? '').trim();
  if (sr && sr !== '—' && sr !== '-') return true;
  return (t.legs ?? []).some((l) => String(l.departureAirport ?? '').trim() && String(l.arrivalAirport ?? '').trim());
}

function hasOperationalBody(t: CrewScheduleTrip): boolean {
  const legsLen = (t.legs ?? []).length;
  const canon = t.canonicalPairingDays ? Object.keys(t.canonicalPairingDays).length : 0;
  return legsLen > 0 || canon > 0 || hasMeaningfulRoute(t);
}

/** `CrewScheduleTrip.month` / `year` anchor (= `month_key` YYYY-MM for the view layer). */
function hasMonthKeyAnchor(t: CrewScheduleTrip): boolean {
  return Number.isFinite(t.year) && t.year >= 1900 && t.year <= 2100 && t.month >= 1 && t.month <= 12;
}

/** Duty structure: normalized legs and/or canonical FLICA duty days (no standalone thin route lines). */
function hasDutyLikeStructure(t: CrewScheduleTrip): boolean {
  const legN = t.legs?.length ?? 0;
  const canonN = t.canonicalPairingDays ? Object.keys(t.canonicalPairingDays).length : 0;
  return legN > 0 || canonN > 0;
}

function hasTotalsOrSummary(t: CrewScheduleTrip): boolean {
  if (t.pairingBlockHours != null && t.pairingBlockHours > 0) return true;
  if (t.pairingCreditHours != null && t.pairingCreditHours > 0) return true;
  if (t.pairingTafbHours != null && t.pairingTafbHours > 0) return true;
  if (t.tripLayoverTotalMinutes != null && t.tripLayoverTotalMinutes > 0) return true;
  if (t.creditHours != null && t.creditHours > 0) return true;
  const s = t.summary;
  if (s && (s.blockTotal > 0 || s.creditTotal > 0 || s.tafbTotal > 0 || s.layoverTotal > 0)) return true;
  if (s && (s.legsCount > 0 || s.dutyDays > 0)) return true;
  return false;
}

/** Prefer richer merged objects from the same month list (legs, base, canon, stats). */
function handoffRichnessScore(t: CrewScheduleTrip): number {
  let s = 0;
  s += (t.legs?.length ?? 0) * 8;
  if (t.canonicalPairingDays) s += Object.keys(t.canonicalPairingDays).length * 6;
  const b = t.base?.trim();
  if (b && b !== '—' && b !== '-') s += 25;
  if (hasMeaningfulRoute(t)) s += 18;
  if (hasTotalsOrSummary(t)) s += 15;
  if ((t.crewMembers?.length ?? 0) > 0) s += 6;
  if (t.hotel?.name || t.hotel?.city) s += 4;
  return s;
}

/**
 * From month `trips`, pick the fullest row matching `selected` (trip_group id and/or pairing code + overlap).
 */
export function resolveFullPairingForHandoff(
  selected: CrewScheduleTrip | null | undefined,
  monthTrips: CrewScheduleTrip[],
): CrewScheduleTrip {
  if (!selected) {
    throw new Error('resolveFullPairingForHandoff: missing selected');
  }
  if (!monthTrips?.length) {
    return selected;
  }
  const code = normCode(selected);
  const candidates = monthTrips.filter((t) => {
    if (t.id === selected.id) return true;
    if (code && normCode(t) === code && rangesOverlap(t, selected)) return true;
    return false;
  });
  if (candidates.length <= 1) {
    return candidates[0] ?? selected;
  }
  const sorted = [...candidates].sort((a, b) => handoffRichnessScore(b) - handoffRichnessScore(a));
  return sorted[0] ?? selected;
}

export type PairingHandoffValidity = { ok: boolean; reason?: string };

/**
 * Full snapshot validity for detail/summary *instant* render (no thin row as truth).
 * Non-flying rows allow minimal shape. International/carryover pairings in TEST list get stricter logging only.
 */
export function validateFullPairingHandoff(trip: CrewScheduleTrip): PairingHandoffValidity {
  const code = normCode(trip);
  if (!code) return { ok: false, reason: 'no_pairing_code' };
  if (!trip.id?.trim()) return { ok: false, reason: 'no_trip_id' };
  const sd = String(trip.startDate ?? '').slice(0, 10);
  const ed = String(trip.endDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) return { ok: false, reason: 'bad_dates' };
  if (!hasMonthKeyAnchor(trip)) return { ok: false, reason: 'bad_month_key' };

  const st = trip.status;
  if (st === 'off' || st === 'pto' || st === 'ptv' || st === 'rsv' || st === 'training' || st === 'other') {
    return { ok: true };
  }
  if (isFlicaNonFlyingActivityId(code)) {
    return { ok: true };
  }

  const base = trip.base?.trim();
  if (!base || base === '—' || base === '-' || base === '–') {
    return { ok: false, reason: 'no_base' };
  }

  if (!hasDutyLikeStructure(trip)) {
    return { ok: false, reason: 'no_duties_or_legs' };
  }
  if (!hasMeaningfulRoute(trip)) {
    return { ok: false, reason: 'no_route' };
  }
  if (!hasTotalsOrSummary(trip)) {
    return { ok: false, reason: 'no_stats' };
  }
  if (!hasOperationalBody(trip)) {
    return { ok: false, reason: 'no_route_legs_or_canon' };
  }

  return { ok: true };
}

export function devLogCarryoverOrInternationalCheck(trip: CrewScheduleTrip, context: string): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const code = normCode(trip);
  if (!INTL_CODES.has(code)) return;
  const carry =
    trip.ledgerContext?.carryInFromPriorMonth === true || trip.ledgerContext?.carryOutToNextMonth === true;
  if (carry) {
    console.log('[CARRYOVER_PAIRING_DETAIL_CHECK]', {
      context,
      code,
      id: trip.id,
      start: trip.startDate,
      end: trip.endDate,
      base: trip.base ?? null,
      legs: trip.legs?.length ?? 0,
      session: pairingNavigationSessionKey(trip),
    });
  } else {
    console.log('[INTERNATIONAL_PAIRING_DETAIL_CHECK]', {
      context,
      code,
      id: trip.id,
      start: trip.startDate,
      end: trip.endDate,
      base: trip.base ?? null,
      legs: trip.legs?.length ?? 0,
    });
  }
}
