import { useEffect, useSyncExternalStore } from 'react';
import {
  getNotificationsBadgeCountSnapshot,
  refreshNotificationsBadgeCount,
  registerNotificationsBadgeUser,
  resetNotificationsBadgeCount,
  subscribeNotificationsBadgeCount,
} from '../../lib/notificationsBadgeStore';
import { useAuth } from './useAuth';

/**
 * Shared bell count (same as `countUnreadNotificationsForUser` / deduped unread).
 * Updates when `notifyNotificationsBadgeRefresh()` runs or realtime/poll fires.
 */
export function useNotificationsBadge(): number {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const count = useSyncExternalStore(
    subscribeNotificationsBadgeCount,
    getNotificationsBadgeCountSnapshot,
    () => 0
  );

  useEffect(() => {
    if (!userId) {
      resetNotificationsBadgeCount();
      return;
    }
    const unregister = registerNotificationsBadgeUser(userId);
    void refreshNotificationsBadgeCount();
    return unregister;
  }, [userId]);

  return count;
}
