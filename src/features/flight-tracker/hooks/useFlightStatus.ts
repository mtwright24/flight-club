import { useCallback, useState } from 'react';
import { flightStatus } from '../api/flightTrackerService';
import type { NormalizedFlightTrackerResult } from '../types';

export function useFlightStatus() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flight, setFlight] = useState<NormalizedFlightTrackerResult | null>(null);

  const load = useCallback(
    async (params: {
      carrierCode: string;
      flightNumber: string;
      flightDate: string;
      providerFlightId?: string | null;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await flightStatus(params);
        setFlight(res.flight);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Flight status unavailable.');
        setFlight(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, flight, load };
}
