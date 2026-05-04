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
import { isExemptFromStrictPairingPaint, isUnsafeFirstPaintPairing } from './pairingRenderableGate';

function normCode(s: string | undefined | null): string {
  return String(s ?? '')
    .trim()
    .toUpperCase();
}

function isoOk(s: string | null | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(String(s ?? '').slice(0, 10));
}

function legOrDutyStructure(t: CrewScheduleTrip): boolean {
  if ((t.legs?.length ?? 0) >= 1) return true;
  if (t.canonicalPairingDays && Object.keys(t.canonicalPairingDays).length >= 1) return true;
  return false;
}

/** Base column or DB/route-derived crew base (JFK bookend, closed loop). */
export function effectiveOperationalBasePresent(t: CrewScheduleTrip): boolean {
  if (normBaseForScoring(t.base) != null) return true;
  const inferred = crewBaseFromPairingDbFields(String(t.routeSummary ?? ''), t.base);
  return inferred != null && /^[A-Z]{3}$/.test(inferred.trim().toUpperCase());
}

/**
 * True for schedule/row/month-merge objects that are not safe as the final sealed detail surface.
 */
export function isThinScheduleOnlyPairing(t: CrewScheduleTrip): boolean {
  if (isExemptFromStrictPairingPaint(t)) return false;
  if (!normCode(t.pairingCode) || !t.id?.trim()) return true;
  return !isDetailReadyPairing(t);
}

/**
 * Full enriched pairing: safe to cache replay and to seal detail/preview so DB cannot downgrade.
 */
export function isDetailReadyPairing(t: CrewScheduleTrip): boolean {
  if (isExemptFromStrictPairingPaint(t)) return Boolean(t.id?.trim());
  const code = normCode(t.pairingCode);
  if (!code || code === '—' || code === '-' || code === '–') return false;
  if (!t.id?.trim()) return false;
  if (isUnsafeFirstPaintPairing(t)) return false;
  if (!isoOk(t.startDate) || !isoOk(t.endDate)) return false;
  if (!effectiveOperationalBasePresent(t)) return false;
  if (isPartialVisiblePairing(t)) return false;
  if (!legOrDutyStructure(t)) return false;

  const stats = statFieldsPresent(t);
  const statsOk = stats >= 3 || (isDbEnrichedPairing(t) && stats >= 2);
  if (!statsOk) return false;

  const ap = routeOrderedIatasFromRouteString(t.routeSummary);
  const hasBookend = routeHasJfkBookend(t.routeSummary);
  const legAp = new Set<string>();
  for (const l of t.legs ?? []) {
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
  if (routeToks < 2 && legAp.size < 2) return false;
  if (ap.length === 2 && ap[0] !== 'JFK' && ap[0] !== 'BOS' && !hasBookend) {
    if (!isDbEnrichedPairing(t) || legAp.size < 2) return false;
  }

  const fullRouteOk =
    legAp.size >= 3 ||
    routeToks >= 3 ||
    hasBookend ||
    (routeToks >= 2 && ap[0] === 'JFK') ||
    (legAp.size >= 2 && hasBookend) ||
    (isDbEnrichedPairing(t) && routeAirportCount(t) >= 3);
  if (!fullRouteOk) return false;

  return true;
}

/** Alias: only seal when detail-ready (or exempt). */
export function canSealPairingSurface(t: CrewScheduleTrip | null | undefined): boolean {
  if (t == null) return false;
  return isDetailReadyPairing(t);
}
