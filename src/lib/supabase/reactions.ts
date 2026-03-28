import { supabase } from '../supabaseClient';

export type ReactionType = 
  | 'solid' 
  | 'love' 
  | 'dead' 
  | 'yikes' 
  | 'tea' 
  | 'heads_up' 
  | 'cap' 
  | 'yeah_sure' 
  | 'nah';

export interface ReactionConfig {
  type: ReactionType;
  emoji: string;
  label: string;
}

export const REACTIONS: ReactionConfig[] = [
  { type: 'solid', emoji: '👍', label: 'Solid' },
  { type: 'nah', emoji: '👎', label: 'Nah' },
  { type: 'love', emoji: '❤️', label: 'Love' },
  { type: 'dead', emoji: '😂', label: 'Dead' },
  { type: 'yikes', emoji: '😬', label: 'Yikes' },
  { type: 'tea', emoji: '☕️', label: 'Tea' },
  { type: 'heads_up', emoji: '🚨', label: 'Heads up' },
  { type: 'cap', emoji: '🧢', label: 'Cap' },
  { type: 'yeah_sure', emoji: '🙄', label: 'Yeah sure' },
];

export interface PostReactionSummary {
  [postId: string]: {
    counts: { [reaction: string]: number };
    userReaction?: ReactionType;
  };
}

export interface CommentReactionSummary {
  [commentId: string]: {
    counts: { [reaction: string]: number };
    userReaction?: ReactionType;
  };
}

let missingReactionsTableLogged = false;

/**
 * Fetch reaction summary for multiple posts
 * Returns counts per reaction per post and the current user's reaction
 */
export async function fetchPostReactionsSummary(
  postIds: string[],
  userId: string
): Promise<PostReactionSummary> {
  if (postIds.length === 0) return {};

  try {
    // Fetch all reactions for these posts
    const { data: reactions, error } = await supabase
      .from('room_post_reactions')
      .select('post_id, user_id, reaction')
      .in('post_id', postIds);

    if (error) throw error;

    const summary: PostReactionSummary = {};

    // Initialize all posts
    postIds.forEach((postId) => {
      summary[postId] = { counts: {} };
    });

    // Aggregate counts and identify user's reaction
    reactions?.forEach((r) => {
      if (!summary[r.post_id]) {
        summary[r.post_id] = { counts: {} };
      }

      const currentCount = summary[r.post_id].counts[r.reaction] || 0;
      summary[r.post_id].counts[r.reaction] = currentCount + 1;

      if (r.user_id === userId) {
        summary[r.post_id].userReaction = r.reaction as ReactionType;
      }
    });

    return summary;
  } catch (error) {
    // Gracefully handle missing tables during initial setup
    const errorMsg = String(error);
    if (errorMsg.includes('Could not find the table') || errorMsg.includes('PGRST205')) {
      if (!missingReactionsTableLogged) {
        console.log('[Reactions] Tables not yet migrated, returning empty summary');
        missingReactionsTableLogged = true;
      }
      return {};
    }
    console.error('Error fetching post reactions summary:', error);
    return {};
  }
}

/**
 * Fetch reaction summary for multiple comments
 * Returns counts per reaction per comment and the current user's reaction
 */
export async function fetchCommentReactionsSummary(
  commentIds: string[],
  userId: string
): Promise<CommentReactionSummary> {
  if (commentIds.length === 0) return {};

  try {
    // Fetch all reactions for these comments
    const { data: reactions, error } = await supabase
      .from('room_post_comment_reactions')
      .select('comment_id, user_id, reaction')
      .in('comment_id', commentIds);

    if (error) throw error;

    const summary: CommentReactionSummary = {};

    // Initialize all comments
    commentIds.forEach((commentId) => {
      summary[commentId] = { counts: {} };
    });

    // Aggregate counts and identify user's reaction
    reactions?.forEach((r) => {
      if (!summary[r.comment_id]) {
        summary[r.comment_id] = { counts: {} };
      }

      const currentCount = summary[r.comment_id].counts[r.reaction] || 0;
      summary[r.comment_id].counts[r.reaction] = currentCount + 1;

      if (r.user_id === userId) {
        summary[r.comment_id].userReaction = r.reaction as ReactionType;
      }
    });

    return summary;
  } catch (error) {
    // Gracefully handle missing tables during initial setup
    const errorMsg = String(error);
    if (errorMsg.includes('Could not find the table') || errorMsg.includes('PGRST205')) {
      if (!missingReactionsTableLogged) {
        console.log('[Reactions] Tables not yet migrated, returning empty summary');
        missingReactionsTableLogged = true;
      }
      return {};
    }
    console.error('Error fetching comment reactions summary:', error);
    return {};
  }
}

/**
 * Toggle a post reaction
 * If user has the same reaction -> delete
 * If user has a different reaction -> update
 * If user has no reaction -> insert
 */
export async function togglePostReaction(
  postId: string,
  userId: string,
  reactionType: ReactionType
): Promise<{ success: boolean; action: 'added' | 'removed' | 'changed'; error?: string }> {
  try {
    // Check if user already has a reaction on this post
    const { data: existing, error: fetchError } = await supabase
      .from('room_post_reactions')
      .select('id, reaction')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (existing) {
      // User has existing reaction
      if (existing.reaction === reactionType) {
        // Same reaction -> remove it
        const { error: deleteError } = await supabase
          .from('room_post_reactions')
          .delete()
          .eq('id', existing.id);

        if (deleteError) throw deleteError;
        return { success: true, action: 'removed' };
      } else {
        // Different reaction -> update it
        const { error: updateError } = await supabase
          .from('room_post_reactions')
          .update({ reaction: reactionType })
          .eq('id', existing.id);

        if (updateError) throw updateError;
        return { success: true, action: 'changed' };
      }
    } else {
      // No existing reaction -> insert new one
      const { error: insertError } = await supabase
        .from('room_post_reactions')
        .insert({
          post_id: postId,
          user_id: userId,
          reaction: reactionType,
        });

      if (insertError) throw insertError;
      return { success: true, action: 'added' };
    }
  } catch (error) {
    console.error('Error toggling post reaction:', error);
    return { success: false, action: 'removed', error: String(error) };
  }
}

/**
 * Toggle a comment reaction
 * If user has the same reaction -> delete
 * If user has a different reaction -> update
 * If user has no reaction -> insert
 */
export async function toggleCommentReaction(
  commentId: string,
  userId: string,
  reactionType: ReactionType
): Promise<{ success: boolean; action: 'added' | 'removed' | 'changed'; error?: string }> {
  try {
    // Check if user already has a reaction on this comment
    const { data: existing, error: fetchError } = await supabase
      .from('room_post_comment_reactions')
      .select('id, reaction')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (existing) {
      // User has existing reaction
      if (existing.reaction === reactionType) {
        // Same reaction -> remove it
        const { error: deleteError } = await supabase
          .from('room_post_comment_reactions')
          .delete()
          .eq('id', existing.id);

        if (deleteError) throw deleteError;
        return { success: true, action: 'removed' };
      } else {
        // Different reaction -> update it
        const { error: updateError } = await supabase
          .from('room_post_comment_reactions')
          .update({ reaction: reactionType })
          .eq('id', existing.id);

        if (updateError) throw updateError;
        return { success: true, action: 'changed' };
      }
    } else {
      // No existing reaction -> insert new one
      const { error: insertError } = await supabase
        .from('room_post_comment_reactions')
        .insert({
          comment_id: commentId,
          user_id: userId,
          reaction: reactionType,
        });

      if (insertError) throw insertError;
      return { success: true, action: 'added' };
    }
  } catch (error) {
    console.error('Error toggling comment reaction:', error);
    return { success: false, action: 'removed', error: String(error) };
  }
}

/** Social feed `post_comments` — same shape as {@link fetchCommentReactionsSummary} for room comments. */
export async function fetchSocialCommentReactionsSummary(
  commentIds: string[],
  userId: string
): Promise<CommentReactionSummary> {
  if (commentIds.length === 0) return {};

  try {
    const { data: reactions, error } = await supabase
      .from('post_comment_reactions')
      .select('comment_id, user_id, reaction')
      .in('comment_id', commentIds);

    if (error) throw error;

    const summary: CommentReactionSummary = {};
    commentIds.forEach((commentId) => {
      summary[commentId] = { counts: {} };
    });

    reactions?.forEach((r: { comment_id: string; user_id: string; reaction: string }) => {
      if (!summary[r.comment_id]) {
        summary[r.comment_id] = { counts: {} };
      }
      const currentCount = summary[r.comment_id].counts[r.reaction] || 0;
      summary[r.comment_id].counts[r.reaction] = currentCount + 1;
      if (r.user_id === userId) {
        summary[r.comment_id].userReaction = r.reaction as ReactionType;
      }
    });

    return summary;
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('Could not find the table') || errorMsg.includes('PGRST205')) {
      if (!missingReactionsTableLogged) {
        console.log('[Reactions] post_comment_reactions not migrated yet; empty summary');
        missingReactionsTableLogged = true;
      }
      return {};
    }
    console.error('Error fetching social comment reactions summary:', error);
    return {};
  }
}

export async function toggleSocialCommentReaction(
  commentId: string,
  userId: string,
  reactionType: ReactionType
): Promise<{ success: boolean; action: 'added' | 'removed' | 'changed'; error?: string }> {
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('post_comment_reactions')
      .select('id, reaction')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (existing) {
      if (existing.reaction === reactionType) {
        const { error: deleteError } = await supabase
          .from('post_comment_reactions')
          .delete()
          .eq('id', existing.id);
        if (deleteError) throw deleteError;
        return { success: true, action: 'removed' };
      }
      const { error: updateError } = await supabase
        .from('post_comment_reactions')
        .update({ reaction: reactionType })
        .eq('id', existing.id);
      if (updateError) throw updateError;
      return { success: true, action: 'changed' };
    }

    const { error: insertError } = await supabase.from('post_comment_reactions').insert({
      comment_id: commentId,
      user_id: userId,
      reaction: reactionType,
    });
    if (insertError) throw insertError;
    return { success: true, action: 'added' };
  } catch (error) {
    console.error('Error toggling social comment reaction:', error);
    return { success: false, action: 'removed', error: String(error) };
  }
}
