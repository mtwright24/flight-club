import type { Href } from 'expo-router';
import type { Notification } from './notifications';
import { notificationPathToHref } from './notificationPathMapping';
import { parseNotificationData } from './notificationPayload';
import {
  canonicalNotificationType,
  resolveRouteFromRegistry,
  type NotificationRouteContext,
  type NotificationTypeKey,
} from './notificationRegistry';

/**
 * Central Flight Club routing for notification taps: push (foreground/background),
 * in-app banner taps, and notification inbox rows. All paths go through here.
 */

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** Canonical registry key for a raw `type` string (push + DB aliases). */
export function normalizeNotificationTypeForRouting(raw: unknown): string | undefined {
  const t = pickStr(raw);
  if (!t) return undefined;
  return canonicalNotificationType(t) ?? undefined;
}

/** @internal Exported from `notifications.ts` for route string normalization. */
export function normalizeStoredNotificationRoute(path: string): string {
  const trimmed = (path || '').trim();
  if (!trimmed) return trimmed;

  const noComments = trimmed.match(/^\/post\/([^/?#]+)\/comments\/?(?:[?#]|$)/);
  if (noComments) {
    return `/post/${noComments[1]}`;
  }

  const roomPostId = trimmed.match(/^\/room-post\/([^/?#]+)\/?(?:[?#]|$)/);
  if (roomPostId) {
    return `/room-post-detail?postId=${encodeURIComponent(roomPostId[1])}`;
  }

  return trimmed;
}

function coalesceEntityId(key: NotificationTypeKey, data: Record<string, unknown>): string {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = data[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };

  switch (key) {
    case 'message':
    case 'message_request':
    case 'message_request_accepted':
    case 'message_reaction':
    case 'message_media':
      return pick('entity_id', 'conversation_id', 'conversationId', 'thread_id');
    case 'room_post':
    case 'crew_room_reply':
    case 'room_mention':
    case 'room_pinned_post':
      return pick('entity_id', 'post_id', 'postId');
    case 'room_invite':
    case 'room_join_request':
    case 'room_join_approved':
    case 'room_join_denied':
    case 'room_role_changed':
    case 'room_announcement':
      return pick('entity_id', 'room_id', 'roomId');
    case 'like_post':
    case 'comment_post':
    case 'reply_comment':
    case 'mention_post':
    case 'mention_comment':
    case 'repost_post':
      return pick('entity_id', 'post_id', 'postId');
    case 'follow':
    case 'follow_request':
    case 'follow_accept':
      return pick('entity_id', 'profile_id', 'user_id', 'actor_id');
    case 'trade_interest':
    case 'trade_match':
    case 'trade_message':
    case 'trade_update':
    case 'trade_closed':
    case 'trade_expiring':
      return pick('entity_id', 'trade_id', 'swap_id', 'match_id');
    case 'housing_inquiry':
    case 'housing_reply':
    case 'housing_listing_saved_match':
    case 'housing_listing_update':
    case 'housing_listing_expiring':
    case 'housing_availability_match':
      return pick('entity_id', 'listing_id', 'listingId', 'crashpad_id');
    case 'loads_alert':
    case 'loads_route_update':
    case 'loads_watch_match':
    case 'loads_threshold_hit':
      return pick('entity_id', 'load_id', 'loadId', 'watch_id');
    default:
      return pick('entity_id');
  }
}

function inferEntityType(key: NotificationTypeKey, data: Record<string, unknown>, entityId: string): string {
  const existing = pickStr(data.entity_type);
  if (existing) return existing;

  switch (key) {
    case 'message':
    case 'message_request':
    case 'message_reaction':
    case 'message_media':
      return 'conversation';
    case 'room_post':
    case 'crew_room_reply':
    case 'room_mention':
      return 'room_post';
    case 'room_invite':
    case 'room_join_request':
    case 'room_join_approved':
    case 'room_join_denied':
    case 'room_role_changed':
    case 'room_announcement':
      return 'room';
    case 'like_post':
    case 'comment_post':
    case 'reply_comment':
    case 'mention_post':
      return 'post';
    case 'follow':
    case 'follow_request':
      return 'profile';
    case 'trade_match':
    case 'trade_interest':
      return entityId ? 'trade' : 'unknown';
    case 'housing_listing_saved_match':
    case 'housing_inquiry':
      return 'listing';
    default:
      return 'unknown';
  }
}

/**
 * Build a registry context from a push payload or merged inbox row + `data` JSON.
 * Returns `null` when the notification type cannot be resolved safely.
 */
export function buildNotificationRouteContextFromPayload(
  data: Record<string, unknown> | null | undefined
): NotificationRouteContext | null {
  if (!data || typeof data !== 'object') return null;

  const rawType = pickStr(data.type, data.notification_type);
  if (!rawType) return null;

  const canonicalKey = canonicalNotificationType(rawType);
  if (!canonicalKey) {
    if (__DEV__) {
      console.warn('[NotificationRouting] Unknown notification type:', rawType);
    }
    return null;
  }

  let entity_id = coalesceEntityId(canonicalKey, data);
  if (!entity_id) {
    entity_id = pickStr(data.entity_id, data.entityId) ?? '';
  }

  let entity_type = pickStr(data.entity_type) ?? inferEntityType(canonicalKey, data, entity_id);

  const secondary_id =
    pickStr(data.secondary_id, data.secondaryId) ??
    (canonicalKey === 'message_request'
      ? pickStr(data.request_id, data.dm_request_id)
      : undefined) ??
    null;

  return {
    type: canonicalKey,
    entity_type,
    entity_id,
    secondary_id,
    data,
  };
}

function fallbackPathFromEntityFields(data: Record<string, unknown>): string | null {
  const et = pickStr(data.entity_type);
  const eid = pickStr(data.entity_id);
  if (!et || !eid) return null;

  switch (et) {
    case 'post':
      return `/post/${encodeURIComponent(eid)}`;
    case 'comment': {
      const pid = pickStr(data.post_id);
      if (pid) return `/post/${encodeURIComponent(pid)}`;
      return `/post/${encodeURIComponent(eid)}`;
    }
    case 'room':
      return `/crew-rooms/${encodeURIComponent(eid)}`;
    case 'room_post':
      return `/room-post-detail?postId=${encodeURIComponent(eid)}`;
    case 'profile':
      return `/profile/${encodeURIComponent(eid)}`;
    case 'conversation': {
      const rid = pickStr(data.request_id, data.dm_request_id) ?? '';
      const t = pickStr(data.type, data.notification_type);
      const canon = t ? canonicalNotificationType(t) : null;
      const isReq = t === 'message_request' || canon === 'message_request';
      if (isReq && rid) {
        return `/dm-thread?conversationId=${encodeURIComponent(eid)}&requestId=${encodeURIComponent(rid)}`;
      }
      return `/dm-thread?conversationId=${encodeURIComponent(eid)}`;
    }
    default:
      return null;
  }
}

function applyMissingIdGuards(path: string, ctx: NotificationRouteContext | null): string {
  if (!ctx) return path;

  const { type, entity_id } = ctx;
  const id = (entity_id || '').trim();

  if (
    (type === 'message' ||
      type === 'message_request' ||
      type === 'message_reaction' ||
      type === 'message_media') &&
    !id
  ) {
    return '/messages-inbox';
  }

  if (
    (type === 'room_post' ||
      type === 'crew_room_reply' ||
      type === 'room_mention' ||
      type === 'room_pinned_post') &&
    !id
  ) {
    return '/notifications';
  }

  if (
    (type === 'like_post' ||
      type === 'comment_post' ||
      type === 'reply_comment' ||
      type === 'mention_post') &&
    !id
  ) {
    return '/notifications';
  }

  if ((type === 'follow' || type === 'follow_request') && !id) {
    return '/notifications';
  }

  if (path.includes('dm-thread')) {
    try {
      const q = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
      const conversationId = new URLSearchParams(q).get('conversationId');
      if (!conversationId?.trim()) return '/messages-inbox';
    } catch {
      return '/messages-inbox';
    }
  }

  if (path.includes('room-post-detail')) {
    try {
      const q = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
      const postId = new URLSearchParams(q).get('postId');
      if (!postId?.trim()) return '/notifications';
    } catch {
      return '/notifications';
    }
  }

  return path;
}

/**
 * Resolves a notification route path string (not yet an Expo `Href` object for query routes).
 */
export function resolveNotificationPathFromPayload(data: Record<string, unknown> | null | undefined): string {
  if (!data || typeof data !== 'object') {
    return '/notifications';
  }

  const route = pickStr(data.route);
  if (route) {
    return normalizeStoredNotificationRoute(route);
  }

  const ctx = buildNotificationRouteContextFromPayload(data);
  if (ctx) {
    const fromRegistry = resolveRouteFromRegistry(ctx);
    if (fromRegistry !== null) {
      return applyMissingIdGuards(fromRegistry, ctx);
    }
  }

  const fallback = fallbackPathFromEntityFields(data);
  if (fallback) return applyMissingIdGuards(fallback, ctx);

  return '/notifications';
}

/**
 * Single entry point: navigate using the same rules for push, banner tap, and inbox.
 */
export function resolveNotificationHrefFromPayload(data: Record<string, unknown> | null | undefined): Href {
  const path = resolveNotificationPathFromPayload(data);
  const trimmed = (path || '').trim();
  if (!trimmed || trimmed === '/') {
    return '/notifications';
  }
  try {
    return notificationPathToHref(trimmed);
  } catch {
    return '/notifications';
  }
}

/** Merge DB row + JSON `data` for routing (notification list / home panels). */
export function notificationRecordToRoutingPayload(n: Notification): Record<string, unknown> {
  const data = parseNotificationData(n);
  return {
    ...data,
    type: n.type,
    entity_type: n.entity_type,
    entity_id: n.entity_id,
    secondary_id: n.secondary_id ?? pickStr(data.secondary_id) ?? null,
  };
}

export function resolveNotificationHrefFromRecord(n: Notification): Href {
  return resolveNotificationHrefFromPayload(notificationRecordToRoutingPayload(n));
}
