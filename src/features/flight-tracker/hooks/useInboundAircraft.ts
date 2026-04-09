import { useCallback, useState } from 'react';
import { inboundAircraftFetch, type InboundAircraftData } from '../api/flightTrackerService';

export function useInboundAircraft() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InboundAircraftData | null>(null);

  const load = useCallback(
    async (params: Parameters<typeof inboundAircraftFetch>[0]) => {
      setLoading(true);
      setError(null);
      try {
        const res = await inboundAircraftFetch(params);
        setData(res);
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
