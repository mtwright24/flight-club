import { supabase } from '../supabaseClient';
import { RoomPost } from './posts';

/**
 * Fetch all posts for a given user (for their profile feed)
 */
export async function fetchUserPosts(userId: string, limit: number = 20): Promise<RoomPost[]> {
  try {
    const { data, error } = await supabase
      .from('room_posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching user posts:', error);
    return [];
  }
}
