// Upload media to Supabase Storage and return public URL
export async function uploadPostMedia(file: { uri: string; type: string; name: string }) {
  const userId = await getCurrentUserId();
  const ext = file.name.split('.').pop();
  const filePath = `post-media/${userId}/${Date.now()}.${ext}`;
  const response = await fetch(file.uri);
  const blob = await response.blob();
  const { error } = await supabase.storage.from('post-media').upload(filePath, blob, { contentType: file.type, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('post-media').getPublicUrl(filePath);
  return data.publicUrl;
}
// Create a new post (text, photo, video, reel)
export async function createPost({ text, media, mode }: { text: string; media: any; mode: string | null }) {
  const userId = await getCurrentUserId();
  let media_type = 'none', media_url = null, media_urls = null, thumbnail_url = null, aspect_ratio = null;
  if (media && media.uri && mode && mode !== 'text') {
    media_type = mode;
    const url = await uploadPostMedia({ uri: media.uri, type: media.type || (mode === 'photo' ? 'image/jpeg' : 'video/mp4'), name: media.fileName || `media.${mode === 'photo' ? 'jpg' : 'mp4'}` });
    media_urls = [url];
    media_url = url; // for compatibility
    if (media_type === 'video' || media_type === 'reel') {
      thumbnail_url = media.thumbnail || null;
    }
    aspect_ratio = media.width && media.height ? media.width / media.height : null;
  }
  const { data, error } = await supabase.from('posts').insert({
    user_id: userId,
    content: text,
    media_type,
    media_url,
    media_urls,
    thumbnail_url,
    aspect_ratio,
    visibility: 'public',
  }).single();
  if (error) {
    console.error('Supabase post insert error:', error);
    throw error;
  }
  return data;
}
import { supabase } from '../src/lib/supabaseClient';

let missingFollowsTableLogged = false;

// Helper to get current user id
async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user?.id) throw new Error('Not logged in');
  return data.session.user.id;
}

// Types
type Post = {
  id: string;
  user_id: string;
  created_at: string;
  content: string;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  aspect_ratio: number | null;
  like_count: number;
  comment_count: number;
  visibility: string;
  user?: any; // profile info
};

export async function getMyProfile() {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

// Fetch IDs of users the given user follows (plus optional self-inclusion handled by callers)
export async function getFollowedUserIds(userId?: string): Promise<string[]> {
  const currentUserId = userId || (await getCurrentUserId());
  const { data: follows, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', currentUserId);
  if (error) {
    const code = (error as any).code;
    const message = String((error as any).message || '');
    if (code === 'PGRST205' || message.includes("Could not find the table 'public.follows'")) {
      if (!missingFollowsTableLogged) {
        console.log(
          "[Feed] follows table not found; treating as no follows. Run the follows migration in Supabase to enable Following feeds."
        );
        missingFollowsTableLogged = true;
      }
      return [];
    }
    throw error;
  }
  return (follows || []).map((f: any) => f.following_id as string);
}

// Following feed: posts from followed users + own posts, newest first
export async function getFollowingFeed({
  userId,
  limit = 20,
  offset = 0,
}: {
  userId?: string;
  limit?: number;
  offset?: number;
}) {
  const currentUserId = userId || (await getCurrentUserId());
  const followedIds = await getFollowedUserIds(currentUserId);
  const ids = [...followedIds, currentUserId];

  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles!inner(*)')
    .in('user_id', ids)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data || [];
}

// Internal helper to fetch candidate suggested posts (non-followed, last 7 days)
async function getTrendingSuggestedFeed({
  userId,
  followedUserIds,
  limit = 30,
}: {
  userId: string;
  followedUserIds: string[];
  limit?: number;
}) {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles!inner(*)')
    .eq('visibility', 'public')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit * 2); // overfetch, we'll filter client-side

  if (error) throw error;
  const blockedIds = new Set<string>([userId, ...followedUserIds]);
  return (data || []).filter((p: any) => !blockedIds.has(p.user_id));
}

// Build an algorithmic "For You" feed by merging followed + suggested posts
export async function buildForYouFeed({
  userId,
  limit = 20,
  offset = 0,
}: {
  userId?: string;
  limit?: number;
  offset?: number;
}) {
  const currentUserId = userId || (await getCurrentUserId());
  const viewerProfile = await getMyProfile();
  const followedIds = await getFollowedUserIds(currentUserId);

  // Base sets
  const [followedPosts, suggestedCandidates] = await Promise.all([
    getFollowingFeed({ userId: currentUserId, limit: 30, offset: 0 }),
    getTrendingSuggestedFeed({ userId: currentUserId, followedUserIds: followedIds, limit: 30 }),
  ]);

  const followingCountTarget = Math.round(limit * 0.6);
  const suggestedCountTarget = limit - followingCountTarget;

  const now = Date.now();

  const scoredSuggested = suggestedCandidates.map((post: any) => {
    const likeCount = (post.like_count as number) || 0;
    const commentCount = (post.comment_count as number) || 0;
    const baseScore = likeCount * 2 + commentCount * 3;

    const created = new Date(post.created_at).getTime();
    const hours = Math.max(1, (now - created) / (1000 * 60 * 60));
    const timeDecay = 1 / (1 + hours / 12);

    let relevanceBoost = 0;
    const profile = (post as any).profiles || {};
    if (viewerProfile?.base && profile.base && viewerProfile.base === profile.base) {
      relevanceBoost += 0.15;
    }
    if (viewerProfile?.airline && profile.airline && viewerProfile.airline === profile.airline) {
      relevanceBoost += 0.1;
    }
    if (viewerProfile?.role && profile.role && viewerProfile.role === profile.role) {
      relevanceBoost += 0.05;
    }

    const finalScore = baseScore * timeDecay * (1 + relevanceBoost);
    return { post, score: finalScore };
  });

  scoredSuggested.sort((a, b) => b.score - a.score);

  const suggestedTop = scoredSuggested.slice(0, suggestedCountTarget).map((x) => x.post);
  const followedTop = followedPosts.slice(0, followingCountTarget);

  const merged: any[] = [];
  const seen = new Set<string>();

  const pushPosts = (list: any[]) => {
    list.forEach((p: any) => {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        merged.push(p);
      }
    });
  };

  // Interleave: start with a followed post, then suggested, etc.
  const maxLen = Math.max(followedTop.length, suggestedTop.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < followedTop.length) pushPosts([followedTop[i]]);
    if (i < suggestedTop.length) pushPosts([suggestedTop[i]]);
  }

  const sliced = merged.slice(offset, offset + limit);
  return sliced;
}

export async function toggleLike(postId: string) {
  const userId = await getCurrentUserId();
  // Check if liked
  const { data: liked } = await supabase
    .from('post_likes')
    .select('*')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .single();
  if (liked) {
    // Unlike
    await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
  } else {
    // Like
    await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
  }
}

export async function addComment(postId: string, body: string) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, user_id: userId, body })
    .single();
  if (error) throw error;
  return data;
}

export async function getPostById(postId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles!inner(*)')
    .eq('id', postId)
    .single();
  if (error) throw error;
  return data;
}

export async function getComments(postId: string, { limit = 20, offset = 0 }) {
  const { data, error } = await supabase
    .from('post_comments')
    .select('*, profiles!inner(*)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data;
}

export async function getIsFollowing(userId: string) {
  const myId = await getCurrentUserId();
  const { data } = await supabase
    .from('follows')
    .select('*')
    .eq('follower_id', myId)
    .eq('following_id', userId)
    .single();
  return !!data;
}

export async function followUser(userId: string) {
  const myId = await getCurrentUserId();
  const { error } = await supabase.from('follows').insert({ follower_id: myId, following_id: userId });
  return { error };
}

export async function unfollowUser(userId: string) {
  const myId = await getCurrentUserId();
  const { error } = await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', userId);
  return { error };
}
