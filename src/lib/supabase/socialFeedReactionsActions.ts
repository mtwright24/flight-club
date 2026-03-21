import { supabase } from '../supabaseClient';
import { ReactionType } from './reactions';
import { createNotification } from '../../../lib/notifications';
import { fetchRoomPostById } from './posts';

// Toggle a social post reaction in post_reactions (same behavior as room_post_reactions)
export async function toggleSocialPostReaction(
  postId: string,
  userId: string,
  reactionType: ReactionType
): Promise<{ success: boolean; action: 'added' | 'removed' | 'changed'; error?: string }> {
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('post_reactions')
      .select('id, reaction')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

    if (existing) {
      if (existing.reaction === reactionType) {
        const { error: deleteError } = await supabase
          .from('post_reactions')
          .delete()
          .eq('id', existing.id);

        if (deleteError) throw deleteError;
        return { success: true, action: 'removed' };
      } else {
        const { error: updateError } = await supabase
          .from('post_reactions')
          .update({ reaction: reactionType })
          .eq('id', existing.id);

        if (updateError) throw updateError;
        return { success: true, action: 'changed' };
      }
    } else {
      const { error: insertError } = await supabase
        .from('post_reactions')
        .insert({ post_id: postId, user_id: userId, reaction: reactionType });

      if (insertError) throw insertError;

      // Fire-and-forget notification to the post author (social feed)
      try {
        // Social posts live in posts table, but we can re-use getPostById from lib/feed;
        // here we call directly via supabase to avoid circular deps.
        const { data: post, error: postError } = await supabase
          .from('posts')
          .select('id, user_id')
          .eq('id', postId)
          .single();
        if (!postError && post && post.user_id && post.user_id !== userId) {
          await createNotification({
            user_id: post.user_id,
            actor_id: userId,
            type: 'like_post',
            entity_type: 'post',
            entity_id: postId,
            data: { route: `/post/${postId}` },
          });
        }
      } catch (notifyError) {
        console.log('[Notifications] Failed to create like_post notification:', notifyError);
      }

      return { success: true, action: 'added' };
    }
  } catch (error) {
    console.error('Error toggling social post reaction:', error);
    return { success: false, action: 'removed', error: String(error) };
  }
}

// Backwards-compatible like-only helper used by the social detail screen
export async function toggleSocialPostLike(postId: string, userId: string) {
  const result = await toggleSocialPostReaction(postId, userId, 'solid');
  return result.action !== 'removed';
}
