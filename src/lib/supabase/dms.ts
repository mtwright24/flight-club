import { getMergedHiddenConversationIds } from '../../../lib/dmInboxLocal';
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

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, full_name, avatar_url')
    .in('id', unique);

  if (error) {
    console.warn('[DM] fetchProfilesByUserIds:', error.message);
    return map;
  }

  for (const p of data || []) {
    const resolvedDisplayName =
      (typeof p.display_name === 'string' && p.display_name.trim()) ||
      (typeof (p as any).full_name === 'string' && String((p as any).full_name).trim()) ||
      null;
    map.set(p.id, {
      id: p.id,
      display_name: resolvedDisplayName,
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

// Basic permission check for starting a DM (open thread without a message request).
// Recipient must follow the sender (they opted in to hearing from you). Private accounts
// additionally require the sender to follow the recipient before open messaging.
export async function canDM(currentUserId: string, targetUserId: string): Promise<boolean> {
  if (currentUserId === targetUserId) return true;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_private')
    .eq('id', targetUserId)
    .single();

  if (profileError || !profile) return false;

  const { data: recipientFollowsSender } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', targetUserId)
    .eq('following_id', currentUserId)
    .maybeSingle();

  if (!recipientFollowsSender) return false;

  if (!profile.is_private) return true;

  const { data: senderFollowsTarget } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', currentUserId)
    .eq('following_id', targetUserId)
    .maybeSingle();

  return !!senderFollowsTarget;
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
  const rawType = m.message_type;
  const message_type =
    typeof rawType === 'string' ? rawType.trim().toLowerCase() : rawType || 'text';
  return {
    id: m.id,
    sender_id: m.sender_id,
    body: m.message_text ?? '',
    created_at: m.created_at,
    is_read: m.is_read,
    message_type,
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
    // No profiles embed: user_id FK is to auth.users, not profiles — PostgREST has no relationship hint.
    // Profiles are merged below via fetchProfilesByUserIds.
    supabase.from('dm_conversation_participants').select('conversation_id, user_id').in('conversation_id', convoIds),
  ]);

  // Inbox must still list threads if dm_conversations RLS is stricter than participants/messages.
  if (convoErr) {
    console.warn('[DM] inbox: dm_conversations batch read failed (using message timestamps only):', convoErr.message);
  }

  if (firstParts.error) throw firstParts.error;
  const allParts = (firstParts.data || []).map((p: any) => ({ ...p, profiles: null }));

  const metaById = new Map((convoErr ? [] : convoRows || []).map((c: any) => [c.id, c]));
  const participantsByConvo = new Map<string, { user_id: string; profile: any }[]>();
  for (const p of allParts || []) {
    const cid = (p as any).conversation_id;
    if (!participantsByConvo.has(cid)) participantsByConvo.set(cid, []);
    participantsByConvo.get(cid)!.push({
      user_id: (p as any).user_id,
      profile: null,
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
    .select('id, conversation_id')
    .eq('to_user_id', userId)
    .eq('status', 'pending')
    /** Newest first so the first row we see per conversation is the canonical pending id (matches thread resolution). */
    .order('created_at', { ascending: false });

  if (reqError || !reqs || reqs.length === 0) return [];
  const convoIds = [...new Set(reqs.map((r: any) => r.conversation_id).filter(Boolean))];

  /** First pending request row per conversation (newest pending wins; stable pairing for Accept/Decline by id). */
  const conversationIdToRequestId = new Map<string, string>();
  for (const r of reqs as { id: string; conversation_id: string }[]) {
    const cid = String(r.conversation_id);
    if (!conversationIdToRequestId.has(cid)) {
      conversationIdToRequestId.set(cid, String(r.id));
    }
  }

  try {
    const mapped = await buildInboxConversationsForIds(convoIds);
    const sorted = sortThreadsNewestFirst(mapped);
    return sorted.map((c: InboxConversation) => ({
      ...c,
      request_id: conversationIdToRequestId.get(c.id) ?? null,
    }));
  } catch (e) {
    console.warn('[DM] fetchMessageRequestsInbox build failed:', e);
    return [];
  }
}

/**
 * Red header **cloud / DM** badge only — matches what you see on Messages:
 * - Main inbox: +1 per row with the same “blue dot” rule (last message is from someone else and `is_read` is false).
 * - Requests: +1 per visible pending request row (needs Accept/Decline).
 * Does not sum raw `dm_messages` rows (avoids 5 messages → 5 on the badge).
 */
export async function countDmCloudBadgeThreads(userId: string): Promise<number> {
  const hidden = await getMergedHiddenConversationIds(userId);
  const [main, requests] = await Promise.all([fetchInbox(userId), fetchMessageRequestsInbox(userId)]);

  let n = 0;
  for (const c of main) {
    if (hidden.has(c.id)) continue;
    const lm = c.last_message;
    if (lm && lm.sender_id !== userId && !lm.is_read) n += 1;
  }
  for (const r of requests) {
    if (!hidden.has(r.id)) n += 1;
  }
  return n;
}

export type DmMessageRequestStatus = 'pending' | 'accepted' | 'declined';
export type DmMessageRequestForViewer = {
  id: string;
  conversation_id: string;
  status: DmMessageRequestStatus;
  from_user_id: string;
  to_user_id: string;
};

function normalizeDmRequestStatus(raw: unknown): DmMessageRequestStatus {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (s === 'accepted' || s === 'declined' || s === 'pending') return s;
  return 'pending';
}

/**
 * Server-side: mark pending rows accepted when `canDM`-equivalent rules now apply (follows caught up).
 * Call after opening a thread or when starting a DM while allowed.
 */
export async function resolveDmRequestsIfAllowedNow(conversationId: string): Promise<void> {
  const cid = (conversationId || '').trim();
  if (!cid) return;
  const { error } = await supabase.rpc('dm_resolve_pending_requests_if_allowed', {
    p_conversation_id: cid,
  });
  if (error) {
    console.warn('[DM] resolveDmRequestsIfAllowedNow:', error.message);
  }
}

/**
 * Source of truth for a DM request gate.
 * - If `requestId` is set (from inbox), load that row when it belongs to this conversation and viewer.
 * - Otherwise prefer **incoming** pending (`to_user_id` = viewer), then **outgoing** pending (`from_user_id` = viewer).
 *   This avoids picking the wrong row when both directions had pending rows.
 * - Otherwise fall back to the latest row by `created_at` for any status.
 */
export async function fetchDmMessageRequestForViewer(
  conversationId: string,
  viewerUserId: string,
  options?: { requestId?: string | null }
): Promise<DmMessageRequestForViewer | null> {
  const cid = (conversationId || '').trim();
  if (!cid || !viewerUserId) return null;

  const rid = (options?.requestId || '').trim();

  if (rid) {
    const { data: byId, error: byIdErr } = await supabase
      .from('dm_message_requests')
      .select('id, conversation_id, status, from_user_id, to_user_id')
      .eq('id', rid)
      .maybeSingle();

    if (byIdErr) {
      console.warn('[DM] fetchDmMessageRequestForViewer by id:', byIdErr.message);
    } else if (byId && String(byId.conversation_id) === cid) {
      const from = String(byId.from_user_id);
      const to = String(byId.to_user_id);
      if (from === viewerUserId || to === viewerUserId) {
        return {
          ...byId,
          status: normalizeDmRequestStatus(byId.status),
        } as DmMessageRequestForViewer;
      }
    }
  }

  const participantOr = `from_user_id.eq.${viewerUserId},to_user_id.eq.${viewerUserId}`;

  const [inRes, outRes] = await Promise.all([
    supabase
      .from('dm_message_requests')
      .select('id, conversation_id, status, from_user_id, to_user_id')
      .eq('conversation_id', cid)
      .eq('status', 'pending')
      .eq('to_user_id', viewerUserId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('dm_message_requests')
      .select('id, conversation_id, status, from_user_id, to_user_id')
      .eq('conversation_id', cid)
      .eq('status', 'pending')
      .eq('from_user_id', viewerUserId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  if (inRes.error) {
    console.warn('[DM] fetchDmMessageRequestForViewer incoming pending:', inRes.error.message);
  } else if (inRes.data?.length) {
    const row = inRes.data[0];
    return {
      ...row,
      status: normalizeDmRequestStatus(row.status),
    } as DmMessageRequestForViewer;
  }

  if (outRes.error) {
    console.warn('[DM] fetchDmMessageRequestForViewer outgoing pending:', outRes.error.message);
  } else if (outRes.data?.length) {
    const row = outRes.data[0];
    return {
      ...row,
      status: normalizeDmRequestStatus(row.status),
    } as DmMessageRequestForViewer;
  }

  const { data: latestRows, error } = await supabase
    .from('dm_message_requests')
    .select('id, conversation_id, status, from_user_id, to_user_id')
    .eq('conversation_id', cid)
    .or(participantOr)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.warn('[DM] fetchDmMessageRequestForViewer failed:', error.message);
    return null;
  }

  if (!latestRows?.length) return null;
  const row = latestRows[0];
  return {
    ...row,
    status: normalizeDmRequestStatus(row.status),
  } as DmMessageRequestForViewer;
}

// Fetch all messages in a DM thread
// Returns: { messages: [{ id, body, sender_id, created_at }], participants: [{ user_id, profile }] }
export async function fetchThread(conversationId: string, userId: string) {
  const cid = (conversationId || '').trim();
  if (!cid) {
    throw new Error('Missing conversation id');
  }

  const [msgRes, partsRes] = await Promise.all([
    supabase
      .from('dm_messages')
      .select('id, conversation_id, sender_id, message_text, created_at, is_read, message_type, media_url, post_id')
      .eq('conversation_id', cid)
      .order('created_at', { ascending: true }),
    supabase.from('dm_conversation_participants').select('user_id').eq('conversation_id', cid),
  ]);

  const { data: messagesData, error: msgError } = msgRes;
  if (msgError) {
    throw msgError;
  }

  const { data: partsPlain, error: p2 } = partsRes;
  if (p2) throw p2;
  const participantsData = (partsPlain || []).map((p: any) => ({ user_id: p.user_id, profiles: null }));

  const partUserIds = (participantsData || []).map((p: any) => p.user_id).filter(Boolean);

  const [readRes, threadProfileMap] = await Promise.all([
    supabase.from('dm_messages').update({ is_read: true }).eq('conversation_id', cid).neq('sender_id', userId),
    fetchProfilesByUserIds(partUserIds),
  ]);

  if (readRes.error) {
    console.warn('[DM] mark messages read failed (non-fatal):', readRes.error.message);
  }

  const messages: DMMessage[] = (messagesData || []).map((m: any) => ({
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    body: m.message_text ?? '',
    created_at: m.created_at,
    is_read: m.is_read,
    message_type:
      typeof m.message_type === 'string'
        ? m.message_type.trim().toLowerCase()
        : m.message_type || 'text',
    media_url: typeof m.media_url === 'string' ? m.media_url.trim() || null : m.media_url || null,
    post_id: m.post_id || null,
  }));

  const participants: ConversationParticipant[] = (participantsData || []).map((p: any) => {
    const fetched = threadProfileMap.get(p.user_id);
    const profile = fetched
      ? { id: fetched.id, display_name: fetched.display_name, avatar_url: fetched.avatar_url }
      : null;
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
  const gateConvId = (conversationId || '').trim();

  const [inPendRes, outPendRes] = await Promise.all([
    supabase
      .from('dm_message_requests')
      .select('id')
      .eq('conversation_id', gateConvId)
      .eq('status', 'pending')
      .eq('to_user_id', senderId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('dm_message_requests')
      .select('id')
      .eq('conversation_id', gateConvId)
      .eq('status', 'pending')
      .eq('from_user_id', senderId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  if (inPendRes.error) {
    console.warn('[DM] sendMessage incoming pending check:', inPendRes.error.message);
  }
  if (inPendRes.data?.length) {
    throw new Error('Accept or decline the message request before sending.');
  }

  if (outPendRes.error) {
    console.warn('[DM] sendMessage outgoing pending check:', outPendRes.error.message);
  }
  if (outPendRes.data?.length) {
    const { count, error: countErr } = await supabase
      .from('dm_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', gateConvId);

    if (countErr) {
      console.warn('[DM] sendMessage: failed counting existing messages:', countErr.message);
    }

    const existingCount = typeof count === 'number' ? count : 0;
    if (existingCount > 0) {
      throw new Error('This message request is not accepted yet.');
    }
  } else {
    const { data: latestOutgoing, error: latestOutErr } = await supabase
      .from('dm_message_requests')
      .select('status')
      .eq('conversation_id', gateConvId)
      .eq('from_user_id', senderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestOutErr) {
      console.warn('[DM] sendMessage latest outgoing row:', latestOutErr.message);
    }
    if (latestOutgoing && String(latestOutgoing.status).toLowerCase() === 'declined') {
      throw new Error('This message request is not accepted yet.');
    }
  }

  const hasMedia = !!(options?.mediaUrl && String(options.mediaUrl).trim());
  const hasPost = !!options?.postId;
  let messageType = (options?.messageType || 'text').trim().toLowerCase();
  if (hasPost) {
    messageType = 'post_share';
  } else if (hasMedia) {
    messageType = messageType === 'video' ? 'video' : 'image';
  }

  const payload = {
    conversation_id: gateConvId,
    sender_id: senderId,
    message_text: body,
    message_type: messageType,
    media_url: hasPost ? null : hasMedia ? String(options!.mediaUrl).trim() : null,
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
    (payload.message_type === 'post_share' ? '[Shared a post]' : '') ||
    (payload.message_type === 'video' ? '[Video]' : '') ||
    (payload.media_url ? '[Photo]' : '');

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

      let dmActorPayload: Record<string, string> = {};
      try {
        const { data: sp } = await supabase
          .from('profiles')
          .select('display_name, full_name, avatar_url')
          .eq('id', senderId)
          .maybeSingle();
        if (sp) {
          const label = [sp.display_name, sp.full_name].find((x) => typeof x === 'string' && String(x).trim());
          if (label) dmActorPayload.actor_display_name = String(label).trim();
          if (sp.avatar_url && String(sp.avatar_url).trim()) {
            dmActorPayload.actor_avatar_url = String(sp.avatar_url).trim();
          }
        }
      } catch {
        dmActorPayload = {};
      }

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
            data: {
              route: `/dm-thread?conversationId=${convId}`,
              ...dmActorPayload,
            },
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
  await resolveDmRequestsIfAllowedNow(conversationId);

  if (!allowed) {
    try {
      const { data: existingRows, error: existingErr } = await supabase
        .from('dm_message_requests')
        .select('id, status')
        .eq('from_user_id', currentUserId)
        .eq('to_user_id', targetUserId)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingErr) {
        console.warn('[DM] startDirectConversation: existing request check:', existingErr.message);
      }

      const existing = existingRows?.[0];
      if (!existing) {
        const { data: insertedReq, error: insErr } = await supabase
          .from('dm_message_requests')
          .insert({
            from_user_id: currentUserId,
            to_user_id: targetUserId,
            conversation_id: conversationId,
            status: 'pending',
          })
          .select('id')
          .maybeSingle();
        if (insErr) {
          console.warn('[DM] startDirectConversation: insert request:', insErr.message);
        } else if (insertedReq?.id) {
          const reqId = String(insertedReq.id);
          const dmRoute = `/dm-thread?conversationId=${encodeURIComponent(conversationId)}&requestId=${encodeURIComponent(reqId)}`;
          try {
            await createNotification({
              user_id: targetUserId,
              actor_id: currentUserId,
              type: 'message_request',
              entity_type: 'conversation',
              entity_id: conversationId,
              title: 'Message request',
              body: 'Someone wants to message you. Accept or decline in Message requests.',
              data: {
                route: dmRoute,
                request_id: reqId,
                dm_request_id: reqId,
              },
            });
          } catch (notifyErr) {
            console.warn('[DM] message_request notification:', notifyErr);
          }
        }
      }
    } catch (e) {
      console.warn('[DM] startDirectConversation: request flow:', e);
    }
  }

  return { conversationId, isRequest: !allowed };
}

/**
 * Update a pending dm_message_requests row for the recipient (`to_user_id`).
 * - When `requestId` is set, always also filter by `conversation_id` when provided so we never
 *   target the wrong row if ids get out of sync.
 * - If that update matches no row (stale notification id, duplicate rows, etc.), retry by
 *   conversation only so Accept/Decline still works for the visible pending chat.
 */
async function updatePendingDmMessageRequestForRecipient(
  nextStatus: 'accepted' | 'declined',
  conversationId: string,
  recipientUserId: string,
  requestId?: string | null
): Promise<{ error: string | null }> {
  const cid = (conversationId || '').trim();
  const rid = (requestId || '').trim();
  if (!cid && !rid) {
    return { error: 'Missing conversation id' };
  }

  const run = async (mode: 'by-request-and-convo' | 'by-conversation-only') => {
    let q = supabase
      .from('dm_message_requests')
      .update({ status: nextStatus })
      .eq('to_user_id', recipientUserId)
      .eq('status', 'pending');

    if (mode === 'by-request-and-convo' && rid) {
      q = q.eq('id', rid);
      if (cid) q = q.eq('conversation_id', cid);
    } else {
      if (!cid) return { data: null, error: null };
      q = q.eq('conversation_id', cid);
    }

    return q.select('id, status').maybeSingle();
  };

  let { data, error } = rid ? await run('by-request-and-convo') : await run('by-conversation-only');
  if (error) return { error: error.message };
  if (!data && rid && cid) {
    const second = await run('by-conversation-only');
    if (second.error) return { error: second.error.message };
    data = second.data;
  }

  if (!data) {
    return {
      error:
        'No pending request found for this conversation. Pull to refresh or open it again from Message requests.',
    };
  }
  return { error: null };
}

/**
 * Recipient accepts a pending `dm_message_requests` row so the conversation leaves the Requests list
 * and appears in the main inbox.
 * Prefer `requestId` from `fetchMessageRequestsInbox` (`request_id`) so the UPDATE targets the exact row.
 * Requires RLS: `DM Message requests: recipient update own rows` (see `20260324_dm_message_requests_recipient_update.sql`).
 */
export async function acceptDmMessageRequest(
  conversationId: string,
  recipientUserId: string,
  requestId?: string | null
): Promise<{ error: string | null }> {
  return updatePendingDmMessageRequestForRecipient('accepted', conversationId, recipientUserId, requestId);
}

/** Recipient declines a pending request (request row no longer pending; conversation may still exist). */
export async function declineDmMessageRequest(
  conversationId: string,
  recipientUserId: string,
  requestId?: string | null
): Promise<{ error: string | null }> {
  return updatePendingDmMessageRequestForRecipient('declined', conversationId, recipientUserId, requestId);
}

/**
 * Recipient declines the request and records a block (requester cannot DM again from this flow).
 * Requires migration `20260328_user_blocks.sql` applied.
 */
export async function blockDmMessageRequest(
  conversationId: string,
  recipientUserId: string,
  requestId: string | null | undefined,
  blockedUserId: string
): Promise<{ error: string | null }> {
  const declined = await declineDmMessageRequest(conversationId, recipientUserId, requestId);
  if (declined.error) return declined;

  const { error } = await supabase.from('user_blocks').insert({
    blocker_id: recipientUserId,
    blocked_id: blockedUserId,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      return { error: null };
    }
    return { error: error.message };
  }
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
          message_type:
            typeof m.message_type === 'string'
              ? m.message_type.trim().toLowerCase()
              : m.message_type || 'text',
          media_url: typeof m.media_url === 'string' ? m.media_url.trim() || null : m.media_url || null,
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
