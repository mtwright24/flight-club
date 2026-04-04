import { markNotificationsRead } from '../notifications';

export async function markNotificationReadFromPushPayload(data: Record<string, unknown>): Promise<void> {
  const raw = data.notification_id ?? data.notificationId;
  const id = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  if (!id) return;
  await markNotificationsRead([id]);
}
