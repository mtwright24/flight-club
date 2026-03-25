import { supabase } from '../src/lib/supabaseClient';
import { countDmCloudBadgeThreads } from '../src/lib/supabase/dms';
import { countUnreadNotificationsForUser } from './notifications';

// A) Current user profile
type UserProfile = {
  id: string;
  display_name?: string | null;
  full_name: string | null;
  first_name: string | null;
  username: string | null;
  base: string | null;
  fleet: string | null;
  avatar_url: string | null;
};

export async function getCurrentUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, full_name, first_name, username, base, fleet, avatar_url')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as UserProfile;
}

// B) Trending Posts
export async function getTrendingPosts(): Promise<any[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('posts')
    .select('id, user_id, content, created_at, like_count, comment_count, media_url, profiles!inner(id, full_name, avatar_url)')
    .gte('created_at', since)
    .order('like_count', { ascending: false })
    .order('comment_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return [];
  return data || [];
}

// C) Trending Rooms
export async function getTrendingRooms(): Promise<any[]> {
  const { data, error } = await supabase
    .from('crew_rooms')
    .select('id, name, is_live, base_tag, last_message_at, crew_room_members(count), crew_room_messages!inner(created_at)')
    .order('last_message_at', { ascending: false })
    .limit(10);
  if (error) return [];
  return data || [];
}

// D) Monthly Awards
export async function getMonthlyAwards(): Promise<any[]> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const { data, error } = await supabase
    .from('awards')
    .select('id, type, title, month, year, award_winners!inner(user_id, rank, points, profiles!inner(id, full_name, avatar_url))')
    .eq('month', month)
    .eq('year', year)
    .limit(10);
  if (error) return [];
  return data || [];
}

// E) Recent Activity
export async function getRecentActivity(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, actor_id, type, created_at, entity_type, entity_id, summary, is_read, profiles!actor_id(full_name, avatar_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(4);
  if (error) return [];
  return data || [];
}

// F) Unread counts
/**
 * `notifications` = bell (deduped in `countUnreadNotificationsForUser`).
 * `messages` = **cloud icon only** — same logic as Messages inbox rows + Requests (see `countDmCloudBadgeThreads`).
 */
export async function getUnreadCounts(userId: string): Promise<{ notifications: number; messages: number }> {
  const notifCount = await countUnreadNotificationsForUser(userId);

  let messageCount = 0;
  try {
    messageCount = await countDmCloudBadgeThreads(userId);
  } catch {
    messageCount = 0;
  }

  return { notifications: notifCount, messages: messageCount };
}
