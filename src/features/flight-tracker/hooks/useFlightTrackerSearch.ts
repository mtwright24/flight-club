import { useCallback, useState } from 'react';
import { flightSearch, flightTrackerDevLog } from '../api/flightTrackerService';
import type { NormalizedSearchResultItem } from '../types';

export function useFlightTrackerSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<NormalizedSearchResultItem[]>([]);

  const search = useCallback(async (q: string, date?: string) => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await flightSearch(query, date);
      setResults(res.results);
      if (res.results.length === 0) {
        flightTrackerDevLog('search', 'empty_results', { source: res.source });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Flight Tracker search failed.';
      flightTrackerDevLog('search', 'invoke_failed', { message: msg });
      setError(msg);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, results, search, setError };
}
