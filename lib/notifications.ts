import type { Href } from 'expo-router';
import {
  notificationRecordToRoutingPayload,
  resolveNotificationHrefFromRecord,
  resolveNotificationPathFromPayload,
} from './notificationRouting';
import {
  canonicalNotificationType,
  isPushEligibleForCanonicalType,
  preferenceBucketForType,
} from './notificationRegistry';
import { parseNotificationData } from './notificationPayload';
import {
  rawDbTypesForNotificationsSubsection,
  type TopBlockSection,
} from './notificationTopBlocks';
import { supabase } from '../src/lib/supabaseClient';

export { parseNotificationData };
export { notificationPathToHref } from './notificationPathMapping';

let missingNotificationsTableLogged = false;

/**
 * Unified in-app + push notification row (`public.notifications`).
 * Navigation uses `type` + `entity_*` + JSON `data` via `lib/notificationRegistry.ts` and `lib/notificationRouting.ts`.
 * Remote pushes embed the same fields plus `notification_id` for mark-read on tap.
 */
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
    display_name?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
  };
};

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Fills `actor` from `profiles` when PostgREST embed fails (RLS/FK) or returns empty.
 * Safe to call on every fetch; dedupes actor ids.
 */
export async function enrichNotificationsWithActors(rows: Notification[]): Promise<Notification[]> {
  if (!rows.length) return rows;
  const idSet = new Set<string>();
  for (const r of rows) {
    if (r.actor_id && String(r.actor_id).trim()) idSet.add(String(r.actor_id));
  }
  if (!idSet.size) return augmentActorsFromNotificationData(rows);

  const ids = [...idSet];
  const chunkSize = 80;
  const profiles: Record<string, unknown>[] = [];

  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, full_name, avatar_url')
      .in('id', slice);

    if (error) {
      if (__DEV__) {
        console.warn('[Notifications] enrichNotificationsWithActors:', error.message);
      }
      continue;
    }
    if (data?.length) profiles.push(...(data as Record<string, unknown>[]));
  }

  if (!profiles.length) {
    return augmentActorsFromNotificationData(rows);
  }

  const map = new Map<string, Record<string, unknown>>();
  for (const p of profiles) {
    const id = p.id != null ? String(p.id) : '';
    if (id) map.set(id, p);
  }

  const profileMerged = rows.map((r) => {
    if (!r.actor_id) return r;
    const p = map.get(String(r.actor_id));
    if (!p) return r;

    const prev = r.actor || {};
    const mergedDisplay = pickStr(prev.display_name) ?? pickStr(p.display_name, p.full_name);
    const mergedFull = pickStr(prev.full_name) ?? pickStr(p.full_name);
    const mergedAvatar = pickStr(prev.avatar_url) ?? pickStr(p.avatar_url);

    if (!mergedDisplay && !mergedFull && !mergedAvatar) return r;

    return {
      ...r,
      actor: {
        display_name: mergedDisplay ?? null,
        full_name: mergedFull ?? null,
        avatar_url: mergedAvatar ?? null,
      },
    };
  });

  return augmentActorsFromNotificationData(profileMerged);
}

/** Fills missing actor fields from `notifications.data` (e.g. DM payloads). */
function augmentActorsFromNotificationData(rows: Notification[]): Notification[] {
  return rows.map((r) => {
    const d = parseNotificationData(r);
    const dn = pickStr(d.actor_display_name, d.sender_display_name, d.from_display_name);
    const av = pickStr(d.actor_avatar_url, d.sender_avatar_url, d.sender_avatar);
    if (!dn && !av) return r;
    const act = r.actor || {};
    return {
      ...r,
      actor: {
        display_name: pickStr(act.display_name) ?? dn ?? null,
        full_name: act.full_name ?? null,
        avatar_url: pickStr(act.avatar_url) ?? av ?? null,
      },
    };
  });
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
      .select('*, actor:actor_id(display_name, full_name, avatar_url)')
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
      return enrichNotificationsWithActors(plain || []);
    }
    throw error;
  }

  return enrichNotificationsWithActors(data || []);
}

const NOTIFICATIONS_SUBLIST_PAGE_SIZE = 200;

/** Notifications for a top-block subsection (crew / trade / housing), newest first. */
export async function fetchNotificationsForTopBlockSection(
  section: Exclude<TopBlockSection, 'message-requests'>
): Promise<Notification[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return [];

  const types = rawDbTypesForNotificationsSubsection(section);
  if (!types.length) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .in('type', types)
    .order('created_at', { ascending: false })
    .limit(NOTIFICATIONS_SUBLIST_PAGE_SIZE);

  if (error) {
    const code = (error as any).code;
    const message = String((error as any).message || '');
    if (code === 'PGRST205' || message.includes("Could not find the table 'public.notifications'")) {
      return [];
    }
    if (__DEV__) console.warn('[Notifications] fetchNotificationsForTopBlockSection:', message);
    return [];
  }

  return enrichNotificationsWithActors(data || []);
}

/** Marks unread notifications in this subsection (up to 500 ids per call). */
export async function markTopBlockSectionNotificationsRead(
  section: Exclude<TopBlockSection, 'message-requests'>
): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return;

  const types = rawDbTypesForNotificationsSubsection(section);
  if (!types.length) return;

  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_read', false)
    .in('type', types)
    .limit(500);

  if (error) {
    const code = (error as any).code;
    const message = String((error as any).message || '');
    if (code === 'PGRST205' || message.includes("Could not find the table 'public.notifications'")) {
      return;
    }
    throw error;
  }

  const ids = (data || []).map((r: { id: string }) => r.id).filter(Boolean);
  await markNotificationsRead(ids);
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

/** Mark in-app notification rows for this DM thread read (bell + Activity stay aligned). */
export async function markNotificationsReadForConversation(
  viewerUserId: string,
  conversationId: string
): Promise<void> {
  const cid = String(conversationId || '').trim();
  if (!viewerUserId || !cid) return;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', viewerUserId)
    .eq('entity_type', 'conversation')
    .eq('entity_id', cid)
    .eq('is_read', false);

  if (error) {
    const code = (error as any)?.code;
    const message = String((error as any)?.message || '');
    if (code === 'PGRST205' || message.includes("Could not find the table 'public.notifications'")) {
      return;
    }
    if (__DEV__) console.warn('[Notifications] markNotificationsReadForConversation:', message);
    return;
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
 * String path for previews / push payload `route` (centralized with push + inbox).
 * @see resolveNotificationHrefFromPayload
 */
export function resolveNotificationRoute(n: Notification): string {
  return resolveNotificationPathFromPayload(notificationRecordToRoutingPayload(n));
}

/**
 * Href for navigation from a notification tap (inbox, home, push). Same rules as foreground banner / response taps.
 */
export function notificationTargetHref(n: Notification): Href {
  return resolveNotificationHrefFromRecord(n);
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
    .eq('user_id', userId)
    .eq('is_active', true);
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
      secondary_id: n.secondary_id ?? null,
      notification_id: n.id,
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
      // Expo v2 expects `{ messages: [...] }` (not a raw array).
      body: JSON.stringify({ messages }),
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
    case 'message_request_accepted':
      return 'Message request accepted';
    case 'message_request_declined':
      return 'Message request declined';
    case 'trade_interest':
      return `${who} is interested in your trade`;
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
