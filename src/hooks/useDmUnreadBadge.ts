import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getUnreadCounts } from '../../lib/home';
import { useAuth } from './useAuth';

/**
 * Same source as Messages inbox / home red header: `getUnreadCounts().messages`
 * = count of `dm_messages` rows where `is_read === false` and `sender_id !== current user`
 * in conversations the user participates in (NOT notification rows).
 */
export function useDmUnreadBadge() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    try {
      const { messages } = await getUnreadCounts(userId);
      setCount(messages);
    } catch {
      setCount(0);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    void refresh();
    const interval = setInterval(refresh, 45000);
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void refresh();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [userId, refresh]);

  return count;
}
