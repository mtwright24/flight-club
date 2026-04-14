import type { Notification } from './notifications';

/**
 * Inbox rows that belong in **Crew Schedule → Alerts** (subset of global notifications).
 * Tune as new schedule-related notification types ship.
 */
export function isScheduleScopedNotification(n: Notification): boolean {
  const route = n.data && typeof n.data.route === 'string' ? n.data.route : '';
  if (route.includes('crew-schedule')) return true;

  const t = (n.type || '').toLowerCase();
  if (t.includes('schedule') || t.includes('pairing') || t.includes('trip_trade')) return true;

  const et = (n.entity_type || '').toLowerCase();
  if (et === 'schedule' || et === 'schedule_trip' || et.includes('schedule')) return true;

  const title = (n.title || '').toLowerCase();
  const body = (n.body || '').toLowerCase();
  if (
    title.includes('schedule') ||
    body.includes('crew schedule') ||
    (title.includes('trip') && (title.includes('trade') || title.includes('pairing')))
  ) {
    return true;
  }

  return false;
}
