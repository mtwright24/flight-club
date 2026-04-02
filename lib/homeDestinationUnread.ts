import type { NotificationItem } from '../components/ActivityPreview';
import { isNotificationUnreadRow } from './activityHomeBuckets';
import { parseNotificationData } from './notifications';
import type { Notification } from './notifications';
import { notificationTargetHref } from './notifications';

export type HomeTileId = 'crew-schedule' | 'staff-loads' | 'pad-housing' | 'flight-tracker';

function hrefString(n: NotificationItem): string {
  return String(notificationTargetHref(n as unknown as Notification));
}

/** Unread notification whose deep link maps to a Home top tile destination. */
export function hasTileUnread(tileId: HomeTileId, items: NotificationItem[]): boolean {
  return items.some((n) => isNotificationUnreadRow(n) && tileMatchesNotification(tileId, n));
}

function tileMatchesNotification(tileId: HomeTileId, n: NotificationItem): boolean {
  const h = hrefString(n).toLowerCase();
  const t = (n.type || '').trim();
  switch (tileId) {
    case 'crew-schedule':
      return (
        h.includes('/crew-schedule') ||
        h.includes('/crew-exchange') ||
        h.includes('/exchange') ||
        t.startsWith('trade_') ||
        t === 'calendar_event' ||
        t === 'schedule_reminder'
      );
    case 'staff-loads':
      return h.includes('/loads') || t.startsWith('loads_') || t.includes('load') || t.includes('nonrev') || t.includes('standby');
    case 'pad-housing':
      return (
        h.includes('crashpad') ||
        h.includes('/housing') ||
        h.includes('crashpads') ||
        t.startsWith('housing_') ||
        t.includes('listing')
      );
    case 'flight-tracker':
      return (
        h.includes('/flight-tracker') ||
        t.includes('commute') ||
        t.includes('delay') ||
        t.includes('flight_tracker') ||
        t === 'tool_alert' ||
        t === 'rest_warning'
      );
    default:
      return false;
  }
}

/** Pinned crew room shortcut: unread tied to that room. */
export function hasPinnedRoomUnread(roomId: string, items: NotificationItem[]): boolean {
  const rid = String(roomId || '').trim();
  if (!rid) return false;
  return items.some((n) => {
    if (!isNotificationUnreadRow(n)) return false;
    const d = parseNotificationData(n as { data?: unknown }) as Record<string, unknown>;
    const entityRoom = String(d.room_id ?? d.crew_room_id ?? '').trim();
    if (entityRoom && entityRoom === rid) return true;
    const h = hrefString(n);
    return h.includes(rid) || (h.includes('crew-rooms') && h.includes(rid));
  });
}

/** Tool shortcut chip: unread whose route matches this tool's route prefix. */
export function hasToolShortcutUnread(route: string, items: NotificationItem[]): boolean {
  const r = String(route || '').trim().toLowerCase().replace(/^\//, '');
  if (!r) return false;
  return items.some((n) => {
    if (!isNotificationUnreadRow(n)) return false;
    const h = hrefString(n).toLowerCase();
    return h.includes(r.split('?')[0] || r);
  });
}
