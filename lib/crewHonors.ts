import { supabase } from '../src/lib/supabaseClient';
import { createNotification } from './notifications';

export type CrewHonorReactionType = 'clap' | 'trophy' | 'heart' | 'fire' | 'salute' | 'airplane_star';
export type CrewHonorShareTarget = 'dm' | 'crew_room' | 'feed' | 'copy_link';
export type CrewHonorCategoryGroup = 'professional' | 'community' | 'fun';

export type CrewHonorWinner = {
  id: string;
  cycle_id: string;
  category_id: string;
  winner_user_id: string;
  why_they_won: string;
  short_blurb: string;
  selected_by_mode: 'editorial_only' | 'community_vote' | 'hybrid';
  published_at: string | null;
  category: {
    id: string;
    slug: string;
    title: string;
    short_description: string;
    category_group: CrewHonorCategoryGroup;
    selection_mode: 'editorial_only' | 'community_vote' | 'hybrid';
    accent_primary: string;
    accent_secondary: string;
    trim_color: string;
    display_order: number;
  };
  cycle: {
    id: string;
    title: string;
    month: number;
    year: number;
    status: string;
    nomination_open_at: string;
    nomination_close_at: string;
    voting_open_at: string;
    voting_close_at: string;
    winners_publish_at: string;
  };
  display_name: string;
  avatar_url: string | null;
  use_initials_avatar: boolean;
  initials: string;
  role: string | null;
  base: string | null;
  reaction_counts: Record<CrewHonorReactionType, number>;
  total_reactions: number;
  comments_count: number;
  my_reactions: CrewHonorReactionType[];
};

export type CrewHonorComment = {
  id: string;
  winner_id: string;
  user_id: string;
  body: string;
  created_at: string;
  user_display_name: string;
  user_avatar_url: string | null;
};

const BAD_WORDS = /(fuck|shit|bitch|asshole|dickhead|slur)/i;

function initials(input: string): string {
  const t = input.trim().split(/\s+/).filter(Boolean);
  if (!t.length) return 'FC';
  return t.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function normalizeWinnerDisplay(profile: any, pref: any) {
  if (pref?.declined_public_display) return null;
  const full =
    profile?.display_name?.trim() ||
    profile?.full_name?.trim() ||
    profile?.first_name?.trim() ||
    'Crew Member';
  const displayName =
    pref?.name_display === 'first_name_last_initial'
      ? (() => {
          const parts = full.split(/\s+/).filter(Boolean);
          if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`;
          return parts[0] || 'Crew Member';
        })()
      : full;
  const avatarUrl =
    pref?.alt_photo_url?.trim() ||
    (pref?.use_profile_photo === false ? null : profile?.avatar_url?.trim() || null);
  return {
    display_name: displayName,
    avatar_url: avatarUrl,
    use_initials_avatar: pref?.use_initials_avatar === true,
    initials: initials(displayName),
  };
}

async function fetchEngagement(winnerIds: string[], userId: string | null) {
  const reactionCounts = new Map<string, Record<CrewHonorReactionType, number>>();
  const myReactions = new Map<string, CrewHonorReactionType[]>();
  const commentCounts = new Map<string, number>();
  if (!winnerIds.length) return { reactionCounts, myReactions, commentCounts };

  const [reactionsRes, commentsRes, myRes] = await Promise.all([
    supabase.from('crew_honor_reactions').select('winner_id, reaction').in('winner_id', winnerIds),
    supabase.from('crew_honor_comments').select('winner_id').in('winner_id', winnerIds),
    userId
      ? supabase.from('crew_honor_reactions').select('winner_id, reaction').in('winner_id', winnerIds).eq('user_id', userId)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (!reactionsRes.error) {
    for (const row of reactionsRes.data || []) {
      const c = reactionCounts.get(row.winner_id) || {
        clap: 0,
        trophy: 0,
        heart: 0,
        fire: 0,
        salute: 0,
        airplane_star: 0,
      };
      const k = row.reaction as CrewHonorReactionType;
      c[k] = (c[k] || 0) + 1;
      reactionCounts.set(row.winner_id, c);
    }
  }
  if (!commentsRes.error) {
    for (const row of commentsRes.data || []) {
      commentCounts.set(row.winner_id, (commentCounts.get(row.winner_id) || 0) + 1);
    }
  }
  if (!myRes.error) {
    for (const row of myRes.data || []) {
      const list = myReactions.get(row.winner_id) || [];
      list.push(row.reaction as CrewHonorReactionType);
      myReactions.set(row.winner_id, list);
    }
  }
  return { reactionCounts, myReactions, commentCounts };
}

function toWinner(row: any, engagement: any): CrewHonorWinner | null {
  const display = normalizeWinnerDisplay(row.winner, row.preference || null);
  if (!display) return null;
  const counts = engagement.reactionCounts.get(row.id) || {
    clap: 0,
    trophy: 0,
    heart: 0,
    fire: 0,
    salute: 0,
    airplane_star: 0,
  };
  return {
    id: row.id,
    cycle_id: row.cycle_id,
    category_id: row.category_id,
    winner_user_id: row.winner_user_id,
    why_they_won: row.why_they_won,
    short_blurb: row.short_blurb,
    selected_by_mode: row.selected_by_mode,
    published_at: row.published_at || null,
    category: row.category,
    cycle: row.cycle,
    display_name: display.display_name,
    avatar_url: display.avatar_url,
    use_initials_avatar: display.use_initials_avatar,
    initials: display.initials,
    role: row.winner?.role || null,
    base: row.winner?.base || null,
    reaction_counts: counts,
    total_reactions: (Object.values(counts) as number[]).reduce((a, b) => a + (b || 0), 0),
    comments_count: engagement.commentCounts.get(row.id) || 0,
    my_reactions: engagement.myReactions.get(row.id) || [],
  };
}

function winnerSelect() {
  return `
    id, cycle_id, category_id, winner_user_id, why_they_won, short_blurb, selected_by_mode, published_at,
    category:crew_honor_categories!inner(id, slug, title, short_description, category_group, selection_mode, accent_primary, accent_secondary, trim_color, display_order),
    cycle:crew_honor_cycles!inner(id, title, month, year, status, nomination_open_at, nomination_close_at, voting_open_at, voting_close_at, winners_publish_at),
    winner:profiles!crew_honor_winners_winner_user_id_fkey(id, display_name, full_name, first_name, avatar_url, role, base),
    preference:crew_honor_winner_preferences(winner_id, declined_public_display, name_display, use_profile_photo, use_initials_avatar, alt_photo_url)
  `;
}

export async function getCrewHonorsHomeWinners(userId: string | null): Promise<CrewHonorWinner[]> {
  const { data, error } = await supabase
    .from('crew_honor_winners')
    .select(winnerSelect())
    .eq('is_published', true)
    .eq('cycle.status', 'published')
    .order('display_order', { foreignTable: 'crew_honor_categories', ascending: true })
    .limit(20);
  if (error) return [];
  const engagement = await fetchEngagement((data || []).map((r: any) => r.id), userId);
  return (data || []).map((row: any) => toWinner(row, engagement)).filter(Boolean) as CrewHonorWinner[];
}

export async function getCrewHonorsCycles() {
  const { data, error } = await supabase
    .from('crew_honor_cycles')
    .select('id, title, month, year, status, nomination_open_at, nomination_close_at, voting_open_at, voting_close_at, winners_publish_at')
    .in('status', ['nominations_open', 'shortlist_review', 'voting_open', 'voting_closed', 'published', 'archived'])
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) return [];
  return data || [];
}

export async function getCrewHonorsByCycle(cycleId: string, userId: string | null, group: CrewHonorCategoryGroup | 'all' = 'all') {
  let query = supabase
    .from('crew_honor_winners')
    .select(winnerSelect())
    .eq('cycle_id', cycleId)
    .eq('is_published', true)
    .order('display_order', { foreignTable: 'crew_honor_categories', ascending: true });
  if (group !== 'all') query = query.eq('category.category_group', group);
  const { data, error } = await query;
  if (error) return [];
  const engagement = await fetchEngagement((data || []).map((r: any) => r.id), userId);
  return (data || []).map((row: any) => toWinner(row, engagement)).filter(Boolean) as CrewHonorWinner[];
}

export async function getCrewHonorWinnerDetail(winnerId: string, userId: string | null) {
  const { data, error } = await supabase
    .from('crew_honor_winners')
    .select(winnerSelect())
    .eq('id', winnerId)
    .eq('is_published', true)
    .maybeSingle();
  if (error || !data) return null;
  const engagement = await fetchEngagement([winnerId], userId);
  return toWinner(data, engagement);
}

export async function getCrewHonorComments(winnerId: string): Promise<CrewHonorComment[]> {
  const { data, error } = await supabase
    .from('crew_honor_comments')
    .select('id, winner_id, user_id, body, created_at, author:profiles!crew_honor_comments_user_id_fkey(id, display_name, full_name, first_name, avatar_url)')
    .eq('winner_id', winnerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((row: any) => ({
    id: row.id,
    winner_id: row.winner_id,
    user_id: row.user_id,
    body: row.body,
    created_at: row.created_at,
    user_display_name:
      row.author?.display_name?.trim() || row.author?.full_name?.trim() || row.author?.first_name?.trim() || 'Crew Member',
    user_avatar_url: row.author?.avatar_url || null,
  }));
}

export async function submitCrewHonorNomination(input: {
  cycleId: string;
  categoryId: string;
  nomineeUserId: string;
  reason: string;
  storyContext?: string;
  isAnonymousToPublic: boolean;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { ok: false as const, error: 'You must be signed in.' };
  if (BAD_WORDS.test(`${input.reason} ${input.storyContext || ''}`)) {
    return { ok: false as const, error: 'Please keep nominations respectful.' };
  }
  const { error } = await supabase.from('crew_honor_nominations').insert({
    cycle_id: input.cycleId,
    category_id: input.categoryId,
    nominator_id: user.id,
    nominee_user_id: input.nomineeUserId,
    reason: input.reason.trim(),
    story_context: input.storyContext?.trim() || null,
    is_anonymous_to_public: input.isAnonymousToPublic,
  });
  if (error) return { ok: false as const, error: error.message };
  if (input.nomineeUserId !== user.id) {
    await createNotification({
      user_id: input.nomineeUserId,
      actor_id: user.id,
      type: 'crew_honor_nominated',
      entity_type: 'crew_honor_cycle',
      entity_id: input.cycleId,
      title: 'You were nominated',
      body: 'You were nominated for Crew Honors.',
      data: { route: '/crew-honors' },
    }).catch(() => {});
  }
  return { ok: true as const };
}

export async function getCrewHonorFinalistsForVoting(cycleId: string) {
  const { data, error } = await supabase
    .from('crew_honor_finalists')
    .select(`
      id, cycle_id, category_id, nominee_user_id,
      category:crew_honor_categories!inner(id, title, slug, category_group, selection_mode, display_order),
      nominee:profiles!crew_honor_finalists_nominee_user_id_fkey(id, display_name, full_name, first_name, avatar_url)
    `)
    .eq('cycle_id', cycleId)
    .order('display_order', { foreignTable: 'crew_honor_categories', ascending: true });
  if (error) return [];
  return data || [];
}

export async function submitCrewHonorVote(input: { cycleId: string; categoryId: string; finalistId: string }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { ok: false as const, error: 'You must be signed in.' };
  const { error } = await supabase.from('crew_honor_votes').upsert({
    cycle_id: input.cycleId,
    category_id: input.categoryId,
    finalist_id: input.finalistId,
    voter_user_id: user.id,
  }, { onConflict: 'cycle_id,category_id,voter_user_id' });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function toggleCrewHonorReaction(winnerId: string, reaction: CrewHonorReactionType) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { ok: false as const, error: 'You must be signed in.' };
  const { data: existing } = await supabase
    .from('crew_honor_reactions')
    .select('id')
    .eq('winner_id', winnerId)
    .eq('user_id', user.id)
    .eq('reaction', reaction)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from('crew_honor_reactions').delete().eq('id', existing.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  }
  const { error } = await supabase.from('crew_honor_reactions').insert({ winner_id: winnerId, user_id: user.id, reaction });
  if (error) return { ok: false as const, error: error.message };
  const { data: winnerRow } = await supabase
    .from('crew_honor_winners')
    .select('winner_user_id')
    .eq('id', winnerId)
    .maybeSingle();
  if (winnerRow?.winner_user_id && winnerRow.winner_user_id !== user.id) {
    await createNotification({
      user_id: winnerRow.winner_user_id,
      actor_id: user.id,
      type: 'crew_honor_reaction',
      entity_type: 'crew_honor',
      entity_id: winnerId,
      title: 'Crew Honors reaction',
      body: 'Someone reacted to your Crew Honors award.',
      data: { route: `/crew-honors/${encodeURIComponent(winnerId)}` },
    }).catch(() => {});
  }
  return { ok: true as const };
}

export async function addCrewHonorComment(winnerId: string, body: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { ok: false as const, error: 'You must be signed in.' };
  const text = body.trim();
  if (!text) return { ok: false as const, error: 'Comment cannot be empty.' };
  if (BAD_WORDS.test(text)) return { ok: false as const, error: 'Please keep comments supportive.' };
  const { error } = await supabase.from('crew_honor_comments').insert({ winner_id: winnerId, user_id: user.id, body: text });
  if (error) return { ok: false as const, error: error.message };
  const { data: winnerRow } = await supabase
    .from('crew_honor_winners')
    .select('winner_user_id')
    .eq('id', winnerId)
    .maybeSingle();
  if (winnerRow?.winner_user_id && winnerRow.winner_user_id !== user.id) {
    await createNotification({
      user_id: winnerRow.winner_user_id,
      actor_id: user.id,
      type: 'crew_honor_comment',
      entity_type: 'crew_honor',
      entity_id: winnerId,
      title: 'Crew Honors comment',
      body: 'Someone commented on your Crew Honors award.',
      data: { route: `/crew-honors/${encodeURIComponent(winnerId)}` },
    }).catch(() => {});
  }
  return { ok: true as const };
}

export async function deleteCrewHonorComment(commentId: string) {
  await supabase.from('crew_honor_comments').delete().eq('id', commentId);
}

export async function reportCrewHonorComment(commentId: string, reason: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  await supabase.from('crew_honor_comment_reports').upsert(
    { comment_id: commentId, reported_by: user.id, reason: reason.trim() },
    { onConflict: 'comment_id,reported_by' }
  );
}

export async function trackCrewHonorShare(winnerId: string, target: CrewHonorShareTarget, targetId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  await supabase.from('crew_honor_shares').insert({
    winner_id: winnerId,
    shared_by: user.id,
    target,
    target_id: targetId || null,
  });
}

export async function updateCrewHonorWinnerPreference(input: {
  winnerId: string;
  useProfilePhoto: boolean;
  altPhotoUrl?: string | null;
  useInitialsAvatar: boolean;
  nameDisplay: 'full_name' | 'first_name_last_initial';
  declinedPublicDisplay: boolean;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { ok: false as const, error: 'You must be signed in.' };
  const { error } = await supabase.from('crew_honor_winner_preferences').upsert(
    {
      winner_id: input.winnerId,
      winner_user_id: user.id,
      use_profile_photo: input.useProfilePhoto,
      alt_photo_url: input.altPhotoUrl || null,
      use_initials_avatar: input.useInitialsAvatar,
      name_display: input.nameDisplay,
      declined_public_display: input.declinedPublicDisplay,
    },
    { onConflict: 'winner_id' }
  );
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function getCrewHonorCategories() {
  const { data, error } = await supabase
    .from('crew_honor_categories')
    .select('id, slug, title, short_description, category_group, selection_mode, accent_primary, accent_secondary, trim_color, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (error) return [];
  return data || [];
}

export async function getActiveCycleForNominations() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('crew_honor_cycles')
    .select('id, title, month, year, status, nomination_open_at, nomination_close_at, voting_open_at, voting_close_at, winners_publish_at')
    .lte('nomination_open_at', nowIso)
    .gte('nomination_close_at', nowIso)
    .eq('status', 'nominations_open')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data || null;
}
