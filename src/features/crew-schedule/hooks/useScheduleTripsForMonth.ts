import { useCallback, useEffect, useState } from 'react';
import {
  fetchScheduleEntriesForMonth,
  fetchScheduleMonthMetrics,
  fetchTripMetadataForTripGroups,
  mergeTripMetadataIntoTrips,
} from '../scheduleApi';
import type { ScheduleEntryRow } from '../scheduleApi';
import { enrichTripsWithLedgerContext } from '../ledgerContext';
import { mergeLedgerPairingBlocks } from '../pairingBlockMerge';
import {
  entriesToTrips,
  mergeCarryInTripsByContiguousPairing,
  mergeTripsWithPriorMonthRows,
} from '../tripMapper';
import { attachCanonicalPairingDaysToTrips } from '../pairingDayApply';
import { fetchPairingCalendarBlocksForBatchIds, uniqueBatchIdsFromEntryRows } from '../pairingDayFetch';
import { supabase } from '../../../lib/supabaseClient';
import type { CrewScheduleTrip, ScheduleMonthMetrics } from '../types';

export function useScheduleTripsForMonth(year: number, month: number) {
  const [trips, setTrips] = useState<CrewScheduleTrip[]>([]);
  const [monthMetrics, setMonthMetrics] = useState<ScheduleMonthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (opts?: { isPull?: boolean; silent?: boolean }) => {
      const isPull = opts?.isPull === true;
      const silent = opts?.silent === true;
      if (!silent) {
        if (isPull) setRefreshing(true);
        else setLoading(true);
      }
      setError(null);
      try {
        const prevM = month === 1 ? 12 : month - 1;
        const prevY = month === 1 ? year - 1 : year;
        const nextM = month === 12 ? 1 : month + 1;
        const nextY = month === 12 ? year + 1 : year;
        const [rows, prevRows, nextRows] = await Promise.all([
          fetchScheduleEntriesForMonth(year, month),
          fetchScheduleEntriesForMonth(prevY, prevM).catch(() => [] as ScheduleEntryRow[]),
          fetchScheduleEntriesForMonth(nextY, nextM).catch(() => [] as ScheduleEntryRow[]),
        ]);
        const tripGroups = [...new Set(rows.map((r) => r.trip_group_id))];
        const [metrics, meta] = await Promise.all([
          fetchScheduleMonthMetrics(year, month).catch(() => null),
          tripGroups.length > 0 ? fetchTripMetadataForTripGroups(tripGroups).catch(() => []) : Promise.resolve([]),
        ]);
        setMonthMetrics(metrics);
        const baseTrips = entriesToTrips(rows);
        const idMerged = mergeTripsWithPriorMonthRows(baseTrips, rows, prevRows, year, month);
        const mergedCarry = mergeCarryInTripsByContiguousPairing(idMerged, rows, prevRows, year, month);
        const mergedBlocks = mergeLedgerPairingBlocks(mergedCarry, 1);
        const batchIds = uniqueBatchIdsFromEntryRows([rows, prevRows, nextRows]);
        let withCanon: CrewScheduleTrip[] = mergedBlocks;
        if (batchIds.length) {
          const { data: auth } = await supabase.auth.getUser();
          const uid = auth.user?.id;
          if (uid) {
            try {
              const blocks = await fetchPairingCalendarBlocksForBatchIds(uid, batchIds, year, month);
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
        setTrips(mergeTripMetadataIntoTrips(withLedger, meta));
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setTrips([]);
        setMonthMetrics(null);
      } finally {
        if (!silent) {
          if (isPull) setRefreshing(false);
          else setLoading(false);
        }
      }
    },
    [year, month]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    trips,
    monthMetrics,
    loading,
    refreshing,
    error,
    /** Pull-to-refresh. */
    refresh: () => load({ isPull: true }),
    /** Re-fetch when tab gains focus without blocking UI. */
    refreshSilent: () => load({ silent: true }),
  };
}
