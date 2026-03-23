import type { Href } from 'expo-router';
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
  data: any;
  actor?: {
    display_name?: string;
    avatar_url?: string;
  };
};

type NotificationCategory = 'social' | 'messages' | 'housing' | 'crew' | 'system';

export async function fetchNotifications(page = 1, pageSize = 30): Promise<Notification[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('*, actor:actor_id(display_name, avatar_url)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

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
}

// Fetch total unread notifications for the current signed-in user
export async function fetchUnreadNotificationsCount(): Promise<number> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  if (error) {
    const code = (error as any).code;
    const message = String((error as any).message || '');
    if (code === 'PGRST205' || message.includes("Could not find the table 'public.notifications'")) {
      if (!missingNotificationsTableLogged) {
        console.log(
          "[Notifications] notifications table not found; returning 0 for unread count. Run the notifications migration in Supabase to enable this feature."
        );
        missingNotificationsTableLogged = true;
      }
      return 0;
    }
    throw error;
  }

  return count ?? 0;
}

export function resolveNotificationRoute(n: Notification): string {
  if (n.data?.route) return n.data.route;
  switch (n.entity_type) {
    case 'post':
      return `/post/${n.entity_id}`;
    case 'comment':
      return `/post/${n.entity_id}/comments`;
    case 'room':
      return `/crew-rooms/${n.entity_id}`;
    case 'profile':
      return `/profile/${n.entity_id}`;
    case 'conversation':
      return `/dm-thread?conversationId=${encodeURIComponent(n.entity_id)}`;
    default:
      return '/';
  }
}

/**
 * Map stored notification routes (often `/dm-thread?conversationId=…`) to Expo Router hrefs
 * so params are passed reliably (matches in-app DM navigation).
 */
export function notificationPathToHref(path: string): Href {
  const trimmed = (path || '').trim();
  if (!trimmed || trimmed === '/') return '/';

  const tryDm = (pathname: string, query: string) => {
    const base = pathname.replace(/^\//, '') || pathname;
    if (base !== 'dm-thread') return null;
    const conversationId = new URLSearchParams(query).get('conversationId');
    if (!conversationId) return null;
    return { pathname: '/dm-thread' as const, params: { conversationId: String(conversationId) } };
  };

  const q = trimmed.indexOf('?');
  if (q !== -1) {
    const mapped = tryDm(trimmed.slice(0, q), trimmed.slice(q + 1));
    if (mapped) return mapped;
  }

  return trimmed as Href;
}

export async function createNotification(input: {
  user_id: string;
  actor_id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  secondary_id?: string | null;
  title?: string | null;
  body?: string | null;
  data?: any;
}): Promise<void> {
  const { data, error } = await supabase
    .from('notifications')
    .insert([
      {
        ...input,
        data: input.data || {},
      },
    ])
    .select('id, user_id, actor_id, type, entity_type, entity_id, title, body, data, created_at')
    .single();

  if (error) {
    const code = (error as any).code;
    const message = String((error as any).message || '');
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

  if (data) {
    try {
      await sendPushForNotification(data as Notification);
    } catch (pushErr) {
      console.log('[Notifications] Failed to send push notification:', pushErr);
    }
  }
}

function getCategoryForType(type: string): NotificationCategory {
  switch (type) {
    case 'follow':
    case 'follow_request':
    case 'follow_accept':
    case 'post_like':
    case 'like_post':
    case 'post_comment':
    case 'comment_post':
    case 'comment_reply':
    case 'mention_post':
    case 'mention_comment':
    case 'mention':
      return 'social';
    case 'message':
    case 'message_request':
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
      return 'crew';
    case 'system_announcement':
    default:
      return 'system';
  }
}

async function shouldSendPush(userId: string, type: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return true;
    if (!data) return true;

    if (data.master_push === false) return false;
    const category = getCategoryForType(type);
    switch (category) {
      case 'messages':
        return data.messages !== false;
      case 'crew':
        return data.crew_rooms !== false;
      case 'social':
        if (
          (type === 'follow' || type === 'follow_request' || type === 'follow_accept') &&
          data.follows === false
        )
          return false;
        if (
          (type === 'post_comment' || type === 'comment_post' || type === 'comment_reply') &&
          data.comments === false
        )
          return false;
        if ((type === 'post_like' || type === 'like_post') && data.likes === false) return false;
        if (
          (type === 'mention_post' || type === 'mention_comment' || type === 'mention') &&
          data.mentions === false
        )
          return false;
        return true;
      case 'housing':
        // Re-use "updates" toggle for housing-related alerts if needed
        return data.updates !== false;
      case 'system':
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
