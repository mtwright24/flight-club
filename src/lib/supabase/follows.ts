import { supabase } from '../supabaseClient';
import { createNotification } from '../../../lib/notifications';

export async function isFollowing(currentUserId: string, targetUserId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('id')
    .eq('follower_id', currentUserId)
    .eq('following_id', targetUserId)
    .single();
  return !!data && !error;
}

export async function followUser(currentUserId: string, targetUserId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_follows')
    .insert({ follower_id: currentUserId, following_id: targetUserId });
  if (error) return false;

  // Fire-and-forget follow notification
  try {
    if (currentUserId !== targetUserId) {
      await createNotification({
        user_id: targetUserId,
        actor_id: currentUserId,
        type: 'follow',
        entity_type: 'profile',
        entity_id: currentUserId,
        data: { route: `/profile/${currentUserId}` },
      });
    }
  } catch (notifyError) {
    console.log('[Notifications] Failed to create follow notification:', notifyError);
  }

  return true;
}

export async function unfollowUser(currentUserId: string, targetUserId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_follows')
    .delete()
    .eq('follower_id', currentUserId)
    .eq('following_id', targetUserId);
  return !error;
}

export async function getFollowersCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('user_follows')
    .select('id', { count: 'exact', head: true })
    .eq('following_id', userId);
  return count || 0;
}

export async function getFollowingCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('user_follows')
    .select('id', { count: 'exact', head: true })
    .eq('follower_id', userId);
  return count || 0;
}
