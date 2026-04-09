import { useCallback, useState } from 'react';
import { airportBoardFetch, flightTrackerDevLog } from '../api/flightTrackerService';
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
      if (res.rows.length === 0) {
        flightTrackerDevLog('airport-board', 'empty_rows', { airportCode, boardType, source: res.source });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Airport board unavailable.';
      flightTrackerDevLog('airport-board', 'invoke_failed', { message: msg });
      setError(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, rows, load };
}
