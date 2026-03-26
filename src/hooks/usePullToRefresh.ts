import { useCallback, useState } from 'react';

/**
 * Same pattern as Social Feed (`FeedScreen`): pull-to-refresh drives an async reload
 * and clears a dedicated `refreshing` flag (separate from initial `loading`).
 */
export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);

  const runRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.resolve(onRefresh());
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  return { refreshing, onRefresh: runRefresh };
}
