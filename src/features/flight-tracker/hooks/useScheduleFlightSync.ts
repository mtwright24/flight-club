import { useCallback, useState } from 'react';
import { flightTrackerDevLog, syncScheduleFlight } from '../api/flightTrackerService';
import type { NormalizedFlightTrackerResult } from '../types';

export function useScheduleFlightSync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    syncStatus: string;
    trackedFlightId?: string;
    flight?: NormalizedFlightTrackerResult;
    flightKey?: string;
    message?: string;
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
        flightTrackerDevLog('schedule-sync', res.syncStatus === 'matched' ? 'matched' : 'not_found_or_other', {
          syncStatus: res.syncStatus,
        });
        return res;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Schedule sync failed.';
        flightTrackerDevLog('schedule-sync', 'invoke_failed', { message: msg });
        setError(msg);
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
