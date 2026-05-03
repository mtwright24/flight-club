import type { CrewScheduleTrip } from './types';
import {
  fetchCrewScheduleTripByPairingUuid,
  fetchPairingDutiesForScheduleEntries,
  fetchTripGroupEntries,
  fetchTripMetadataForGroup,
  mergeTripWithMetadataRow,
  resolveSchedulePairingDbIdByOverlap,
  type ScheduleTripMetadataRow,
} from './scheduleApi';
import { entriesToSingleTrip } from './tripMapper';
import { dutiesToCrewScheduleLegs } from './jetblueFlicaImport';
import {
  adjacentMonthKeys,
  buildMonthTripsByKeyCache,
  resolveFullPairingForDetail,
  scorePairingCompleteness,
} from './pairingDetailResolve';
import { monthCalendarKey } from './scheduleMonthCache';
import { pairingSnapshotKey, readCommittedMonthSnapshot, readPairingDetailSnapshot } from './scheduleStableSnapshots';
import { getDetailNavigationStashForResolve } from './tripDetailNavCache';
import {
  isExemptFromStrictPairingPaint,
  validatePairingSummaryPaintReady,
} from './pairingRenderableGate';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normCode(s: string | undefined | null): string {
  return String(s ?? '')
    .trim()
    .toUpperCase();
}

function pickBestCommittedTrip(
  tripId: string,
  pairingCode: string | undefined,
  monthCenterKey: string,
): CrewScheduleTrip | null {
  let best: CrewScheduleTrip | null = null;
  let bestScore = -1;
  const code = pairingCode ? normCode(pairingCode) : '';
  for (const mk of adjacentMonthKeys(monthCenterKey)) {
    const snap = readCommittedMonthSnapshot(mk);
    for (const t of snap?.trips ?? []) {
      if (String(t.id) !== String(tripId)) continue;
      if (code && normCode(t.pairingCode) !== code) continue;
      const sc = scorePairingCompleteness(t);
      if (sc > bestScore) {
        bestScore = sc;
        best = t;
      }
    }
  }
  return best;
}

function finalizeCandidate(
  tripId: string,
  raw: CrewScheduleTrip,
  meta: ScheduleTripMetadataRow | null,
  anchorIso: string | null,
  source: string,
): { trip: CrewScheduleTrip; meta: ScheduleTripMetadataRow | null; source: string } | null {
  const merged = mergeTripWithMetadataRow(raw, meta);
  const withId: CrewScheduleTrip = { ...merged, id: tripId };
  if (!validatePairingSummaryPaintReady(withId, anchorIso).ok) return null;
  return { trip: withId, meta, source };
}

async function loadLegacyTripWithDuties(tripId: string): Promise<CrewScheduleTrip | null> {
  const rows = await fetchTripGroupEntries(tripId);
  let base = entriesToSingleTrip(rows);
  if (!base) return null;
  const duties = await fetchPairingDutiesForScheduleEntries(rows);
  if (duties?.length) {
    base = {
      ...base,
      legs: dutiesToCrewScheduleLegs(duties, base.id, base.base?.trim().toUpperCase() || 'JFK'),
    };
  }
  return base;
}

function canonicalFromStashEntry(tripId: string): CrewScheduleTrip | null {
  const entry = getDetailNavigationStashForResolve(tripId);
  if (!entry) return null;
  const { pointer, overlayTrips } = entry;
  return resolveFullPairingForDetail({
    pairingCode: pointer.pairingCode,
    selectedDateIso: pointer.selectedDateIso,
    selectedMonthKey: pointer.selectedMonthKey,
    visibleTrips: overlayTrips,
    monthTripsByKeyCache: buildMonthTripsByKeyCache(pointer.selectedMonthKey),
    tripGroupId: tripId,
  }).trip;
}

/** Synchronous paint-ready snapshot (stash / warm / committed). No network. */
export function trySyncRenderablePairingSnapshot(tripId: string): CrewScheduleTrip | null {
  const entry = getDetailNavigationStashForResolve(tripId);
  const anchorIso = entry?.pointer.selectedDateIso ?? null;
  const monthCenter = entry?.pointer.selectedMonthKey ?? null;

  const canon = canonicalFromStashEntry(tripId);
  if (canon) {
    if (isExemptFromStrictPairingPaint(canon) && validatePairingSummaryPaintReady(canon, anchorIso).ok) {
      return { ...canon, id: tripId };
    }
    if (validatePairingSummaryPaintReady(canon, anchorIso).ok) {
      return { ...canon, id: tripId };
    }
    const warm = readPairingDetailSnapshot(pairingSnapshotKey(canon));
    if (warm && String(warm.id).trim() === String(tripId).trim()) {
      const w2 = { ...warm, id: tripId };
      if (validatePairingSummaryPaintReady(w2, anchorIso).ok) return w2;
    }
  }

  if (monthCenter) {
    const committed = pickBestCommittedTrip(tripId, entry?.pointer.pairingCode, monthCenter);
    if (committed) {
      const c2 = { ...committed, id: tripId };
      if (validatePairingSummaryPaintReady(c2, anchorIso).ok) return c2;
    }
  }

  return null;
}

export type ResolveRenderablePairingSnapshotResult = {
  trip: CrewScheduleTrip;
  meta: ScheduleTripMetadataRow | null;
  source: string;
};

/**
 * Full resolver: stash / warm / committed → DB UUID → legacy entries. Returns only paint-valid trips (or exempt).
 */
export async function resolveRenderablePairingSnapshot(
  tripId: string,
  pairingUuidFromRoute: string | null | undefined,
  fallbackVisibleTrip: CrewScheduleTrip | null | undefined,
): Promise<ResolveRenderablePairingSnapshotResult | null> {
  const meta = await fetchTripMetadataForGroup(tripId).catch(() => null);

  const entry = getDetailNavigationStashForResolve(tripId);
  const pointer = entry?.pointer;
  const anchorIso =
    pointer?.selectedDateIso ??
    (fallbackVisibleTrip?.startDate && /^\d{4}-\d{2}-\d{2}/.test(fallbackVisibleTrip.startDate)
      ? fallbackVisibleTrip.startDate.slice(0, 10)
      : null);

  const canon = canonicalFromStashEntry(tripId);
  const monthCenter =
    pointer?.selectedMonthKey ??
    (fallbackVisibleTrip ? monthCalendarKey(fallbackVisibleTrip.year, fallbackVisibleTrip.month) : null);

  const tryCand = (
    raw: CrewScheduleTrip | null | undefined,
    source: string,
  ): ResolveRenderablePairingSnapshotResult | null => {
    if (!raw) return null;
    return finalizeCandidate(tripId, raw, meta, anchorIso, source);
  };

  if (canon && isExemptFromStrictPairingPaint(canon)) {
    const hit = tryCand(canon, 'stash_exempt');
    if (hit) return { ...hit, source: 'stash_exempt' };
  }

  if (fallbackVisibleTrip && isExemptFromStrictPairingPaint(fallbackVisibleTrip)) {
    const hit = tryCand(fallbackVisibleTrip, 'fallback_exempt');
    if (hit) return { ...hit, source: 'fallback_exempt' };
  }

  if (canon) {
    const hit = tryCand(canon, 'stash_canonical');
    if (hit) return hit;

    const warm = readPairingDetailSnapshot(pairingSnapshotKey(canon));
    if (warm) {
      const hitW = tryCand(warm, 'warm_cache');
      if (hitW) return hitW;
    }
  }

  if (monthCenter) {
    const committed = pickBestCommittedTrip(tripId, pointer?.pairingCode ?? fallbackVisibleTrip?.pairingCode, monthCenter);
    const hitC = tryCand(committed, 'committed_month');
    if (hitC) return hitC;
  }

  let pairingDbId =
    (pairingUuidFromRoute && UUID_RE.test(String(pairingUuidFromRoute).trim())
      ? String(pairingUuidFromRoute).trim()
      : undefined) ??
    (pointer?.schedulePairingId && UUID_RE.test(pointer.schedulePairingId) ? pointer.schedulePairingId : undefined) ??
    (fallbackVisibleTrip?.schedulePairingId && UUID_RE.test(String(fallbackVisibleTrip.schedulePairingId).trim())
      ? String(fallbackVisibleTrip.schedulePairingId).trim()
      : undefined);

  if (!pairingDbId && canon) {
    pairingDbId =
      (await resolveSchedulePairingDbIdByOverlap({
        pairingCode: canon.pairingCode,
        rangeStart: canon.startDate,
        rangeEnd: canon.endDate,
      })) ?? undefined;
  }
  if (!pairingDbId && fallbackVisibleTrip) {
    pairingDbId =
      (await resolveSchedulePairingDbIdByOverlap({
        pairingCode: fallbackVisibleTrip.pairingCode,
        rangeStart: fallbackVisibleTrip.startDate,
        rangeEnd: fallbackVisibleTrip.endDate,
      })) ?? undefined;
  }
  if (!pairingDbId && !entry && !fallbackVisibleTrip && UUID_RE.test(tripId)) {
    pairingDbId = tripId;
  }

  if (pairingDbId) {
    const fromDb = await fetchCrewScheduleTripByPairingUuid(pairingDbId);
    if (fromDb) {
      const schedulePairingId = fromDb.schedulePairingId ?? pairingDbId ?? fromDb.id;
      const mergedForKey: CrewScheduleTrip = { ...fromDb, id: tripId, schedulePairingId };
      const hitDb = tryCand(mergedForKey, 'db_uuid');
      if (hitDb) return hitDb;
    }
  }

  const legacy = await loadLegacyTripWithDuties(tripId);
  const hitL = tryCand(legacy, 'legacy_entries');
  if (hitL) return hitL;

  return null;
}
