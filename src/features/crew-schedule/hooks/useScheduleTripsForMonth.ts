import { useCallback, useEffect, useState } from 'react';
import { fetchScheduleEntriesForMonth } from '../scheduleApi';
import { entriesToTrips } from '../tripMapper';
import type { CrewScheduleTrip } from '../types';

export function useScheduleTripsForMonth(year: number, month: number) {
  const [trips, setTrips] = useState<CrewScheduleTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchScheduleEntriesForMonth(year, month);
      setTrips(entriesToTrips(rows));
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { trips, loading, error, refresh };
}
