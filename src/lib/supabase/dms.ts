import { createNotification } from '../../../lib/notifications';
import { supabase } from '../supabaseClient';

type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

async function fetchProfilesByUserIds(userIds: string[]): Promise<Map<string, ProfileLite>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, ProfileLite>();
  if (!unique.length) return map;

  const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', unique);

  if (error) {
    console.warn('[DM] fetchProfilesByUserIds:', error.message);
    return map;
  }

  for (const p of data || []) {
    map.set(p.id, {
      id: p.id,
      display_name: p.display_name ?? null,
      avatar_url: p.avatar_url ?? null,
    });
  }
  return map;
}

function hydrateParticipantRows(
  rows: { user_id: string; profile: any }[],
  profileMap: Map<string, ProfileLite>
): { user_id: string; profile: any }[] {
  return rows.map((row) => {
    const fetched = profileMap.get(row.user_id);
    if (fetched) {
      return {
        user_id: row.user_id,
        profile: {
          id: fetched.id,
          display_name: fetched.display_name,
          avatar_url: fetched.avatar_url,
        },
      };
    }
    return row;
  });
}

export type Conversation = {
  id: string;
  created_at: string;
  updated_at: string | null;
};

export type ConversationParticipant = {
  user_id: string;
  profile: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type DMMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  is_read: boolean;
  message_type: string;
  media_url: string | null;
  post_id: string | null;
};

// Basic permission check for starting a DM
// - Public profiles: always ok
// - Private profiles: ok if current user follows target, otherwise it will be treated as a request
export async function canDM(currentUserId: string, targetUserId: string): Promise<boolean> {
  if (currentUserId === targetUserId) return true;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_private')
    .eq('id', targetUserId)
    .single();

  if (profileError || !profile) return false;

  // Public profile: always allow
  if (!profile.is_private) return true;

  // Private profile: require follow relationship
  const { data: follow } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', currentUserId)
    .eq('following_id', targetUserId)
    .maybeSingle();

  return !!follow;
}

function sortThreadsNewestFirst<T extends { last_message?: { created_at?: string } | null; updated_at?: string | null; created_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const timeA = new Date(a.last_message?.created_at || a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.last_message?.created_at || b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });
}

function mapRawRowToLastMessage(m: any) {
  if (!m) return null;
  return {
    id: m.id,
    sender_id: m.sender_id,
    body: m.message_text ?? '',
    created_at: m.created_at,
    is_read: m.is_read,
    message_type: m.message_type,
    media_url: m.media_url,
    post_id: m.post_id,
  };
}

/** Latest row per thread — avoids broken/unordered nested `dm_messages` embeds on inbox queries. */
async function fetchLatestMessageForConversation(conversationId: string) {
  const { data, error } = await supabase
    .from('dm_messages')
    .select('id, sender_id, message_text, created_at, is_read, message_type, media_url, post_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[DM] fetchLatestMessageForConversation:', conversationId, error.message);
    return null;
  }
  return data;
}

type InboxConversation = {
  id: string;
  created_at: string;
  updated_at: string | null;
  participants: { user_id: string; profile: any }[];
  last_message: ReturnType<typeof mapRawRowToLastMessage>;
};

/** Newest activity first; stable tie-break on conversation id. */
function compareInboxConversationRecency(a: InboxConversation, b: InboxConversation): number {
  const lm = (c: InboxConversation) => new Date(c.last_message?.created_at || 0).getTime();
  if (lm(b) !== lm(a)) return lm(b) - lm(a);
  const up = (c: InboxConversation) => new Date(c.updated_at || 0).getTime();
  if (up(b) !== up(a)) return up(b) - up(a);
  const cr = (c: InboxConversation) => new Date(c.created_at || 0).getTime();
  if (cr(b) !== cr(a)) return cr(b) - cr(a);
  return a.id.localeCompare(b.id);
}

/** Prefer conversations not in the pending-request set when comparing (mainly for shared ranking helpers). */
function compareInboxCandidates(
  a: InboxConversation,
  b: InboxConversation,
  pendingConversationIds: Set<string>
): number {
  const pa = pendingConversationIds.has(a.id);
  const pb = pendingConversationIds.has(b.id);
  if (pa !== pb) return pa ? 1 : -1;
  return compareInboxConversationRecency(a, b);
}

/**
 * One row per other participant for strict 1:1 threads (exactly two distinct user ids).
 * Multi-participant threads are passed through unchanged for future group DMs.
 */
function dedupeOneToOneInboxForViewer(
  viewerId: string,
  items: InboxConversation[],
  pendingConversationIds: Set<string>
): InboxConversation[] {
  const nonOneToOne: InboxConversation[] = [];
  const oneToOne: InboxConversation[] = [];

  for (const c of items) {
    const userIds = [...new Set(c.participants.map((p) => p.user_id).filter(Boolean))];
    if (userIds.length !== 2) {
      nonOneToOne.push(c);
      continue;
    }
    oneToOne.push(c);
  }

  const byOther = new Map<string, InboxConversation[]>();
  for (const c of oneToOne) {
    const otherId = c.participants.find((p) => p.user_id !== viewerId)?.user_id;
    if (!otherId) {
      nonOneToOne.push(c);
      continue;
    }
    if (!byOther.has(otherId)) byOther.set(otherId, []);
    byOther.get(otherId)!.push(c);
  }

  const dedupedPairs: InboxConversation[] = [];
  for (const [, group] of byOther) {
    if (group.length === 1) {
      dedupedPairs.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((a, b) => compareInboxCandidates(a, b, pendingConversationIds));
    dedupedPairs.push(sorted[0]);
  }

  return [...dedupedPairs, ...nonOneToOne];
}

async function buildInboxConversationsForIds(convoIds: string[]): Promise<InboxConversation[]> {
  if (!convoIds.length) {
    return [];
  }

  const [{ data: convoRows, error: convoErr }, firstParts] = await Promise.all([
    supabase.from('dm_conversations').select('id, created_at, updated_at').in('id', convoIds),
    supabase
      .from('dm_conversation_participants')
      .select('conversation_id, user_id, profiles:profiles!user_id(id, display_name, avatar_url)')
      .in('conversation_id', convoIds),
  ]);

  // Inbox must still list threads if dm_conversations RLS is stricter than participants/messages.
  if (convoErr) {
    console.warn('[DM] inbox: dm_conversations batch read failed (using message timestamps only):', convoErr.message);
  }

  let allParts = firstParts.data;
  let partErr = firstParts.error;
  if (partErr) {
    console.warn('[DM] inbox: participant+profile embed failed, retrying without profile join:', partErr.message);
    const retry = await supabase
      .from('dm_conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', convoIds);
    if (retry.error) throw retry.error;
    allParts = (retry.data || []).map((p: any) => ({ ...p, profiles: null }));
  }

  const metaById = new Map((convoErr ? [] : convoRows || []).map((c: any) => [c.id, c]));
  const participantsByConvo = new Map<string, { user_id: string; profile: any }[]>();
  for (const p of allParts || []) {
    const cid = (p as any).conversation_id;
    if (!participantsByConvo.has(cid)) participantsByConvo.set(cid, []);
    participantsByConvo.get(cid)!.push({
      user_id: (p as any).user_id,
      profile: (p as any).profiles || null,
    });
  }

  const profileMap = await fetchProfilesByUserIds((allParts || []).map((p: any) => p.user_id).filter(Boolean));
  for (const cid of participantsByConvo.keys()) {
    const parts = participantsByConvo.get(cid)!;
    participantsByConvo.set(cid, hydrateParticipantRows(parts, profileMap));
  }

  const lastRows = await Promise.all(convoIds.map((id) => fetchLatestMessageForConversation(id)));

  const built = convoIds.map((id, i) => {
    const meta = metaById.get(id);
    return {
      id,
      created_at: meta?.created_at ?? '',
      updated_at: meta?.updated_at ?? null,
      participants: participantsByConvo.get(id) || [],
      last_message: mapRawRowToLastMessage(lastRows[i]),
    };
  });

  return built;
}

async function sortOneToOneConversationIdsByRecency(ids: string[]): Promise<string[]> {
  if (ids.length <= 1) return ids;
  const built = await buildInboxConversationsForIds(ids);
  const byId = new Map(built.map((c) => [c.id, c]));
  return [...ids].sort((a, b) => {
    const ca = byId.get(a);
    const cb = byId.get(b);
    if (!ca || !cb) return a.localeCompare(b);
    return compareInboxConversationRecency(ca, cb);
  });
}

// Generate a UUID v4 client-side (needed to insert dm_conversations without relying on RETURNING).
function generateUuidV4(): string {
  const cryptoAny: any = (globalThis as any).crypto;
  if (cryptoAny?.randomUUID && typeof cryptoAny.randomUUID === 'function') {
    return cryptoAny.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoAny?.getRandomValues && typeof cryptoAny.getRandomValues === 'function') {
    cryptoAny.getRandomValues(bytes);
  } else {
    // Fallback: still produces a valid UUID format, but is less cryptographically strong.
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Set version to 4 and variant to RFC4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Fetch all DM conversations for a user (inbox)
// Returns: [{ id, participants: [{user_id, profile}], last_message }]
export async function fetchInbox(userId: string) {
  // Conversations that are pending message requests *to* this user should
  // not appear in the main inbox; they will be handled in a Requests list.
  const { data: pendingReqs } = await supabase
    .from('dm_message_requests')
    .select('conversation_id')
    .eq('to_user_id', userId)
    .eq('status', 'pending');
  const pendingConversationIds = new Set((pendingReqs || []).map((r: any) => r.conversation_id));

  // Do NOT use dm_conversations!inner here: if RLS differs between participants and conversations,
  // the inner join returns zero rows even though the user has valid participant rows (inbox looks empty).
  const { data, error } = await supabase
    .from('dm_conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  const convoIds = [...new Set((data || []).map((row: any) => row.conversation_id).filter(Boolean))];

  const mapped = await buildInboxConversationsForIds(convoIds);

  const filtered = mapped.filter((c: any) => !pendingConversationIds.has(c.id));
  const deduped = dedupeOneToOneInboxForViewer(userId, filtered, pendingConversationIds);

  return sortThreadsNewestFirst(deduped);
}

// Fetch DM conversations that are pending as message requests for this user
export async function fetchMessageRequestsInbox(userId: string) {
  const { data: reqs, error: reqError } = await supabase
    .from('dm_message_requests')
    .select('conversation_id')
    .eq('to_user_id', userId)
    .eq('status', 'pending');

  if (reqError || !reqs || reqs.length === 0) return [];
  const convoIds = [...new Set(reqs.map((r: any) => r.conversation_id).filter(Boolean))];

  try {
    const mapped = await buildInboxConversationsForIds(convoIds);
    return sortThreadsNewestFirst(mapped);
  } catch (e) {
    console.warn('[DM] fetchMessageRequestsInbox build failed:', e);
    return [];
  }
}

// Fetch all messages in a DM thread
// Returns: { messages: [{ id, body, sender_id, created_at }], participants: [{ user_id, profile }] }
export async function fetchThread(conversationId: string, userId: string) {
  const cid = (conversationId || '').trim();
  if (!cid) {
    throw new Error('Missing conversation id');
  }

  const { data: messagesData, error: msgError } = await supabase
    .from('dm_messages')
    .select('id, conversation_id, sender_id, message_text, created_at, is_read, message_type, media_url, post_id')
    .eq('conversation_id', cid)
    .order('created_at', { ascending: true });

  if (msgError) {
    throw msgError;
  }

  let participantsData: any[] | null = null;
  const { data: partsWithProfile, error: pError } = await supabase
    .from('dm_conversation_participants')
    .select('user_id, profiles:profiles!user_id(id, display_name, avatar_url)')
    .eq('conversation_id', cid);

  if (pError) {
    console.warn('[DM] fetchThread: profile embed failed, retrying participants only:', pError.message);
    const { data: partsPlain, error: p2 } = await supabase
      .from('dm_conversation_participants')
      .select('user_id')
      .eq('conversation_id', cid);
    if (p2) throw p2;
    participantsData = (partsPlain || []).map((p: any) => ({ user_id: p.user_id, profiles: null }));
  } else {
    participantsData = partsWithProfile;
  }

  // Mark peer messages as read for this viewer. Supabase returns { error }; it does not throw.
  const { error: readErr } = await supabase
    .from('dm_messages')
    .update({ is_read: true })
    .eq('conversation_id', cid)
    .neq('sender_id', userId);

  if (readErr) {
    console.warn('[DM] mark messages read failed (non-fatal):', readErr.message);
  }

  const messages: DMMessage[] = (messagesData || []).map((m: any) => ({
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    body: m.message_text ?? '',
    created_at: m.created_at,
    is_read: m.is_read,
    message_type: m.message_type || 'text',
    media_url: m.media_url || null,
    post_id: m.post_id || null,
  }));

  const partUserIds = (participantsData || []).map((p: any) => p.user_id).filter(Boolean);
  const threadProfileMap = await fetchProfilesByUserIds(partUserIds);
  const participants: ConversationParticipant[] = (participantsData || []).map((p: any) => {
    const fetched = threadProfileMap.get(p.user_id);
    const profile = fetched
      ? { id: fetched.id, display_name: fetched.display_name, avatar_url: fetched.avatar_url }
      : p.profiles || null;
    return { user_id: p.user_id, profile };
  });

  return { messages, participants };
}

/** Mark all messages from others in this thread read for the viewer (inbox / swipe "Read"). */
export async function markDmConversationReadForViewer(
  conversationId: string,
  viewerId: string
): Promise<{ error: string | null }> {
  const cid = (conversationId || '').trim();
  const { error } = await supabase
    .from('dm_messages')
    .update({ is_read: true })
    .eq('conversation_id', cid)
    .neq('sender_id', viewerId);
  if (error) return { error: error.message };
  return { error: null };
}

/** Mark incoming messages unread (best-effort; requires UPDATE policy on dm_messages). */
export async function markDmConversationUnreadForViewer(
  conversationId: string,
  viewerId: string
): Promise<{ error: string | null }> {
  const cid = (conversationId || '').trim();
  const { error } = await supabase
    .from('dm_messages')
    .update({ is_read: false })
    .eq('conversation_id', cid)
    .neq('sender_id', viewerId);
  if (error) return { error: error.message };
  return { error: null };
}

// Send a text message in a DM thread
export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
  options?: { messageType?: string; mediaUrl?: string | null; postId?: string | null }
) {
  const payload = {
    conversation_id: (conversationId || '').trim(),
    sender_id: senderId,
    message_text: body,
    message_type: options?.messageType || 'text',
    media_url: options?.mediaUrl || null,
    post_id: options?.postId || null,
  };

  const { data, error } = await supabase
    .from('dm_messages')
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  const notifyBody =
    (body && body.trim()) ||
    (options?.messageType === 'post_share' ? '[Shared a post]' : '') ||
    (options?.messageType === 'video' ? '[Video]' : options?.mediaUrl ? '[Photo]' : '');

  // Update conversation updated_at (must use same trimmed id as insert)
  const convId = payload.conversation_id;
  const { error: updErr } = await supabase
    .from('dm_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', convId);
  if (updErr) {
    console.warn('[DM] sendMessage: update conversation timestamp failed:', updErr.message);
  }

  // Notify all other participants in the conversation about the new DM
  try {
    const { data: participants, error: pError } = await supabase
      .from('dm_conversation_participants')
      .select('user_id')
      .eq('conversation_id', convId);

    if (!pError && participants) {
      const targets = participants
        .map((p: any) => p.user_id)
        .filter((id: string) => id && id !== senderId);

      await Promise.all(
        targets.map((targetId: string) =>
          createNotification({
            user_id: targetId,
            actor_id: senderId,
            type: 'message',
            entity_type: 'conversation',
            entity_id: convId,
            secondary_id: data.id,
            title: 'New message',
            body: notifyBody || 'You have a new message',
            data: { route: `/dm-thread?conversationId=${convId}` },
          })
        )
      );
    } else if (pError) {
      console.warn('[DM] sendMessage: notify participant query failed:', pError.message);
    }
  } catch (notifyError) {
    console.log('[Notifications] Failed to create DM notification:', notifyError);
  }

  return {
    id: data.id,
    conversation_id: data.conversation_id,
    sender_id: data.sender_id,
    body: data.message_text ?? '',
    created_at: data.created_at,
    is_read: data.is_read,
    message_type: data.message_type || 'text',
    media_url: data.media_url || null,
    post_id: data.post_id || null,
  } as DMMessage;
}

/**
 * Single canonical 1:1 DM resolver: finds an existing conversation where exactly these two
 * users are participants, or creates one. Requires RLS that allows reading co-participants
 * in the same conversation (see migration `20260325_dm_participants_select_coparticipants.sql`).
 */
export async function getOrCreateDirectConversation(userId1: string, userId2: string) {
  if (userId1 === userId2) {
    // Self-DM: just create or reuse a single-participant conversation
    const { data: existingSelf } = await supabase
    .from('dm_conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId1)
      .limit(1);

    if (existingSelf && existingSelf.length > 0) {
      return existingSelf[0].conversation_id as string;
    }
  }

  // Fetch all participation rows for these two users
  const { data: rows, error } = await supabase
    .from('dm_conversation_participants')
    .select('conversation_id, user_id')
    .in('user_id', [userId1, userId2]);

  if (error) throw error;

  if (rows && rows.length) {
    const byConversation: Record<string, Set<string>> = {};
    for (const row of rows) {
      if (!byConversation[row.conversation_id]) {
        byConversation[row.conversation_id] = new Set();
      }
      byConversation[row.conversation_id].add(row.user_id);
    }

    const pairMatches = Object.keys(byConversation).filter((id) => {
      const set = byConversation[id];
      return set.has(userId1) && set.has(userId2) && set.size === 2;
    });
    const ranked = await sortOneToOneConversationIdsByRecency(pairMatches);
    const existingId = ranked[0];

    if (existingId) {
      return existingId;
    }
  }

  // No existing 1:1 conversation – create one
  const conversationId = generateUuidV4();

  // Insert without RETURNING/select: avoids RLS visibility dependency on participants existing yet.
  const { error: cError } = await supabase.from('dm_conversations').insert({ id: conversationId });
  if (cError) {
    throw cError;
  }

  await supabase.from('dm_conversation_participants').insert([
    { conversation_id: conversationId, user_id: userId1 },
    { conversation_id: conversationId, user_id: userId2 },
  ]);

  return conversationId;
}

// Convenience helper that applies privacy rules and, if necessary,
// creates a pending message_request entry when starting a DM.
export async function startDirectConversation(currentUserId: string, targetUserId: string): Promise<{ conversationId: string; isRequest: boolean }> {
  const allowed = await canDM(currentUserId, targetUserId);
  const conversationId = await getOrCreateDirectConversation(currentUserId, targetUserId);

  if (!allowed) {
    try {
      const { data: existing } = await supabase
        .from('dm_message_requests')
        .select('id, status')
        .eq('from_user_id', currentUserId)
        .eq('to_user_id', targetUserId)
        .maybeSingle();

      if (!existing) {
        await supabase.from('dm_message_requests').insert({
          from_user_id: currentUserId,
          to_user_id: targetUserId,
          conversation_id: conversationId,
          status: 'pending',
        });
      }
    } catch (e) {
      // swallow; request is best-effort
    }
  }

  return { conversationId, isRequest: !allowed };
}

/**
 * Recipient accepts a pending `dm_message_requests` row so the conversation leaves the Requests list
 * and appears in the main inbox. Requires RLS: recipient may UPDATE their request rows (see Supabase migration).
 */
export async function acceptDmMessageRequest(
  conversationId: string,
  recipientUserId: string
): Promise<{ error: string | null }> {
  const cid = (conversationId || '').trim();
  // Resolve by primary key: UPDATE ... RETURNING / .select() after update often returns [] under RLS
  // even when the row was updated, which falsely looked like “no rows matched”.
  const { data: rows, error: qErr } = await supabase
    .from('dm_message_requests')
    .select('id')
    .eq('conversation_id', cid)
    .eq('to_user_id', recipientUserId)
    .eq('status', 'pending')
    .limit(1);

  if (qErr) return { error: qErr.message };
  const row = rows?.[0];
  if (!row?.id) {
    return { error: 'No pending request was updated. It may have already been handled.' };
  }

  const { error: uErr } = await supabase.from('dm_message_requests').update({ status: 'accepted' }).eq('id', row.id);

  if (uErr) return { error: uErr.message };
  return { error: null };
}

/** Recipient declines a pending request (request row no longer pending; conversation may still exist). */
export async function declineDmMessageRequest(
  conversationId: string,
  recipientUserId: string
): Promise<{ error: string | null }> {
  const cid = (conversationId || '').trim();
  const { data: rows, error: qErr } = await supabase
    .from('dm_message_requests')
    .select('id')
    .eq('conversation_id', cid)
    .eq('to_user_id', recipientUserId)
    .eq('status', 'pending')
    .limit(1);

  if (qErr) return { error: qErr.message };
  const row = rows?.[0];
  if (!row?.id) {
    return { error: 'No pending request was updated. It may have already been handled.' };
  }

  const { error: uErr } = await supabase.from('dm_message_requests').update({ status: 'declined' }).eq('id', row.id);

  if (uErr) return { error: uErr.message };
  return { error: null };
}

// Subscribe to realtime inserts for a conversation's messages
export function subscribeToConversationMessages(
  conversationId: string,
  callback: (msg: DMMessage) => void
) {
  const channel = supabase
    .channel(`conversation-${conversationId}-dm_messages`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'dm_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const m: any = payload.new;
        const msg: DMMessage = {
          id: m.id,
          conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          body: m.message_text ?? '',
          created_at: m.created_at,
          is_read: m.is_read,
          message_type: m.message_type || 'text',
          media_url: m.media_url || null,
          post_id: m.post_id || null,
        };
        callback(msg);
      }
    )
    .subscribe();

  return () => {
    try {
      channel.unsubscribe();
    } catch {}
  };
}
