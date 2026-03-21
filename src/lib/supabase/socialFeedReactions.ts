import { supabase } from '../supabaseClient';
import { PostReactionSummary, ReactionType } from './reactions';

let missingSocialReactionsTableLogged = false;

// Fetch reactions summary for social feed posts (using post_reactions table)
export async function fetchSocialFeedReactionsSummary(postIds: string[], userId: string): Promise<PostReactionSummary> {
  if (postIds.length === 0) return {};
  try {
    const { data: reactions, error } = await supabase
      .from('post_reactions')
      .select('post_id, user_id, reaction')
      .in('post_id', postIds);

    if (error) {
      const msg = String((error as any).message || '');
      const code = (error as any).code;
      if (code === 'PGRST205' || msg.includes("Could not find the table 'public.post_reactions'")) {
        if (!missingSocialReactionsTableLogged) {
          console.log('[SocialReactions] post_reactions table not found; returning empty summary. Run 20260301_create_post_reactions.sql to enable social reactions.');
          missingSocialReactionsTableLogged = true;
        }
        return {};
      }
      throw error;
    }

    const summary: PostReactionSummary = {};

    postIds.forEach((postId) => {
      summary[postId] = { counts: {} };
    });

    reactions?.forEach((r: any) => {
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
    console.log('Error fetching social reactions summary:', error);
    return {};
  }
}
