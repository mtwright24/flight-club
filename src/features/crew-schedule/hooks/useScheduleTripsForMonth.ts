import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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
  const [error, setError] = useState<Error | null>(null);

  /** Paint cached month before first paint so back/forth between months feels instant once warmed. */
  useLayoutEffect(() => {
    const key = monthCalendarKey(year, month);
    const hit = readScheduleMonthCache(key);
    if (hit) {
      setTrips(hit.trips);
      setMonthMetrics(hit.monthMetrics);
      setLoading(false);
      setError(null);
    }
  }, [year, month]);

  const load = useCallback(
    async (opts?: { isPull?: boolean; silent?: boolean }) => {
      const isPull = opts?.isPull === true;
      const silent = opts?.silent === true;
      const key = monthCalendarKey(year, month);
      if (!silent) {
        if (isPull) setRefreshing(true);
        else if (!readScheduleMonthCache(key)) setLoading(true);
      }
      setError(null);
      try {
        const data = await dedupFetchScheduleMonth(year, month);
        setTrips(data.trips);
        setMonthMetrics(data.monthMetrics);
        if (!silent && !isPull) prefetchAdjacentMonths(year, month);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        if (!silent && !readScheduleMonthCache(key)) {
          setTrips([]);
          setMonthMetrics(null);
        }
      } finally {
        if (!silent) {
          if (isPull) setRefreshing(false);
          else setLoading(false);
        }
      }
    },
    [year, month],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /** Stable identities — consumers (e.g. ScheduleTabScreen useFocusEffect deps) must not change every render. */
  const refresh = useCallback(() => load({ isPull: true }), [load]);
  const refreshSilent = useCallback(() => load({ silent: true }), [load]);

  return {
    trips,
    monthMetrics,
    loading,
    refreshing,
    error,
    /** Pull-to-refresh. */
    refresh,
    /** Re-fetch when tab gains focus without blocking UI. */
    refreshSilent,
  };
}
