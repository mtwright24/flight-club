import { isNotificationUnreadRow } from './activityHomeBuckets';
import { parseNotificationData } from './notifications';
import type { NotificationItem } from '../components/ActivityPreview';

export function pickAvatarUrlFromData(data: unknown): string | undefined {
  const d = parseNotificationData({ data } as { data?: unknown }) as Record<string, unknown>;
  const candidates = [
    d.sender_avatar_url,
    d.actor_avatar_url,
    d.avatar_url,
    d.from_avatar_url,
    d.preview_avatar_url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return undefined;
}

/**
 * Distinct unread actors for the Activity avatar strip (max `max` URIs).
 */
export function collectDistinctAvatarUris(
  items: NotificationItem[],
  include: (n: NotificationItem) => boolean,
  max = 5,
): string[] {
  const uris: string[] = [];
  const seenActorIds = new Set<string>();
  const seenUrlNoActor = new Set<string>();

  for (const it of items) {
    if (!isNotificationUnreadRow(it) || !include(it)) continue;
    const raw = it.actor_avatar_url || pickAvatarUrlFromData(it.data);
    if (!raw || typeof raw !== 'string') continue;
    const u = raw.trim();
    if (!u) continue;
    const aid = (it.actor_id || '').trim();
    if (aid) {
      if (seenActorIds.has(aid)) continue;
      seenActorIds.add(aid);
      uris.push(u);
    } else {
      if (seenUrlNoActor.has(u)) continue;
      seenUrlNoActor.add(u);
      uris.push(u);
    }
    if (uris.length >= max) break;
  }
  return uris;
}
