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
  isDbEnrichedPairing,
  resolveFullPairingForDetail,
  scorePairingCompleteness,
  statFieldsPresent,
} from './pairingDetailResolve';
import { monthCalendarKey } from './scheduleMonthCache';
import { pairingSnapshotKey, readCommittedMonthSnapshot, readPairingDetailSnapshot } from './scheduleStableSnapshots';
import { getDetailNavigationStashForResolve } from './tripDetailNavCache';
import {
  isDangerousPartialPairing,
  isExemptFromStrictPairingPaint,
  isScheduleInstantPaintablePairing,
  isUnsafeFirstPaintPairing,
  validatePairingSummaryPaintReady,
} from './pairingRenderableGate';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normCode(s: string | undefined | null): string {
  return String(s ?? '')
    .trim()
    .toUpperCase();
}

function isoOk(s: string | null | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(String(s ?? '').slice(0, 10));
}

function anchorInSpan(trip: CrewScheduleTrip, anchorIso: string | null | undefined): boolean {
  if (!anchorIso || !isoOk(anchorIso) || !isoOk(trip.startDate) || !isoOk(trip.endDate)) return true;
  if (isExemptFromStrictPairingPaint(trip)) return true;
  const d = anchorIso.slice(0, 10);
  return d >= trip.startDate.slice(0, 10) && d <= trip.endDate.slice(0, 10);
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

function finalizeAsyncCandidate(
  tripId: string,
  raw: CrewScheduleTrip,
  meta: ScheduleTripMetadataRow | null,
  anchorIso: string | null,
  source: string,
): { trip: CrewScheduleTrip; meta: ScheduleTripMetadataRow | null; source: string } | null {
  const merged = mergeTripWithMetadataRow(raw, meta);
  const withId: CrewScheduleTrip = { ...merged, id: tripId };
  if (isDangerousPartialPairing(withId)) return null;
  if (validatePairingSummaryPaintReady(withId, anchorIso).ok) return { trip: withId, meta, source };
  if (isDbEnrichedPairing(withId)) return { trip: withId, meta, source };
  return null;
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

export type InstantPaintPick = { trip: CrewScheduleTrip; source: string };

function withTripId(tripId: string, t: CrewScheduleTrip): CrewScheduleTrip {
  return { ...t, id: tripId };
}

function dutyOrCanonDayCount(t: CrewScheduleTrip): number {
  const c = t.canonicalPairingDays ? Object.keys(t.canonicalPairingDays).length : 0;
  if (c > 0) return c;
  const ds = new Set<string>();
  for (const l of t.legs ?? []) {
    const d = String(l.dutyDate ?? '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) ds.add(d);
  }
  return ds.size;
}

function logInstantCandidateRejected(
  source: string,
  t: CrewScheduleTrip,
  reason: string,
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[PAIRING_INSTANT_CANDIDATE_REJECTED]', {
    source,
    reason,
    id: t.id,
    pairingCode: t.pairingCode,
    startDate: t.startDate,
    endDate: t.endDate,
    base: t.base ?? null,
    routeSummary: t.routeSummary ?? null,
    block: t.pairingBlockHours ?? null,
    credit: t.pairingCreditHours ?? t.creditHours ?? null,
    tafb: t.pairingTafbHours ?? null,
    layoverMin: t.tripLayoverTotalMinutes ?? null,
    layover: t.layoverCity?.trim() || null,
    legsCount: t.legs?.length ?? 0,
    dutyOrCanonDayCount: dutyOrCanonDayCount(t),
  });
}

function scoreCandidate(
  tripId: string,
  pointerAnchor: string | null | undefined,
  fallbackVisibleTrip: CrewScheduleTrip | null | undefined,
  useAnchor: boolean,
): { candidates: { t: CrewScheduleTrip; source: string }[]; pick: InstantPaintPick | null } {
  const entry = getDetailNavigationStashForResolve(tripId);
  const candidates: { t: CrewScheduleTrip; source: string }[] = [];

  const canon = canonicalFromStashEntry(tripId);
  if (canon) {
    candidates.push({ t: withTripId(tripId, canon), source: 'stash_canonical' });
    const warm = readPairingDetailSnapshot(pairingSnapshotKey(canon));
    if (warm) {
      candidates.push({ t: withTripId(tripId, warm), source: 'warm_cache' });
    }
  }

  const codeForCommitted = entry?.pointer.pairingCode ?? fallbackVisibleTrip?.pairingCode;
  const monthCenterResolved =
    entry?.pointer.selectedMonthKey ??
    (fallbackVisibleTrip ? monthCalendarKey(fallbackVisibleTrip.year, fallbackVisibleTrip.month) : null);

  if (monthCenterResolved) {
    const committed = pickBestCommittedTrip(tripId, codeForCommitted, monthCenterResolved);
    if (committed) {
      candidates.push({ t: withTripId(tripId, committed), source: 'committed_month' });
    }
  }

  if (entry) {
    for (const ot of entry.overlayTrips) {
      if (String(ot.id) !== String(tripId)) continue;
      candidates.push({ t: withTripId(tripId, ot), source: 'overlay_visible' });
    }
  }

  if (fallbackVisibleTrip && String(fallbackVisibleTrip.id) === String(tripId)) {
    candidates.push({ t: withTripId(tripId, fallbackVisibleTrip), source: 'fallback_visible' });
  }

  let best: InstantPaintPick | null = null;
  let bestScore = -1;
  for (const { t, source } of candidates) {
    if (useAnchor && pointerAnchor && !anchorInSpan(t, pointerAnchor)) {
      logInstantCandidateRejected(source, t, 'anchor_outside_span');
      continue;
    }
    if (isUnsafeFirstPaintPairing(t)) {
      logInstantCandidateRejected(source, t, 'unsafe_first_paint');
      continue;
    }
    if (!isScheduleInstantPaintablePairing(t)) {
      logInstantCandidateRejected(source, t, 'not_schedule_instant_paintable');
      continue;
    }
    const sc = scorePairingCompleteness(t);
    if (sc > bestScore) {
      bestScore = sc;
      best = { trip: t, source };
    }
  }
  return { candidates, pick: best };
}

export type FirstPaintDecisionPayload = {
  pairingCode: string | null;
  selectedDateIso: string | null;
  selectedMonthKey: string | null;
  routeTripId: string;
  stashExists: boolean;
  warmSnapshotExists: boolean;
  committedSnapshotKeysFound: string[];
  candidateCount: number;
  selectedCandidateId: string | null;
  selectedCandidateRoute: string | null;
  selectedCandidateBase: string | null;
  selectedCandidateStatsPresent: number;
  selectedSource: string | null;
  instantPaintable: boolean;
  strictReady: boolean;
  rejectionReason: string | null;
  anchorRelaxed: boolean;
};

/** Debug payload for first-paint logging in TripDetailScreen / TripQuickPreviewSheet. */
export function buildPairingFirstPaintDecision(
  tripId: string,
  anchorIso: string | null | undefined,
  fallbackVisibleTrip: CrewScheduleTrip | null | undefined,
): { pick: InstantPaintPick | null; decision: FirstPaintDecisionPayload } {
  const entry = getDetailNavigationStashForResolve(tripId);
  const pointer = entry?.pointer;
  const pointerAnchor = pointer?.selectedDateIso ?? anchorIso ?? null;

  const canon = canonicalFromStashEntry(tripId);
  const warmExists = Boolean(canon && readPairingDetailSnapshot(pairingSnapshotKey(canon)));

  const monthCenterResolved =
    pointer?.selectedMonthKey ??
    (fallbackVisibleTrip ? monthCalendarKey(fallbackVisibleTrip.year, fallbackVisibleTrip.month) : null);
  const codeProbe = pointer?.pairingCode ?? fallbackVisibleTrip?.pairingCode;
  const committedKeys: string[] = [];
  if (monthCenterResolved) {
    for (const mk of adjacentMonthKeys(monthCenterResolved)) {
      const snap = readCommittedMonthSnapshot(mk);
      if (!snap?.trips?.length) continue;
      if (
        snap.trips.some(
          (x) => String(x.id) === String(tripId) && (!codeProbe || normCode(x.pairingCode) === normCode(codeProbe)),
        )
      ) {
        committedKeys.push(mk);
      }
    }
  }

  const { candidates: candidatesAnchored, pick: pickAnchored } = scoreCandidate(
    tripId,
    pointerAnchor,
    fallbackVisibleTrip,
    true,
  );
  let pick = pickAnchored;
  let anchorRelaxed = false;
  let candidatesListed = candidatesAnchored;
  let unanchoredCandidatesLen = 0;
  if (!pick && pointerAnchor) {
    const second = scoreCandidate(tripId, pointerAnchor, fallbackVisibleTrip, false);
    pick = second.pick;
    anchorRelaxed = Boolean(pick);
    unanchoredCandidatesLen = second.candidates.length;
    if (pick) candidatesListed = second.candidates;
  }

  const chosen = pick?.trip;
  const strictReady = chosen ? validatePairingSummaryPaintReady(chosen, pointerAnchor).ok : false;

  const anyCandidatesCollected =
    candidatesAnchored.length > 0 || (pointerAnchor != null && unanchoredCandidatesLen > 0);

  const decision: FirstPaintDecisionPayload = {
    pairingCode: pointer?.pairingCode ?? fallbackVisibleTrip?.pairingCode ?? null,
    selectedDateIso: pointerAnchor,
    selectedMonthKey: monthCenterResolved ?? null,
    routeTripId: tripId,
    stashExists: Boolean(entry),
    warmSnapshotExists: warmExists,
    committedSnapshotKeysFound: committedKeys,
    candidateCount: candidatesListed.length,
    selectedCandidateId: chosen?.id ?? null,
    selectedCandidateRoute: chosen?.routeSummary ?? null,
    selectedCandidateBase: chosen?.base ?? null,
    selectedCandidateStatsPresent: chosen ? statFieldsPresent(chosen) : 0,
    selectedSource: pick?.source ?? null,
    instantPaintable: Boolean(pick),
    strictReady,
    rejectionReason: pick ? null : anyCandidatesCollected ? 'no_candidate_passed_filters' : 'no_candidates_collected',
    anchorRelaxed,
  };

  return { pick, decision };
}

/**
 * Highest-quality sync snapshot safe for immediate paint (month/cache/overlay), ordered per handoff policy.
 */
export function pickBestInstantPaintTrip(
  tripId: string,
  anchorIso: string | null | undefined,
  fallbackVisibleTrip: CrewScheduleTrip | null | undefined,
): InstantPaintPick | null {
  return buildPairingFirstPaintDecision(tripId, anchorIso, fallbackVisibleTrip).pick;
}

/** @deprecated Prefer {@link pickBestInstantPaintTrip} */
export function trySyncRenderablePairingSnapshot(tripId: string): CrewScheduleTrip | null {
  return pickBestInstantPaintTrip(tripId, null, null)?.trip ?? null;
}

export type ResolveRenderablePairingSnapshotResult = {
  trip: CrewScheduleTrip;
  meta: ScheduleTripMetadataRow | null;
  source: string;
};

/**
 * Full resolver: stash / warm / committed → DB UUID → legacy entries. Network rows need strict OR DB-enriched.
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
    return finalizeAsyncCandidate(tripId, raw, meta, anchorIso, source);
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
