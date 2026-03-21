import { supabase } from '../src/lib/supabaseClient';
import { Notification, resolveNotificationRoute } from './notifications';

export type NotificationPreview = Notification & { summary: string; actor_avatar_url?: string };

export async function getRecentNotifications(userId: string, limit = 4): Promise<NotificationPreview[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*, actor:actor_id(display_name, avatar_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((n: any) => ({
    ...n,
    actor_avatar_url: n.actor?.avatar_url,
    summary: getNotificationSummary(n),
  }));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
  return count ?? 0;
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
  // Simple summary, can be improved
  if (n.type === 'like_post') return `${n.actor?.display_name || 'Someone'} liked your post`;
  if (n.type === 'comment_post') return `${n.actor?.display_name || 'Someone'} replied to your post`;
  if (n.type === 'crew_room_reply') return `${n.actor?.display_name || 'Someone'} replied in your crew room`;
  if (n.type === 'follow') return `${n.actor?.display_name || 'Someone'} followed you`;
  if (n.type === 'crew_invite') return `${n.actor?.display_name || 'Someone'} invited you to a crew room`;
  if (n.type === 'room_post') return `${n.actor?.display_name || 'Someone'} posted in your room`;
  if (n.type === 'crew_room_mention') return `${n.actor?.display_name || 'Someone'} mentioned you in a crew room`;
  if (n.type === 'mention') return `${n.actor?.display_name || 'Someone'} mentioned you`;
  if (n.type === 'message') return `${n.actor?.display_name || 'Someone'} sent you a message`;
  return n.body || 'You have a new notification';
}

export { resolveNotificationRoute };
