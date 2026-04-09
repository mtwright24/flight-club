import { useCallback, useEffect, useState } from 'react';
import { listTrackedFlightsFromDb } from '../api/flightTrackerService';
import type { TrackedFlightRow } from '../types';

export function useTrackedFlights(userId: string | null) {
  const [rows, setRows] = useState<TrackedFlightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listTrackedFlightsFromDb(userId);
      setRows(data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to load tracked flights.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}
