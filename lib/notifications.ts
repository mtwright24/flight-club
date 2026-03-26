import type { Href } from 'expo-router';
import {
  canonicalNotificationType,
  isPushEligibleForCanonicalType,
  preferenceBucketForType,
  resolveRouteFromRegistry,
} from './notificationRegistry';
import { supabase } from '../src/lib/supabaseClient';

let missingNotificationsTableLogged = false;

export type Notification = {
  id: string;
  created_at: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  entity_type: string;
  entity_id: string;
  secondary_id?: string | null;
  title?: string | null;
  body?: string | null;
  is_read: boolean;
  /** Some live schemas use `read` instead of `is_read` for the recipient flag. */
  read?: boolean;
  /** Optional JSON payload; omit if `notifications.data` column is not deployed. */
  data?: any;
  actor?: {
    display_name?: string;
    avatar_url?: string;
  };
};

/** Normalize `data` when PostgREST returns a string or null. */
export function parseNotificationData(n: Pick<Notification, 'data'>): Record<string, unknown> {
  const d = n.data;
  if (d == null) return {};
  if (typeof d === 'string') {
    try {
      const parsed = JSON.parse(d) as unknown;
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof d === 'object') return d as Record<string, unknown>;
  return {};
}

export async function fetchNotifications(page = 1, pageSize = 30): Promise<Notification[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return [];

  const base = () =>
    supabase
      .from('notifications')
      .select('*, actor:actor_id(display_name, avatar_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

  let { data, error } = await base();

  if (error) {
    const code = (error as any).code;
    const message = String((error as any).message || '');
    if (code === 'PGRST205' || message.includes("Could not find the table 'public.notifications'")) {
      if (!missingNotificationsTableLogged) {
        console.log(
          "[Notifications] notifications table not found; returning 0 notifications. Run the notifications migration in Supabase to enable this feature."
        );
        missingNotificationsTableLogged = true;
      }
      return [];
    }

    // Retry without actor embed (FK / RLS / relationship hints often break the join while rows are readable).
    const { data: plain, error: errPlain } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (!errPlain) {
      return plain || [];
    }
    throw error;
  }

  return data || [];
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .in('id', ids);

  if (error) {
    const code = (error as any).code;
    const message = String((error as any).message || '');
    if (code === 'PGRST205' || message.includes("Could not find the table 'public.notifications'")) {
      if (!missingNotificationsTableLogged) {
        console.log(
          "[Notifications] notifications table not found; skipping markNotificationsRead. Run the notifications migration in Supabase to enable this feature."
        );
        missingNotificationsTableLogged = true;
      }
      return;
    }
    throw error;
  }
  void import('./notificationsBadgeStore')
    .then((m) => m.notifyNotificationsBadgeRefresh())
    .catch(() => {});
}

export async function markAllNotificationsRead(): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)
    .eq('user_id', user.id);

  if (error) {
    const code = (error as any).code;
    const message = String((error as any).message || '');
    if (code === 'PGRST205' || message.includes("Could not find the table 'public.notifications'")) {
      if (!missingNotificationsTableLogged) {
        console.log(
          "[Notifications] notifications table not found; skipping markAllNotificationsRead. Run the notifications migration in Supabase to enable this feature."
        );
        missingNotificationsTableLogged = true;
      }
      return;
    }
    throw error;
  }
  void import('./notificationsBadgeStore')
    .then((m) => m.notifyNotificationsBadgeRefresh())
    .catch(() => {});
}

/**
 * Unread rows for header bell: one unit per **conversation** (not per DM line item).
 * Multiple `notifications` rows can share `entity_id` when `entity_type = 'conversation'` (one per new message).
 */
function dedupeUnreadNotificationRows(
  rows: { entity_type?: string | null; entity_id?: string | null }[]
): number {
  const perConversation = new Set<string>();
  let other = 0;
  for (const r of rows) {
    const et = typeof r.entity_type === 'string' ? r.entity_type.trim().toLowerCase() : '';
    const eid = r.entity_id != null && String(r.entity_id).trim() !== '' ? String(r.entity_id) : '';
    if (et === 'conversation' && eid) {
      perConversation.add(eid);
    } else {
      other += 1;
    }
  }
  return perConversation.size + other;
}

async function tryUnreadNotificationsDeduped(
  userId: string,
  readColumn: 'is_read' | 'read'
): Promise<{ count: number } | { error: unknown }> {
  const { data, error } = await supabase
    .from('notifications')
    .select('entity_type, entity_id')
    .eq('user_id', userId)
    .eq(readColumn, false as any)
    .limit(10000);

  if (error) return { error };
  return { count: dedupeUnreadNotificationRows(data || []) };
}

/**
 * Unread count for a user (header bell). Tries `is_read` first; falls back to `read` when the column name differs.
 * Conversation-linked rows are deduped by `entity_id` so N new messages in one thread = 1 unread unit.
 */
export async function countUnreadNotificationsForUser(userId: string): Promise<number> {
  if (!userId) return 0;

  const primary = await tryUnreadNotificationsDeduped(userId, 'is_read');
  if ('count' in primary) return primary.count;

  const code = (primary.error as any)?.code;
  const message = String((primary.error as any)?.message || '');
  if (code === 'PGRST205' || message.includes("Could not find the table 'public.notifications'")) {
    if (!missingNotificationsTableLogged) {
      console.log(
        "[Notifications] notifications table not found; returning 0 for unread count. Run the notifications migration in Supabase to enable this feature."
      );
      missingNotificationsTableLogged = true;
    }
    return 0;
  }

  const alt = await tryUnreadNotificationsDeduped(userId, 'read');
  if ('count' in alt) return alt.count;

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false as any);

  if (!error) return count ?? 0;

  const msgLower = String((error as any).message || '').toLowerCase();
  if (msgLower.includes('is_read') || msgLower.includes('column')) {
    const head = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false as any);
    if (!head.error) return head.count ?? 0;
  }

  console.warn('[Notifications] Unread count query failed (check notifications schema/RLS):', (error as any)?.message);
  return 0;
}

// Fetch total unread notifications for the current signed-in user
export async function fetchUnreadNotificationsCount(): Promise<number> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return 0;
  return countUnreadNotificationsForUser(user.id);
}

/**
 * Rewrites known legacy or mistaken `data.route` values to paths that match Expo Router files.
 * (e.g. crew room post notifications store `/room-post/:postId`, but `room-post` is the composer.)
 */
function normalizeNotificationDataRoute(path: string): string {
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

export function resolveNotificationRoute(n: Notification): string {
  const data = parseNotificationData(n);
  const fromData = typeof data.route === 'string' ? data.route : '';
  if (fromData) return normalizeNotificationDataRoute(fromData);

  switch (n.entity_type) {
    case 'post':
      return `/post/${n.entity_id}`;
    case 'comment':
      // No `post/[id]/comments` route; post detail already loads comments.
      return `/post/${n.entity_id}`;
    case 'room':
      return `/crew-rooms/${n.entity_id}`;
    case 'room_post':
      return `/room-post-detail?postId=${encodeURIComponent(n.entity_id)}`;
    case 'profile':
      return `/profile/${n.entity_id}`;
    case 'conversation':
      return `/dm-thread?conversationId=${encodeURIComponent(n.entity_id)}`;
    default: {
      const fromRegistry = resolveRouteFromRegistry(n);
      if (fromRegistry !== null) return fromRegistry;
      return '/';
    }
  }
}

/**
 * Map stored notification routes (often `/dm-thread?conversationId=…`) to Expo Router hrefs
 * so params are passed reliably (matches in-app DM navigation).
 */
export function notificationPathToHref(path: string): Href {
  const trimmed = (path || '').trim();
  if (!trimmed || trimmed === '/') return '/';

  const pathOnly = (pathname: string) => pathname.replace(/^\//, '') || pathname;

  const tryDm = (pathname: string, query: string) => {
    if (pathOnly(pathname) !== 'dm-thread') return null;
    const conversationId = new URLSearchParams(query).get('conversationId');
    if (!conversationId) return null;
    return { pathname: '/dm-thread' as const, params: { conversationId: String(conversationId) } };
  };

  const tryRoomPostDetail = (pathname: string, query: string) => {
    if (pathOnly(pathname) !== 'room-post-detail') return null;
    const postId = new URLSearchParams(query).get('postId');
    if (!postId) return null;
    return { pathname: '/room-post-detail' as const, params: { postId: String(postId) } };
  };

  const q = trimmed.indexOf('?');
  if (q !== -1) {
    const pathnamePart = trimmed.slice(0, q);
    const queryPart = trimmed.slice(q + 1);
    const dm = tryDm(pathnamePart, queryPart);
    if (dm) return dm;
    const rpd = tryRoomPostDetail(pathnamePart, queryPart);
    if (rpd) return rpd;
  }

  return trimmed as Href;
}

/**
 * Href for navigation from a notification tap. Never returns home `/` for a real row — falls back to the notifications list.
 */
export function notificationTargetHref(n: Notification): Href {
  const path = resolveNotificationRoute(n);
  const trimmed = (path || '').trim();
  if (!trimmed || trimmed === '/') {
    return '/notifications';
  }
  return notificationPathToHref(trimmed);
}

export async function createNotification(input: {
  user_id: string;
  /** Ignored for the DB row; `public.create_notification` sets actor from `auth.uid()`. Kept for call-site compatibility. */
  actor_id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  secondary_id?: string | null;
  title?: string | null;
  body?: string | null;
  data?: any;
}): Promise<void> {
  const { data: newId, error } = await supabase.rpc('create_notification', {
    p_recipient_id: input.user_id,
    p_type: input.type,
    p_entity_type: input.entity_type,
    p_entity_id: input.entity_id,
    p_secondary_id: input.secondary_id ?? null,
    p_title: input.title ?? null,
    p_body: input.body ?? null,
    p_data: input.data ?? {},
  });

  if (error) {
    const code = (error as any).code;
    const message = String((error as any).message || '');
    console.warn('[Notifications] create_notification RPC failed:', {
      code,
      message,
      type: input.type,
      recipient_id: input.user_id,
    });
    if (code === 'PGRST205' || message.includes("Could not find the table 'public.notifications'")) {
      if (!missingNotificationsTableLogged) {
        console.log(
          "[Notifications] notifications table not found; skipping createNotification. Run the notifications migration in Supabase to enable this feature."
        );
        missingNotificationsTableLogged = true;
      }
      return;
    }
    throw error;
  }

  if (newId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const actorId = user?.id ?? null;
    const rowForPush: Notification = {
      id: String(newId),
      created_at: new Date().toISOString(),
      user_id: input.user_id,
      actor_id: actorId,
      type: input.type,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      secondary_id: input.secondary_id ?? null,
      title: input.title ?? null,
      body: input.body ?? null,
      is_read: false,
      data: input.data || {},
    };
    try {
      await sendPushForNotification(rowForPush);
    } catch (pushErr) {
      console.log('[Notifications] Failed to send push notification:', pushErr);
    }
    if (__DEV__) {
      console.log('[Notifications] create_notification OK', input.type, String(newId));
    }
  }
}

type PreferenceBucket = 'messages' | 'crew_rooms' | 'social' | 'housing' | 'updates';

/** Maps notification `type` to a preference column bucket; registry first, then legacy strings not in the locked list. */
function getPreferenceBucketForPush(type: string): PreferenceBucket {
  const fromRegistry = preferenceBucketForType(type);
  if (fromRegistry) return fromRegistry;

  switch (type) {
    case 'dm_share_post':
    case 'dm_share_media':
      return 'messages';
    case 'housing_reply':
    case 'listing_reply':
    case 'housing_message':
    case 'saved_search_match':
    case 'standby_match':
      return 'housing';
    case 'crew_room_reply':
    case 'crew_room_mention':
    case 'crew_room_invite':
    case 'crew_invite':
    case 'room_post':
      return 'crew_rooms';
    case 'system_announcement':
    default:
      return 'updates';
  }
}

function socialTypeUsesFollowsToggle(type: string): boolean {
  const key = canonicalNotificationType(type);
  if (key) return ['follow', 'follow_request', 'follow_accept'].includes(key);
  return type === 'follow' || type === 'follow_request' || type === 'follow_accept';
}

function socialTypeUsesCommentsToggle(type: string): boolean {
  const key = canonicalNotificationType(type);
  if (key) return ['comment_post', 'reply_comment'].includes(key);
  return type === 'post_comment' || type === 'comment_post' || type === 'comment_reply';
}

function socialTypeUsesLikesToggle(type: string): boolean {
  const key = canonicalNotificationType(type);
  if (key) return key === 'like_post';
  return type === 'post_like' || type === 'like_post';
}

function socialTypeUsesMentionsToggle(type: string): boolean {
  const key = canonicalNotificationType(type);
  if (key) return ['mention_post', 'mention_comment'].includes(key);
  return type === 'mention_post' || type === 'mention_comment' || type === 'mention';
}

async function shouldSendPush(userId: string, type: string): Promise<boolean> {
  try {
    const pushEligible = isPushEligibleForCanonicalType(type);
    if (pushEligible === false) return false;

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return true;
    if (!data) return true;

    if (data.master_push === false) return false;
    const bucket = getPreferenceBucketForPush(type);
    switch (bucket) {
      case 'messages':
        return data.messages !== false;
      case 'crew_rooms':
        return data.crew_rooms !== false;
      case 'social':
        if (socialTypeUsesFollowsToggle(type) && data.follows === false) return false;
        if (socialTypeUsesCommentsToggle(type) && data.comments === false) return false;
        if (socialTypeUsesLikesToggle(type) && data.likes === false) return false;
        if (socialTypeUsesMentionsToggle(type) && data.mentions === false) return false;
        return true;
      case 'housing':
        // Legacy housing bucket matched `updates` before the registry; keep behavior.
        return data.updates !== false;
      case 'updates':
      default:
        return data.updates !== false;
    }
  } catch {
    return true;
  }
}

async function sendPushForNotification(n: Notification): Promise<void> {
  const userId = n.user_id;
  if (!userId) return;

  const ok = await shouldSendPush(userId, n.type);
  if (!ok) return;

  const { data: tokens, error } = await supabase
    .from('user_push_tokens')
    .select('push_token')
    .eq('user_id', userId);
  if (error || !tokens || !tokens.length) return;

  let actorName: string | undefined;
  if (n.actor_id) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, full_name')
        .eq('id', n.actor_id)
        .maybeSingle();
      actorName = profile?.display_name || profile?.full_name || undefined;
    } catch {
      actorName = undefined;
    }
  }

  const title = buildPushTitle(n, actorName);
  const body = n.body || '';
  const route = resolveNotificationRoute(n);

  const messages = tokens.map((t: any) => ({
    to: t.push_token,
    sound: 'default',
    title,
    body,
    data: {
      route,
      type: n.type,
      entity_type: n.entity_type,
      entity_id: n.entity_id,
    },
  }));

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.log('[Notifications] Expo push send failed:', err);
  }
}

function buildPushTitle(n: Notification, actorName?: string): string {
  const who = actorName || n.actor?.display_name || 'Someone';
  switch (n.type) {
    case 'follow':
      return `${who} followed you`;
    case 'follow_request':
      return `${who} requested to follow you`;
    case 'follow_accept':
      return `${who} accepted your follow request`;
    case 'post_like':
    case 'like_post':
      return `${who} liked your post`;
    case 'post_comment':
    case 'comment_post':
      return `${who} commented on your post`;
    case 'comment_reply':
      return `${who} replied to your comment`;
    case 'mention_post':
    case 'mention_comment':
    case 'mention':
      return `${who} mentioned you`;
    case 'message':
      return `${who} sent you a message`;
    case 'message_request':
      return `${who} wants to message you`;
    case 'dm_share_post':
      return `${who} shared a post with you`;
    case 'dm_share_media':
      return `${who} shared media with you`;
    case 'crew_room_reply':
    case 'crew_room_mention':
    case 'crew_room_invite':
    case 'crew_invite':
      return `${who} updated your crew room`;
    case 'housing_reply':
    case 'listing_reply':
      return `${who} replied to your housing post`;
    case 'housing_message':
      return `${who} messaged you about housing`;
    case 'saved_search_match':
      return 'New housing match';
    case 'standby_match':
      return 'Standby bed match available';
    case 'system_announcement':
      return n.title || 'Flight Club update';
    default:
      return n.title || 'New activity';
  }
}
