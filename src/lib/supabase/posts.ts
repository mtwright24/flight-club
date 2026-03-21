import { createNotification } from '../../../lib/notifications';
import { supabase } from '../supabaseClient';

export interface RoomPost {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  media_urls?: string[] | null;
  created_at: string;
  author_display_name?: string; // Added for display names
  profile_display_name?: string; // For PostsFeed
  profile_avatar_url?: string; // For PostsFeed
}

interface Profile {
  id: string;
  display_name: string | null;
}

interface ProfileData {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface RoomPostComment {
  id: string;
  post_id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_display_name?: string; // Added for display names
  profile_display_name?: string; // For comments display
  profile_avatar_url?: string; // For comments display
}

/**
 * Fetch profiles by user IDs (with display name and avatar)
 */
async function fetchProfilesByIds(userIds: string[]): Promise<Record<string, ProfileData>> {
  if (userIds.length === 0) return {};

  try {
    const uniqueIds = Array.from(new Set(userIds));
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', uniqueIds);

    if (error) throw error;

    const profilesById: Record<string, ProfileData> = {};
    data?.forEach((profile: ProfileData) => {
      profilesById[profile.id] = {
        display_name: profile.display_name || null,
        avatar_url: profile.avatar_url || null,
        id: profile.id,
      };
    });
    return profilesById;
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return {};
  }
}

/**
 * Enrich posts with author display names and avatars
 */
async function enrichPostsWithAuthorNames(posts: RoomPost[]): Promise<RoomPost[]> {
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

/**
 * Fetch posts for a room, newest first
 */
export async function fetchRoomPosts(
  roomId: string,
  limit: number = 20
): Promise<RoomPost[]> {
  try {
    const { data, error } = await supabase
      .from('room_posts')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    const posts = data || [];
    return await enrichPostsWithAuthorNames(posts);
  } catch (error) {
    console.error('Error fetching room posts:', error);
    return [];
  }
}

/**
 * Fetch single post by id
 */
export async function fetchRoomPostById(postId: string): Promise<RoomPost | null> {
  try {
    const { data, error } = await supabase
      .from('room_posts')
      .select('id, room_id, user_id, content, media_urls, created_at, updated_at')
      .eq('id', postId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;

    const enriched = await enrichPostsWithAuthorNames([data]);
    return enriched[0] || null;
  } catch (error) {
    console.error('Error fetching room post:', error);
    return null;
  }
}

/**
 * Fetch comments for a post with author profile data
 */
export async function fetchPostComments(postId: string, limit: number = 50): Promise<RoomPostComment[]> {
  try {
    const { data, error } = await supabase
      .from('room_post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    
    const comments = data || [];
    // Enrich comments with author profile data
    return await enrichCommentsWithAuthorData(comments);
  } catch (error) {
    console.error('Error fetching post comments:', error);
    return [];
  }
}

/**
 * Enrich comments with author display names and avatars
 */
async function enrichCommentsWithAuthorData(comments: RoomPostComment[]): Promise<RoomPostComment[]> {
  if (comments.length === 0) return comments;

  const userIds = Array.from(new Set(comments.map((c) => c.user_id)));
  const profilesById = await fetchProfilesByIds(userIds);

  return comments.map((comment) => {
    const profile = profilesById[comment.user_id];
    return {
      ...comment,
      author_display_name: profile?.display_name || undefined,
      profile_display_name: profile?.display_name || undefined,
      profile_avatar_url: profile?.avatar_url || undefined,
    };
  });
}

/**
 * Create a comment
 */
export async function createPostComment(
  postId: string,
  roomId: string,
  userId: string,
  content: string
): Promise<{ success: boolean; comment?: RoomPostComment; error?: string }> {
  try {
    if (!content.trim()) {
      return { success: false, error: 'Comment cannot be empty' };
    }

    const { data, error } = await supabase
      .from('room_post_comments')
      .insert({
        post_id: postId,
        room_id: roomId,
        user_id: userId,
        content,
      })
      .select()
      .single();

    if (error) throw error;

    // Enrich comment with author profile data
    const enriched = await enrichCommentsWithAuthorData([data]);

    // Notify room post author, if different from commenter
    try {
      const { data: post, error: postError } = await supabase
        .from('room_posts')
        .select('id, user_id')
        .eq('id', postId)
        .single();
      if (!postError && post && post.user_id && post.user_id !== userId) {
        await createNotification({
          user_id: post.user_id,
          actor_id: userId,
          type: 'crew_room_reply',
          entity_type: 'room_post',
          entity_id: postId,
          secondary_id: data?.id ?? null,
          title: 'New reply in your crew room',
          body: content,
          data: { route: `/room-post/${postId}` },
        });
      }
    } catch (notifyError) {
      console.log('[Notifications] Failed to create room comment notification:', notifyError);
    }

    return { success: true, comment: enriched[0] };
  } catch (error) {
    console.error('Error creating comment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create comment',
    };
  }
}

/**
 * Create a new post in a room
 */
export async function createRoomPost(
  roomId: string,
  userId: string,
  content: string,
  mediaUrls?: string[] | null
): Promise<{ success: boolean; post?: RoomPost; error?: string }> {
  try {
    if (!content.trim()) {
      return { success: false, error: 'Post content cannot be empty' };
    }

    const { data, error } = await supabase
      .from('room_posts')
      .insert({
        room_id: roomId,
        user_id: userId,
        content,
        media_urls: mediaUrls || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Fire-and-forget notifications to other room members about the new post
    try {
      const { data: members, error: membersError } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', roomId);

      if (!membersError && members && members.length > 0) {
        const targets = members
          .map((m: any) => m.user_id)
          .filter((id: string) => id && id !== userId);

        await Promise.all(
          targets.map((targetId: string) =>
            createNotification({
              user_id: targetId,
              actor_id: userId,
              type: 'room_post',
              entity_type: 'room_post',
              entity_id: data.id,
              body: content,
              data: { route: `/room-post/${data.id}` },
            })
          )
        );
      }
    } catch (notifyError) {
      console.log('[Notifications] Failed to create room_post notifications:', notifyError);
    }

    return { success: true, post: data };
  } catch (error) {
    console.error('Error creating room post:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create post',
    };
  }
}

/**
 * Upload image to Supabase Storage (bucket: room-posts)
 */
export async function uploadPostImage(
  roomId: string,
  userId: string,
  file: { uri: string; name: string; type: string }
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${roomId}/${userId}/${timestamp}-${file.name}`;
    console.log('[UPLOAD] Starting upload, filename:', filename, 'file.uri:', file.uri);

    // For React Native, use FormData to properly upload the file
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('room-posts')
      .upload(filename, formData as any, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('[UPLOAD] Upload error:', error);
      throw error;
    }
    console.log('[UPLOAD] Upload success, data:', data);

    // Get public URL (bucket is public, so no auth needed)
    const { data: publicUrlData } = supabase.storage
      .from('room-posts')
      .getPublicUrl(filename);

    console.log('[UPLOAD] Public URL:', publicUrlData.publicUrl);
    return { success: true, url: publicUrlData.publicUrl };
  } catch (error) {
    console.error('Error uploading image:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload image',
    };
  }
}

/**
 * Delete a post (only by creator or admin)
 */
export async function deleteRoomPost(postId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('room_posts').delete().eq('id', postId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error deleting post:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete post',
    };
  }
}

/**
 * Update a post (only by creator)
 */
export async function updateRoomPost(
  postId: string,
  content: string,
  mediaUrls?: string[] | null
): Promise<{ success: boolean; post?: RoomPost; error?: string }> {
  try {
    if (!content.trim()) {
      return { success: false, error: 'Post content cannot be empty' };
    }

    const { data, error } = await supabase
      .from('room_posts')
      .update({
        content,
        media_urls: mediaUrls,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, post: data };
  } catch (error) {
    console.error('Error updating post:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update post',
    };
  }
}

export interface CommentPreview {
  id: string;
  user_id: string;
  author_name?: string | null;
  content: string;
  created_at: string;
  avatar_url?: string | null;
}

export interface PostCommentSummary {
  [postId: string]: {
    total: number;
    preview: CommentPreview[];
  };
}

/**
 * Batch fetch comment previews for multiple posts
 * Returns last 2 comments and total count per post
 */
export async function fetchCommentPreviews(
  postIds: string[],
  previewCount: number = 2
): Promise<PostCommentSummary> {
  if (postIds.length === 0) return {};

  try {
    // Fetch all comments for these posts
    const { data: comments, error } = await supabase
      .from('room_post_comments')
      .select('id, post_id, user_id, content, created_at')
      .in('post_id', postIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const summary: PostCommentSummary = {};

    // Initialize all posts
    postIds.forEach((postId) => {
      summary[postId] = { total: 0, preview: [] };
    });

    // Group by post and take last N comments
    const commentsByPost: { [postId: string]: CommentPreview[] } = {};
    const userIds = Array.from(new Set((comments || []).map((c) => c.user_id)));

    const profilesById: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      profiles?.forEach((p) => {
        profilesById[p.id] = {
          display_name: p.display_name || null,
          avatar_url: p.avatar_url || null,
        };
      });
    }

    comments?.forEach((c) => {
      if (!commentsByPost[c.post_id]) {
        commentsByPost[c.post_id] = [];
      }
      const profile = profilesById[c.user_id];
      commentsByPost[c.post_id].push({
        id: c.id,
        user_id: c.user_id,
        author_name: profile?.display_name ?? null,
        content: c.content,
        created_at: c.created_at,
        avatar_url: profile?.avatar_url ?? null,
      });
    });

    // Build summary
    Object.keys(commentsByPost).forEach((postId) => {
      const postComments = commentsByPost[postId];
      summary[postId] = {
        total: postComments.length,
        preview: postComments.slice(0, previewCount).reverse(), // Get first N, then reverse to show oldest first
      };
    });

    return summary;
  } catch (error) {
    console.error('Error fetching comment previews:', error);
    return {};
  }
}
