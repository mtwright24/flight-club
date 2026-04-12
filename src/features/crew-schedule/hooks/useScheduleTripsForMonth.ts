import { useCallback, useEffect, useState } from 'react';
import {
  fetchScheduleEntriesForMonth,
  fetchScheduleMonthMetrics,
  fetchTripMetadataForTripGroups,
  mergeTripMetadataIntoTrips,
} from '../scheduleApi';
import { entriesToTrips } from '../tripMapper';
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
        const rows = await fetchScheduleEntriesForMonth(year, month);
        const tripGroups = [...new Set(rows.map((r) => r.trip_group_id))];
        const [metrics, meta] = await Promise.all([
          fetchScheduleMonthMetrics(year, month).catch(() => null),
          tripGroups.length > 0 ? fetchTripMetadataForTripGroups(tripGroups).catch(() => []) : Promise.resolve([]),
        ]);
        setMonthMetrics(metrics);
        setTrips(mergeTripMetadataIntoTrips(entriesToTrips(rows), meta));
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
