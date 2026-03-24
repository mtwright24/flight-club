import { supabase } from '../src/lib/supabaseClient';
import {
  Notification,
  countUnreadNotificationsForUser,
  resolveNotificationRoute,
} from './notifications';

export type NotificationPreview = Notification & { summary: string; actor_avatar_url?: string };

function isMissingNotificationsTable(error: unknown): boolean {
  const code = (error as any)?.code;
  const message = String((error as any)?.message || '');
  return code === 'PGRST205' || message.includes("Could not find the table 'public.notifications'");
}

function mapNotificationRows(data: any[] | null): NotificationPreview[] {
  return (data || []).map((n: any) => ({
    ...n,
    actor_avatar_url: n.actor?.avatar_url,
    summary: getNotificationSummary(n),
  }));
}

/**
 * Loads recent notifications for Home / previews. Never throws: returns [] on failure
 * so UI can show a graceful empty state. Retries without actor embed if the join fails
 * (common when FK/embed hints differ from the live schema).
 */
export async function getRecentNotifications(userId: string, limit = 4): Promise<NotificationPreview[]> {
  const base = () =>
    supabase.from('notifications').select('*, actor:actor_id(display_name, avatar_url)').eq('user_id', userId);

  const { data, error } = await base().order('created_at', { ascending: false }).limit(limit);

  if (!error) {
    return mapNotificationRows(data);
  }

  if (isMissingNotificationsTable(error)) {
    return [];
  }

  const { data: dataPlain, error: errPlain } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!errPlain) {
    return mapNotificationRows(dataPlain);
  }

  if (isMissingNotificationsTable(errPlain)) {
    return [];
  }

  console.warn('[getRecentNotifications] Falling back to empty list:', errPlain.message || errPlain);
  return [];
}

export async function getUnreadCount(userId: string): Promise<number> {
  return countUnreadNotificationsForUser(userId);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
}

export function subscribeToNotifications(userId: string, onNew: (n: NotificationPreview) => void) {
  return supabase
    .channel('notifications')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const n = payload.new as Notification;
        onNew({ ...n, summary: getNotificationSummary(n) } as NotificationPreview);
      }
    )
    .subscribe();
}

function getNotificationSummary(n: Notification): string {
  const who = n.actor?.display_name || 'Someone';
  // Align with notification center copy where types differ (post_like vs like_post, etc.)
  if (n.type === 'like_post' || n.type === 'post_like') return `${who} liked your post`;
  if (n.type === 'comment_post' || n.type === 'post_comment' || n.type === 'comment_reply')
    return `${who} commented on your post`;
  if (n.type === 'crew_room_reply') return `${who} replied in your crew room`;
  if (n.type === 'follow_request') return `${who} requested to follow you`;
  if (n.type === 'follow_accept') return `${who} accepted your follow request`;
  if (n.type === 'follow') return `${who} followed you`;
  if (n.type === 'crew_invite' || n.type === 'crew_room_invite') return `${who} invited you to a crew room`;
  if (n.type === 'room_post') return `${who} posted in your room`;
  if (n.type === 'crew_room_mention') return `${who} mentioned you in a crew room`;
  if (n.type === 'mention' || n.type === 'mention_post' || n.type === 'mention_comment') return `${who} mentioned you`;
  if (n.type === 'message' || n.type === 'message_request') return `${who} sent you a message`;
  if (n.type === 'dm_share_post' || n.type === 'dm_share_media') return `${who} shared something with you`;
  return n.body || n.title || 'You have a new notification';
}

export { resolveNotificationRoute };
