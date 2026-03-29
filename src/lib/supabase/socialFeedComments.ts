import { supabase } from '../supabaseClient';
import { createNotification } from '../../../lib/notifications';

let missingSocialCommentsTableLogged = false;

interface SocialCommentResult {
  success: boolean;
  error?: string;
}

export interface SocialCommentPreview {
  id: string;
  user_id: string;
  author_name?: string | null;
  content: string;
  created_at: string;
  avatar_url?: string | null;
}

export interface SocialPostCommentSummary {
  [postId: string]: {
    total: number;
    preview: SocialCommentPreview[];
  };
}

export async function createSocialPostComment(
  postId: string,
  userId: string,
  body: string,
  parentCommentId?: string | null
): Promise<SocialCommentResult> {
  try {
    const row: Record<string, unknown> = { post_id: postId, user_id: userId, body };
    if (parentCommentId && String(parentCommentId).trim()) {
      row.parent_comment_id = String(parentCommentId).trim();
    }
    const { data, error } = await supabase.from('post_comments').insert(row).select().single();

    if (error) {
      const code = (error as any).code;
      const message = String((error as any).message || '');
      if (code === 'PGRST205' || message.includes("Could not find the table 'public.post_comments'")) {
        if (!missingSocialCommentsTableLogged) {
          console.log('[SocialComments] post_comments table not found; social comments are disabled until migrations run.');
          missingSocialCommentsTableLogged = true;
        }
        return {
          success: false,
          error: 'Social comments are not enabled yet. Run the social comments migration in Supabase.',
        };
      }

      console.log('Error creating social comment:', error);
      return {
        success: false,
        error: 'Could not post your comment. Please try again later.',
      };
    }

    // Fire-and-forget notification to the post author when someone comments
    try {
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('id, user_id')
        .eq('id', postId)
        .single();
      if (!postError && post && post.user_id && post.user_id !== userId) {
        await createNotification({
          user_id: post.user_id,
          actor_id: userId,
          type: 'comment_post',
          entity_type: 'post',
          entity_id: postId,
          secondary_id: data?.id ?? null,
          body: body,
          data: { route: `/post/${postId}` },
        });
      }
    } catch (notifyError) {
      console.log('[Notifications] Failed to create comment_post notification:', notifyError);
    }

    return { success: true };
  } catch (error) {
    console.log('Error creating social comment:', error);
    return {
      success: false,
      error: 'Could not post your comment. Please try again later.',
    };
  }
}

export async function fetchSocialPostComments(postId: string) {
  try {
    const { data, error } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) {
      const code = (error as any).code;
      const message = String((error as any).message || '');
      if (code === 'PGRST205' || message.includes("Could not find the table 'public.post_comments'")) {
        if (!missingSocialCommentsTableLogged) {
          console.log('[SocialComments] post_comments table not found; returning no comments. Run the social comments migration to enable this feature.');
          missingSocialCommentsTableLogged = true;
        }
        return [];
      }
      console.log('Error loading social post comments:', error);
      return [];
    }

    const comments = data || [];
    if (!comments.length) return [];

    const userIds = Array.from(new Set(comments.map((c: any) => c.user_id).filter(Boolean)));

    let profilesById: Record<string, { display_name: string | null; avatar_url: string | null }> = {};

    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        console.log('Error loading profiles for social comments:', profilesError);
      } else if (profiles) {
        profilesById = profiles.reduce((acc: any, profile: any) => {
          acc[profile.id] = {
            display_name: profile.display_name ?? null,
            avatar_url: profile.avatar_url ?? null,
          };
          return acc;
        }, {} as Record<string, { display_name: string | null; avatar_url: string | null }>);
      }
    }

    return comments.map((comment: any) => {
      const profile = profilesById[comment.user_id] || {};
      return {
        ...comment,
        profile_display_name: profile.display_name ?? null,
        profile_avatar_url: profile.avatar_url ?? null,
      };
    });
  } catch (error) {
    console.log('Error loading social post comments:', error);
    return [];
  }
}

/**
 * Batch fetch social comment previews for multiple posts
 * Mirrors fetchCommentPreviews but uses post_comments.body
 */
export async function fetchSocialCommentPreviews(
  postIds: string[],
  previewCount: number = 2
): Promise<SocialPostCommentSummary> {
  if (postIds.length === 0) return {};

  try {
    const { data: comments, error } = await supabase
      .from('post_comments')
      .select('id, post_id, user_id, body, created_at')
      .in('post_id', postIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const summary: SocialPostCommentSummary = {};
    postIds.forEach((postId) => {
      summary[postId] = { total: 0, preview: [] };
    });

    const commentsByPost: { [postId: string]: SocialCommentPreview[] } = {};
    const userIds = Array.from(
      new Set((comments || []).map((c: any) => c.user_id).filter(Boolean))
    );

    const profilesById: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      profiles?.forEach((p: any) => {
        profilesById[p.id] = {
            display_name: p.display_name || null,
            avatar_url: p.avatar_url || null,
        };
      });
    }

    (comments || []).forEach((c: any) => {
      if (!commentsByPost[c.post_id]) {
        commentsByPost[c.post_id] = [];
      }
      const profile = profilesById[c.user_id];
      commentsByPost[c.post_id].push({
        id: c.id,
        user_id: c.user_id,
        author_name: profile?.display_name ?? null,
        content: c.body,
        created_at: c.created_at,
        avatar_url: profile?.avatar_url ?? null,
      });
    });

    Object.keys(commentsByPost).forEach((postId) => {
      const postComments = commentsByPost[postId];
      summary[postId] = {
        total: postComments.length,
        preview: postComments.slice(0, previewCount).reverse(),
      };
    });

    return summary;
  } catch (error) {
    console.log('Error fetching social comment previews:', error);
    return {};
  }
}

export async function deleteSocialFeedPost(postId: string, userId: string) {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('user_id', userId);
  if (error) throw error;
  return true;
}

export async function updateSocialFeedPost(postId: string, userId: string, content: string) {
  const { data, error } = await supabase
    .from('posts')
    .update({ content })
    .eq('id', postId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
