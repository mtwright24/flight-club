import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  fetchScheduleEntriesForMonth,
  fetchScheduleMonthMetrics,
  fetchTripMetadataForTripGroups,
  mergeScheduleEntriesLegDatePreferring,
  mergeTripMetadataIntoTrips,
} from '../scheduleApi';
import type { ScheduleEntryRow } from '../scheduleApi';
import { fetchScheduleEntriesForViewMonthByLegDate } from '../pairingDayModel';
import { enrichTripsWithLedgerContext } from '../ledgerContext';
import { mergeLedgerPairingBlocks } from '../pairingBlockMerge';
import {
  entriesToTrips,
  mergeCarryInTripsByContiguousPairing,
  mergeTripsWithPriorMonthRows,
} from '../tripMapper';
import { attachCanonicalPairingDaysToTrips } from '../pairingDayApply';
import {
  fetchPairingCalendarBlocksByPairingIdsForUserMonth,
  fetchPairingCalendarBlocksForBatchIds,
  mergePairingBlockLists,
  uniqueBatchIdsFromEntryRows,
} from '../pairingDayFetch';
import {
  monthCalendarKey,
  readScheduleMonthCache,
  writeScheduleMonthCache,
  type ScheduleMonthCached,
} from '../scheduleMonthCache';
import {
  isScheduleMonthUISnapshotCoherent,
  readScheduleMonthUISnapshot,
} from '../scheduleSnapshotCache';
import {
  commitMonthSnapshotAtomic,
  computeStableMonthIdentityKey,
  readCommittedMonthSnapshot,
} from '../scheduleStableSnapshots';
import { supabase } from '../../../lib/supabaseClient';
import type { CrewScheduleTrip, ScheduleMonthMetrics } from '../types';
import { isFlicaNonFlyingActivityId } from '../../../services/flicaScheduleHtmlParser';

const inflight = new Map<string, Promise<ScheduleMonthCached>>();

/** `month_key` OR calendar `date` in month — leg-date rows win on id (display-only; no import RPC change). */
async function fetchScheduleEntriesMerged(year: number, month: number): Promise<ScheduleEntryRow[]> {
  const keyRows = await fetchScheduleEntriesForMonth(year, month);
  const legRows = await fetchScheduleEntriesForViewMonthByLegDate(year, month).catch(() => null);
  if (!legRows?.length) return keyRows;
  return mergeScheduleEntriesLegDatePreferring(keyRows, legRows);
}

async function fetchScheduleMonthData(year: number, month: number): Promise<ScheduleMonthCached> {
  const prevM = month === 1 ? 12 : month - 1;
  const prevY = month === 1 ? year - 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const nextY = month === 12 ? year + 1 : year;
  const [rows, prevRows, nextRows] = await Promise.all([
    fetchScheduleEntriesMerged(year, month),
    fetchScheduleEntriesMerged(prevY, prevM).catch(() => [] as ScheduleEntryRow[]),
    fetchScheduleEntriesMerged(nextY, nextM).catch(() => [] as ScheduleEntryRow[]),
  ]);
  const tripGroups = [...new Set(rows.map((r) => r.trip_group_id))];
  const [metrics, meta] = await Promise.all([
    fetchScheduleMonthMetrics(year, month).catch(() => null),
    tripGroups.length > 0 ? fetchTripMetadataForTripGroups(tripGroups).catch(() => []) : Promise.resolve([]),
  ]);
  const baseTrips = entriesToTrips(rows);
  const idMerged = mergeTripsWithPriorMonthRows(baseTrips, rows, prevRows, year, month);
  const mergedCarry = mergeCarryInTripsByContiguousPairing(idMerged, rows, prevRows, year, month);
  const mergedBlocks = mergeLedgerPairingBlocks(mergedCarry, 1);
  const batchIds = uniqueBatchIdsFromEntryRows([rows, prevRows, nextRows]);
  const pairingCodesForCanon = [
    ...new Set(
      mergedCarry
        .map((t) =>
          String(t.pairingCode ?? '')
            .trim()
            .toUpperCase(),
        )
        .filter(
          (c) =>
            Boolean(
              c &&
                c !== 'CONT' &&
                c !== '—' &&
                c !== 'RDO' &&
                !isFlicaNonFlyingActivityId(c),
            ),
        ),
    ),
  ];
  let withCanon: CrewScheduleTrip[] = mergedBlocks;
  if (batchIds.length || pairingCodesForCanon.length) {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (uid) {
      try {
        const fromBatch = batchIds.length
          ? await fetchPairingCalendarBlocksForBatchIds(uid, batchIds, year, month)
          : [];
        const fromCodes = pairingCodesForCanon.length
          ? await fetchPairingCalendarBlocksByPairingIdsForUserMonth(uid, pairingCodesForCanon, year, month)
          : [];
        const blocks = mergePairingBlockLists(fromBatch, fromCodes);
        withCanon = attachCanonicalPairingDaysToTrips(mergedBlocks, blocks);
      } catch {
        withCanon = mergedBlocks;
      }
    }
  }
  const withLedger = enrichTripsWithLedgerContext(withCanon, prevRows, nextRows, {
    currentMonthRows: rows,
    viewYear: year,
    viewMonth: month,
  });
  const trips = mergeTripMetadataIntoTrips(withLedger, meta);
  return { trips, monthMetrics: metrics };
}

async function dedupFetchScheduleMonth(year: number, month: number): Promise<ScheduleMonthCached> {
  const key = monthCalendarKey(year, month);
  let p = inflight.get(key);
  if (!p) {
    p = fetchScheduleMonthData(year, month)
      .then((data) => {
        writeScheduleMonthCache(key, data);
        return data;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, p);
  }
  return p;
}

/** Hydrate month cache the same way as the schedule tab (for post-import navigation gate). */
export function prefetchScheduleMonthSnapshot(year: number, month: number): Promise<ScheduleMonthCached> {
  return dedupFetchScheduleMonth(year, month);
}

function prefetchAdjacentMonths(centerYear: number, centerMonth: number): void {
  const neighbors: readonly [number, number][] = [
    centerMonth === 1 ? [centerYear - 1, 12] : [centerYear, centerMonth - 1],
    centerMonth === 12 ? [centerYear + 1, 1] : [centerYear, centerMonth + 1],
  ];
  requestAnimationFrame(() => {
    for (const [y, m] of neighbors) {
      const k = monthCalendarKey(y, m);
      if (readScheduleMonthCache(k)) continue;
      void dedupFetchScheduleMonth(y, m).catch(() => {
        /* best-effort warmup */
      });
    }
  });
}

export function useScheduleTripsForMonth(year: number, month: number) {
  const [trips, setTrips] = useState<CrewScheduleTrip[]>([]);
  const [monthMetrics, setMonthMetrics] = useState<ScheduleMonthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  /** Latest calendar month key (year/month) the hook should apply network results to. */
  const targetMonthKeyRef = useRef(monthCalendarKey(year, month));
  /** Monotonic token for in-flight month builds — bumps when `(year,month)` changes. */
  const monthBuildGenerationRef = useRef(0);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useLayoutEffect(() => {
    const key = monthCalendarKey(year, month);
    targetMonthKeyRef.current = key;
    monthBuildGenerationRef.current += 1;
    const gen = monthBuildGenerationRef.current;

    if (userIdRef.current) {
      const c = readCommittedMonthSnapshot(key);
      if (c && c.userId === userIdRef.current) {
        setTrips(c.trips);
        setMonthMetrics(c.monthMetrics);
        setLoading(false);
        setError(null);
        return;
      }
    }

    const hit = readScheduleMonthCache(key);
    if (hit) {
      setTrips(hit.trips);
      setMonthMetrics(hit.monthMetrics);
      setLoading(false);
      setError(null);
      return;
    }
    const uiSnap = readScheduleMonthUISnapshot(key);
    if (uiSnap && isScheduleMonthUISnapshotCoherent(uiSnap, year, month)) {
      setTrips(uiSnap.trips);
      setMonthMetrics(uiSnap.monthMetrics);
      setLoading(false);
      setError(null);
      return;
    }
    if (gen === monthBuildGenerationRef.current) {
      setTrips([]);
      setMonthMetrics(null);
      setLoading(true);
      setError(null);
    }
  }, [year, month]);

  useEffect(() => {
    if (!userId) return;
    const key = monthCalendarKey(year, month);
    if (targetMonthKeyRef.current !== key) return;
    const c = readCommittedMonthSnapshot(key);
    if (c?.userId === userId) {
      setTrips(c.trips);
      setMonthMetrics(c.monthMetrics);
      setLoading(false);
      setError(null);
    }
  }, [userId, year, month]);

  const load = useCallback(
    async (opts?: { isPull?: boolean; silent?: boolean }) => {
      const isPull = opts?.isPull === true;
      const silent = opts?.silent === true;
      const key = monthCalendarKey(year, month);
      const buildGenAtStart = monthBuildGenerationRef.current;

      if (!silent) {
        if (isPull) setRefreshing(true);
        else if (!readScheduleMonthCache(key) && !readScheduleMonthUISnapshot(key) && !readCommittedMonthSnapshot(key)) {
          setLoading(true);
        }
      }
      setError(null);
      try {
        const data = await dedupFetchScheduleMonth(year, month);
        if (targetMonthKeyRef.current !== key || buildGenAtStart !== monthBuildGenerationRef.current) {
          return;
        }
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id ?? 'anon';
        const identityKey = computeStableMonthIdentityKey({
          userId: uid,
          year,
          month,
          trips: data.trips,
          monthMetrics: data.monthMetrics,
        });

        setTrips(data.trips);
        setMonthMetrics(data.monthMetrics);
        commitMonthSnapshotAtomic({
          monthCalendarKey: key,
          userId: uid,
          identityKey,
          trips: data.trips,
          monthMetrics: data.monthMetrics,
        });
        if (!silent && !isPull) prefetchAdjacentMonths(year, month);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        const uiSnap = readScheduleMonthUISnapshot(key);
        const stillTarget = targetMonthKeyRef.current === key;
        if (!stillTarget) {
          return;
        }
        if (!readScheduleMonthCache(key) && !(uiSnap && isScheduleMonthUISnapshotCoherent(uiSnap, year, month))) {
          const committed = readCommittedMonthSnapshot(key);
          if (!committed) {
            setTrips([]);
            setMonthMetrics(null);
          }
        }
      } finally {
        if (!silent) {
          if (isPull) setRefreshing(false);
          else if (targetMonthKeyRef.current === key) setLoading(false);
        }
      }
    },
    [year, month],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => load({ isPull: true }), [load]);
  const refreshSilent = useCallback(() => load({ silent: true }), [load]);

  return {
    trips,
    monthMetrics,
    loading,
    refreshing,
    backgroundRefreshing,
    error,
    refresh,
    refreshSilent,
  };
}
