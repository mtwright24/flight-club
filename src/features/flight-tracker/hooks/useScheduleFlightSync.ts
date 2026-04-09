import { useCallback, useState } from 'react';
import { syncScheduleFlight } from '../api/flightTrackerService';
import type { NormalizedFlightTrackerResult } from '../types';

export function useScheduleFlightSync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    syncStatus: string;
    trackedFlightId?: string;
    flight?: NormalizedFlightTrackerResult;
  } | null>(null);

  const sync = useCallback(
    async (params: {
      scheduleItemId: string;
      carrierCode: string;
      flightNumber: string;
      flightDate: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await syncScheduleFlight(params);
        setResult(res);
        return res;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Schedule sync failed.');
        setResult(null);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, result, sync };
}
