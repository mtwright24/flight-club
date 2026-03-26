// Fetch a single social feed post by ID
export async function fetchSocialFeedPostById(postId: string): Promise<SocialFeedPost | null> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;
  const enriched = await enrichPostsWithAuthorNames([data]);
  return enriched[0] || null;
}
import { supabase } from '../supabaseClient';
import * as FileSystem from 'expo-file-system/legacy';

export interface SocialFeedPost {
  id: string;
  user_id: string;
  content: string;
  media_urls?: string[] | null;
  created_at: string;
  author_display_name?: string;
  profile_display_name?: string;
  profile_avatar_url?: string;
}

// Fetch profiles by user IDs (with display name and avatar)
async function fetchProfilesByIds(userIds: string[]): Promise<Record<string, any>> {
  if (userIds.length === 0) return {};
  const uniqueIds = Array.from(new Set(userIds));
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', uniqueIds);
  if (error) throw error;
  const profilesById: Record<string, any> = {};
  data?.forEach((profile: any) => {
    profilesById[profile.id] = {
      display_name: profile.display_name || null,
      avatar_url: profile.avatar_url || null,
      id: profile.id,
    };
  });
  return profilesById;
}

// Enrich posts with author display names and avatars
async function enrichPostsWithAuthorNames(posts: SocialFeedPost[]): Promise<SocialFeedPost[]> {
  if (posts.length === 0) return posts;
  const userIds = Array.from(new Set(posts.map((p) => p.user_id)));
  const profilesById = await fetchProfilesByIds(userIds);
  return posts.map((post) => {
    const profile = profilesById[post.user_id];
    return {
      ...post,
      author_display_name: profile?.display_name || undefined,
      profile_display_name: profile?.display_name || undefined,
      profile_avatar_url: profile?.avatar_url || undefined,
    };
  });
}

// Fetch social feed posts
export async function fetchSocialFeedPosts(limit: number = 20): Promise<SocialFeedPost[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const posts = data || [];
  return await enrichPostsWithAuthorNames(posts);
}

// Create a new social feed post
export async function createSocialFeedPost(
  userId: string,
  content: string,
  mediaUrls?: string[] | null
): Promise<{ success: boolean; post?: SocialFeedPost; error?: string }> {
  try {
    if (!content.trim() && (!mediaUrls || mediaUrls.length === 0)) {
      return { success: false, error: 'Post content or media required' };
    }
    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        content,
        media_urls: mediaUrls || null,
      })
      .select()
      .single();
    if (error) throw error;
    return { success: true, post: data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create post',
    };
  }
}

// Upload image/video to Supabase Storage (bucket: post-media)
export async function uploadSocialFeedMedia(
  userId: string,
  file: { uri: string; name: string; type: string }
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const timestamp = Date.now();
    // Ensure filename does not include 'post-media' twice
    const filename = `${userId}/${timestamp}-${file.name}`;

    // React Native: Supabase Storage `.upload` expects bytes/Blob-like content.
    // FormData uploads are unreliable in native and often surface as "Network request failed".
    let bytes: Uint8Array;
    if (file.type?.startsWith('video/')) {
      const response = await fetch(file.uri);
      if (!response.ok) throw new Error('Could not read selected video.');
      bytes = new Uint8Array(await response.arrayBuffer());
    } else {
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
      const binaryString = globalThis.atob(base64);
      bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
    }

    const { error } = await supabase.storage
      .from('post-media')
      .upload(filename, bytes, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: publicUrlData } = supabase.storage
      .from('post-media')
      .getPublicUrl(filename);
    return { success: true, url: publicUrlData.publicUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload media',
    };
  }
}
