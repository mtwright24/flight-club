import { useCallback, useState } from 'react';
import { inboundAircraftFetch } from '../api/flightTrackerService';
import type { NormalizedFlightTrackerResult } from '../types';

export function useInboundAircraft() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    flight: NormalizedFlightTrackerResult;
    riskLevel: string;
    minutesLate: number | null;
  } | null>(null);

  const load = useCallback(
    async (params: Parameters<typeof inboundAircraftFetch>[0]) => {
      setLoading(true);
      setError(null);
      try {
        const res = await inboundAircraftFetch(params);
        setData({ flight: res.flight, riskLevel: res.riskLevel, minutesLate: res.minutesLate });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Inbound aircraft lookup failed.');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, data, load };
}
