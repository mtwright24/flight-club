import { useCallback, useState } from 'react';
import { saveTrackedFlight } from '../api/flightTrackerService';
import type { NormalizedFlightTrackerResult } from '../types';

export function useSaveTrackedFlight() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async (flight: NormalizedFlightTrackerResult, options?: { isPinned?: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      return await saveTrackedFlight(flight, options);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to save flight.');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return { saving, error, save };
}
