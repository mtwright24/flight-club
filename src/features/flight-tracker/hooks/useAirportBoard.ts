import { useCallback, useState } from 'react';
import { airportBoardFetch } from '../api/flightTrackerService';
import type { NormalizedBoardRow } from '../types';

export function useAirportBoard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<NormalizedBoardRow[]>([]);

  const load = useCallback(async (airportCode: string, boardType: 'arrivals' | 'departures', date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await airportBoardFetch({ airportCode, boardType, date });
      setRows(res.rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Airport board unavailable.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, rows, load };
}
