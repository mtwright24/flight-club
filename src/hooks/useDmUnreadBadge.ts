import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  getDmUnreadBadgeCountSnapshot,
  refreshDmUnreadBadgeCount,
  registerDmUnreadBadgeUser,
  resetDmUnreadBadgeCount,
  subscribeDmUnreadBadgeCount,
} from '../../lib/dmUnreadBadgeStore';
import { useAuth } from './useAuth';

export type DmUnreadBadge = {
  /** Unread DM threads (same semantics as inbox blue dot). */
  count: number;
  refresh: () => Promise<void>;
};

/**
 * Shared count for all headers: same source as `getUnreadCounts().messages`.
 * Updates when `notifyDmUnreadBadgeRefresh()` runs (e.g. after opening a thread).
 */
export function useDmUnreadBadge(): DmUnreadBadge {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const count = useSyncExternalStore(
    subscribeDmUnreadBadgeCount,
    getDmUnreadBadgeCountSnapshot,
    () => 0
  );

  useEffect(() => {
    if (!userId) {
      resetDmUnreadBadgeCount();
      return;
    }
    const unregister = registerDmUnreadBadgeUser(userId);
    void refreshDmUnreadBadgeCount();
    return unregister;
  }, [userId]);

  const refresh = useCallback(() => refreshDmUnreadBadgeCount(), []);

  return useMemo(() => ({ count, refresh }), [count, refresh]);
}
