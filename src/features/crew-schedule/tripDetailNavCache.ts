import type { CrewScheduleTrip } from './types';
import { monthCalendarKey } from './scheduleMonthCache';
import {
  buildMonthTripsByKeyCache,
  dbEnrichmentAddsAuthoritativeFields,
  isDbEnrichedPairing,
  isPartialVisiblePairing,
  resolveFullPairingForDetail,
  sameTripGroupAndPairingCode,
  scorePairingCompleteness,
  statFieldsPresent,
  routeAirportCount,
} from './pairingDetailResolve';
import { devLogCarryoverOrInternationalCheck, type ScheduleVisibleMonth, validateVisibleTripHandoff } from './pairingHandoff';
import {
  validatePairingSummaryPaintReady,
  isInstantPaintablePairing,
  isScheduleInstantPaintablePairing,
} from './pairingRenderableGate';
import {
  canSealPairingSurface,
  isThinScheduleOnlyPairing,
} from './pairingDetailReadiness';
import { pairingNavigationSessionKey, warmPairingDetailSnapshot } from './scheduleStableSnapshots';

const UUID_RE_STASH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DetailHandoffPointer = {
  pairingCode: string;
  selectedDateIso: string | null;
  selectedMonthKey: string;
  /** `schedule_pairings.id` when the grid already knows it (skips overlap probe). */
  schedulePairingId?: string;
};

type StashEntry = {
  pointer: DetailHandoffPointer;
  /** Month list at tap (same as grid source). */
  overlayTrips: CrewScheduleTrip[];
};

const stashByTripId = new Map<string, StashEntry>();

function deepCloneTrip(t: CrewScheduleTrip): CrewScheduleTrip {
  return JSON.parse(JSON.stringify(t)) as CrewScheduleTrip;
}

function normCodeRaw(s: string | undefined | null): string {
  return String(s ?? '')
    .trim()
    .toUpperCase();
}

function canonicalTripForStash(
  selected: CrewScheduleTrip,
  overlayTrips: CrewScheduleTrip[],
  pointer: DetailHandoffPointer,
): CrewScheduleTrip {
  const cache = buildMonthTripsByKeyCache(pointer.selectedMonthKey);
  const { trip } = resolveFullPairingForDetail({
    pairingCode: pointer.pairingCode,
    selectedDateIso: pointer.selectedDateIso,
    selectedMonthKey: pointer.selectedMonthKey,
    visibleTrips: overlayTrips,
    monthTripsByKeyCache: cache,
    tripGroupId: selected.id,
  });
  return trip;
}

export type StashTripHandoffOpts = {
  visibleMonth: ScheduleVisibleMonth;
  rowDateIso?: string | null;
};

/**
 * Tap handoff: pairing row is a pointer only — stash canonical merged pairing for detail/summary.
 */
export function stashTripForDetailNavigation(
  selected: CrewScheduleTrip,
  monthTrips: CrewScheduleTrip[],
  opts: StashTripHandoffOpts,
): void {
  const { visibleMonth, rowDateIso } = opts;
  const selectedMonthKey = monthCalendarKey(visibleMonth.year, visibleMonth.month);
  const sidRaw = String(selected.schedulePairingId ?? '').trim();
  const pointer: DetailHandoffPointer = {
    pairingCode: normCodeRaw(selected.pairingCode),
    selectedDateIso: rowDateIso && /^\d{4}-\d{2}-\d{2}/.test(rowDateIso) ? rowDateIso.slice(0, 10) : null,
    selectedMonthKey,
    schedulePairingId: UUID_RE_STASH.test(sidRaw) ? sidRaw : undefined,
  };
  const overlay = monthTrips.map((t) => deepCloneTrip(t));
  const canonical = canonicalTripForStash(selected, overlay, pointer);
  const validity = validateVisibleTripHandoff(canonical, pointer.selectedDateIso ?? undefined);
  if (validity.ok) {
    devLogCarryoverOrInternationalCheck(canonical, 'nav_stash');
  }

  stashByTripId.set(selected.id, { pointer, overlayTrips: overlay });

  if (isInstantPaintablePairing(canonical) || validatePairingSummaryPaintReady(canonical, pointer.selectedDateIso).ok) {
    warmPairingDetailSnapshot(deepCloneTrip(canonical));
  }
}

/** Pointer + overlay for DB/detail resolution (pairing row is not render-ready). */
export function getDetailNavigationStashForResolve(tripId: string): StashEntry | undefined {
  const e = stashByTripId.get(tripId);
  if (!e) return undefined;
  return {
    pointer: { ...e.pointer },
    overlayTrips: e.overlayTrips.map((t) => deepCloneTrip(t)),
  };
}

function readCanonicalFromStash(tripId: string): CrewScheduleTrip | undefined {
  const e = stashByTripId.get(tripId);
  if (!e) return undefined;
  const { trip } = resolveFullPairingForDetail({
    pairingCode: e.pointer.pairingCode,
    selectedDateIso: e.pointer.selectedDateIso,
    selectedMonthKey: e.pointer.selectedMonthKey,
    visibleTrips: e.overlayTrips,
    monthTripsByKeyCache: buildMonthTripsByKeyCache(e.pointer.selectedMonthKey),
    tripGroupId: tripId,
  });
  return trip;
}

/** Read canonical resolved trip (re-runs resolver against latest committed months + overlay). */
export function peekStashedTripForDetail(tripId: string): CrewScheduleTrip | undefined {
  const t = readCanonicalFromStash(tripId);
  return t ? deepCloneTrip(t) : undefined;
}

export function peekStashedHandoffValid(tripId: string): boolean {
  const t = readCanonicalFromStash(tripId);
  return t ? validateVisibleTripHandoff(t).ok : false;
}

export function peekStashedPairingSnapshotKey(tripId: string): string | undefined {
  const t = readCanonicalFromStash(tripId);
  return t ? pairingNavigationSessionKey(t) : undefined;
}

export function peekStashedDetailPointer(tripId: string): DetailHandoffPointer | undefined {
  return stashByTripId.get(tripId)?.pointer;
}

/** Returns and removes the stashed trip for this id, if any. */
export function consumeStashedTripForDetail(tripId: string): CrewScheduleTrip | undefined {
  const t = peekStashedTripForDetail(tripId);
  stashByTripId.delete(tripId);
  return t;
}

/** Reject hydrated/network trip only when it would downgrade a stronger same-session render (never block DB authority over partial visible snapshots). */
export function shouldRejectWeakerPairingRender(
  currentTrip: CrewScheduleTrip | undefined,
  candidate: CrewScheduleTrip,
): boolean {
  if (!currentTrip) return false;

  if (isThinScheduleOnlyPairing(currentTrip) && canSealPairingSurface(candidate)) {
    return false;
  }

  if (canSealPairingSurface(currentTrip) && isThinScheduleOnlyPairing(candidate)) {
    return true;
  }

  if (
    sameTripGroupAndPairingCode(currentTrip, candidate) &&
    canSealPairingSurface(currentTrip) &&
    routeAirportCount(candidate) < routeAirportCount(currentTrip)
  ) {
    return true;
  }

  if (
    canSealPairingSurface(currentTrip) &&
    statFieldsPresent(candidate) < statFieldsPresent(currentTrip)
  ) {
    return true;
  }

  if (
    canSealPairingSurface(currentTrip) &&
    (currentTrip.crewMembers?.length ?? 0) > 0 &&
    (candidate.crewMembers?.length ?? 0) < (currentTrip.crewMembers?.length ?? 0)
  ) {
    return true;
  }

  const curPaint =
    validatePairingSummaryPaintReady(currentTrip, null).ok ||
    isInstantPaintablePairing(currentTrip) ||
    isScheduleInstantPaintablePairing(currentTrip);
  const nextPaint =
    validatePairingSummaryPaintReady(candidate, null).ok ||
    isInstantPaintablePairing(candidate) ||
    isScheduleInstantPaintablePairing(candidate);

  if (curPaint && !nextPaint && !canSealPairingSurface(candidate)) {
    return true;
  }

  const curS = scorePairingCompleteness(currentTrip);
  const nextS = scorePairingCompleteness(candidate);
  const wouldRejectOnScore = nextS < curS - 1;

  if (curPaint && nextPaint && wouldRejectOnScore) {
    if (sameTripGroupAndPairingCode(currentTrip, candidate) && isDbEnrichedPairing(candidate)) {
      return false;
    }

    if (isPartialVisiblePairing(currentTrip) && isDbEnrichedPairing(candidate)) {
      return false;
    }

    if (dbEnrichmentAddsAuthoritativeFields(currentTrip, candidate)) {
      return false;
    }

    return true;
  }

  if (sameTripGroupAndPairingCode(currentTrip, candidate) && isDbEnrichedPairing(candidate)) {
    return false;
  }

  if (isPartialVisiblePairing(currentTrip) && isDbEnrichedPairing(candidate)) {
    return false;
  }

  if (dbEnrichmentAddsAuthoritativeFields(currentTrip, candidate)) {
    return false;
  }

  if (wouldRejectOnScore) {
    return true;
  }
  return false;
}
