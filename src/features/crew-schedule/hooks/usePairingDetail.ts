import { useEffect, useState } from 'react';
import { fetchPairingDetailByPairingUuid, type PairingDetailBundle } from '../scheduleApi';

/**
 * Loads `schedule_pairings` + duties + legs + `schedule_pairing_crew` / `schedule_pairing_hotels`
 * for one pairing UUID (same as `CrewScheduleTrip.id`).
 */
export function usePairingDetail(pairingUuid: string | undefined): {
  data: PairingDetailBundle | null;
  loading: boolean;
  error: Error | null;
} {
  const [data, setData] = useState<PairingDetailBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!pairingUuid?.trim()) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPairingDetailByPairingUuid(pairingUuid)
      .then((b) => {
        if (!cancelled) setData(b);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pairingUuid]);

  return { data, loading, error };
}
