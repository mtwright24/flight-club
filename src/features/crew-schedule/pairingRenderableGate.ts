import { isFlicaNonFlyingActivityId } from '../../services/flicaScheduleHtmlParser';
import type { CrewScheduleTrip } from './types';
import {
  crewBaseFromPairingDbFields,
  isDbEnrichedPairing,
  isPartialVisiblePairing,
  normBaseForScoring,
  routeAirportCount,
  routeHasJfkBookend,
  routeOrderedIatasFromRouteString,
  statFieldsPresent,
} from './pairingDetailResolve';

const UUID_SCHEDULE_PAIRING =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normCode(s: string | undefined | null): string {
  return String(s ?? '')
    .trim()
    .toUpperCase();
}

function isoOk(s: string | null | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(String(s ?? '').slice(0, 10));
}

/** Non-operational / non-flying rows: strict paint rules do not apply. */
export function isExemptFromStrictPairingPaint(t: CrewScheduleTrip | null | undefined): boolean {
  if (t == null) return true;
  const code = normCode(t.pairingCode);
  if (!code || code === '—' || code === '-' || code === '–') return true;
  if (isFlicaNonFlyingActivityId(code)) return true;
  if (t.status === 'off' || t.status === 'pto' || t.status === 'ptv' || t.status === 'rsv') return true;
  if (t.status === 'training' || t.status === 'other') return true;
  if (code === 'CONT' || code === 'RDO') return true;
  return false;
}

function inferredBaseFromRoute(t: CrewScheduleTrip): string | null {
  const inf = crewBaseFromPairingDbFields(String(t.routeSummary ?? ''), t.base);
  return inf ? inf.trim().toUpperCase() : null;
}

function hasTrustedSchedulePairingId(t: CrewScheduleTrip): boolean {
  return UUID_SCHEDULE_PAIRING.test(String(t.schedulePairingId ?? '').trim());
}

function legOrDutyStructure(t: CrewScheduleTrip): boolean {
  if ((t.legs?.length ?? 0) >= 1) return true;
  if (t.canonicalPairingDays && Object.keys(t.canonicalPairingDays).length >= 1) return true;
  return false;
}

/**
 * Minimum bar for schedule-sourced first paint (detail/summary): identity + dates + route or legs.
 * Does not require base, stats, UUID, or hotel/crew — those can follow from DB enrichment.
 */
export function isUnsafeFirstPaintPairing(t: CrewScheduleTrip): boolean {
  if (isExemptFromStrictPairingPaint(t)) return false;
  const code = normCode(t.pairingCode);
  if (!code || code === '—' || code === '-' || code === '–') return true;
  if (!t.id?.trim()) return true;
  if (!isoOk(t.startDate) || !isoOk(t.endDate)) return true;
  const hasStructure = legOrDutyStructure(t) || routeAirportCount(t) >= 2;
  if (!hasStructure) return true;
  return false;
}

/** Calendar/cache/overlay trip is allowed to paint immediately before DB hydration. */
export function isScheduleInstantPaintablePairing(t: CrewScheduleTrip): boolean {
  if (isUnsafeFirstPaintPairing(t)) return false;
  if (isExemptFromStrictPairingPaint(t)) return Boolean(t.id?.trim());
  return true;
}

/**
 * Operational snapshot that must never drive first paint alone (wrong flash: no base, blank stats, intl fragment).
 */
export function isDangerousPartialPairing(t: CrewScheduleTrip): boolean {
  if (isExemptFromStrictPairingPaint(t)) return false;
  const code = normCode(t.pairingCode);
  if (!code || code === '—' || code === '-' || code === '–') return true;
  if (!t.id?.trim()) return true;
  if (!isoOk(t.startDate) || !isoOk(t.endDate)) return true;
  if (isPartialVisiblePairing(t)) return true;
  const baseOk = normBaseForScoring(t.base) != null || inferredBaseFromRoute(t) != null;
  const dbHint = isDbEnrichedPairing(t);
  if (!baseOk && !dbHint) return true;
  if (statFieldsPresent(t) < 1 && !hasTrustedSchedulePairingId(t) && !baseOk) return true;
  return false;
}

/**
 * Safe to paint immediately from month/cache/overlay: enough structure to avoid bogus summary/detail,
 * with a path to DB enrichment when base/stats are still thin.
 */
export function isInstantPaintablePairing(t: CrewScheduleTrip): boolean {
  if (isDangerousPartialPairing(t)) return false;
  if (isExemptFromStrictPairingPaint(t)) return Boolean(t.id?.trim());
  if (!normCode(t.pairingCode) || !t.id?.trim()) return false;
  if (!isoOk(t.startDate) || !isoOk(t.endDate)) return false;
  if (!legOrDutyStructure(t)) return false;
  if (routeAirportCount(t) < 2 && !hasTrustedSchedulePairingId(t)) return false;
  const baseOk = normBaseForScoring(t.base) != null || inferredBaseFromRoute(t) != null;
  const statsOk = statFieldsPresent(t) >= 1;
  const uuidOk = hasTrustedSchedulePairingId(t);
  if (!baseOk && !statsOk && !uuidOk) return false;
  return true;
}

/**
 * Full validation before first paint for operational flying pairings (detail + quick preview).
 */
export function validateRenderableOperationalFlyingPairing(
  trip: CrewScheduleTrip,
  anchorIso?: string | null,
): { ok: true } | { ok: false; reason: string } {
  const code = normCode(trip.pairingCode);
  if (!code || code === '—' || code === '-' || code === '–') return { ok: false, reason: 'no_pairing_code' };
  if (!trip.id?.trim()) return { ok: false, reason: 'no_trip_id' };
  if (!normBaseForScoring(trip.base)) return { ok: false, reason: 'no_base' };

  if (statFieldsPresent(trip) < 3) return { ok: false, reason: 'insufficient_stats' };

  const ap = routeOrderedIatasFromRouteString(trip.routeSummary);
  const hasBookend = routeHasJfkBookend(trip.routeSummary);
  if (ap.length === 2 && ap[0] !== 'JFK' && ap[0] !== 'BOS' && !hasBookend) {
    return { ok: false, reason: 'layover_first_two_segment' };
  }

  const legAp = new Set<string>();
  for (const l of trip.legs ?? []) {
    const d = String(l.departureAirport ?? '')
      .trim()
      .toUpperCase();
    const a = String(l.arrivalAirport ?? '')
      .trim()
      .toUpperCase();
    if (/^[A-Z]{3}$/.test(d)) legAp.add(d);
    if (/^[A-Z]{3}$/.test(a)) legAp.add(a);
  }
  const routeToks = ap.length;
  if (routeToks < 2 && legAp.size < 2) return { ok: false, reason: 'route_too_thin' };

  const fullRouteOk =
    legAp.size >= 3 || routeToks >= 3 || hasBookend || (routeToks >= 2 && ap[0] === 'JFK') || (legAp.size >= 2 && hasBookend);
  if (!fullRouteOk) return { ok: false, reason: 'route_not_full_enough' };

  if (anchorIso && isoOk(anchorIso) && isoOk(trip.startDate) && isoOk(trip.endDate)) {
    const d = anchorIso.slice(0, 10);
    if (d < trip.startDate.slice(0, 10) || d > trip.endDate.slice(0, 10)) {
      return { ok: false, reason: 'anchor_outside_span' };
    }
  }

  if (!legOrDutyStructure(trip)) return { ok: false, reason: 'no_duty_leg_structure' };

  return { ok: true };
}

export function validatePairingSummaryPaintReady(
  trip: CrewScheduleTrip,
  anchorIso?: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (isExemptFromStrictPairingPaint(trip)) {
    if (!trip.id?.trim()) return { ok: false, reason: 'no_trip_id' };
    return { ok: true };
  }
  return validateRenderableOperationalFlyingPairing(trip, anchorIso);
}
