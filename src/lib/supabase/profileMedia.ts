import { supabase } from '../supabaseClient';

/**
 * Fetch all media URLs for a given user (from their posts)
 */
export async function fetchUserMedia(userId: string, limit: number = 30): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('room_posts')
      .select('media_urls')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    // Flatten and filter nulls
    return (data || [])
      .flatMap((row) => row.media_urls || [])
      .filter(Boolean);
  } catch (error) {
    console.error('Error fetching user media:', error);
    return [];
  }
}
