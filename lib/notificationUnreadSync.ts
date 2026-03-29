/**
 * Unified unread / badge sync — counts always come from Supabase recounts, not push payloads.
 *
 * **Bell:** `countUnreadNotificationsForUser` (dedupes conversation rows by `entity_id`).
 * **DM cloud:** `getUnreadCounts().messages` → `countDmCloudBadgeThreads` (same as inbox).
 */

import { notifyDmUnreadBadgeRefresh, refreshDmUnreadBadgeCount } from './dmUnreadBadgeStore';
import { notifyNotificationsBadgeRefresh, refreshNotificationsBadgeCount } from './notificationsBadgeStore';

export async function refreshAllBadgeCountsFromServer(): Promise<void> {
  await Promise.all([refreshNotificationsBadgeCount(), refreshDmUnreadBadgeCount()]);
}

/** Debounced recounts via each store (use after realtime INSERT or mark-read). */
export function notifyAllBadgeCachesRefresh(): void {
  notifyNotificationsBadgeRefresh();
  notifyDmUnreadBadgeRefresh();
}

export { countUnreadNotificationsForUser } from './notifications';
export { getUnreadCounts } from './home';
