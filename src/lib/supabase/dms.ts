import { createNotification } from '../../../lib/notifications';
import { supabase } from '../supabaseClient';

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

  const { data, error } = await supabase
    .from('dm_conversation_participants')
    .select(
      `conversation_id,
      dm_conversations!inner(id, created_at, updated_at),
      profiles:profiles!user_id(id, display_name, avatar_url),
      dm_conversations(dm_messages(id, sender_id, message_text, created_at, is_read, message_type, media_url, post_id), dm_conversation_participants(user_id, profiles!user_id(id, display_name, avatar_url)))`
    )
    .eq('user_id', userId);

  if (error) throw error;

  const mapped = (data || []).map((row: any) => {
    const convo = row.dm_conversations;
    const allMessages = convo.messages || [];
    const lastMessage = allMessages.length
      ? allMessages.reduce((latest: any, m: any) =>
          !latest || new Date(m.created_at) > new Date(latest.created_at) ? m : latest,
        null as any
        )
      : null;

    return {
      id: convo.id,
      participants: (convo.conversation_participants || []).map((p: any) => ({
        user_id: p.user_id,
        profile: p.profiles || null,
      })),
      last_message: lastMessage
        ? {
            id: lastMessage.id,
            sender_id: lastMessage.sender_id,
            body: lastMessage.message_text ?? '',
            created_at: lastMessage.created_at,
            is_read: lastMessage.is_read,
            message_type: lastMessage.message_type,
            media_url: lastMessage.media_url,
            post_id: lastMessage.post_id,
          }
        : null,
    };
  });

  // Filter out conversations that are pending message requests for this user
  return mapped.filter((c: any) => !pendingConversationIds.has(c.id));
}

// Fetch DM conversations that are pending as message requests for this user
export async function fetchMessageRequestsInbox(userId: string) {
  const { data: reqs, error: reqError } = await supabase
    .from('dm_message_requests')
    .select('conversation_id')
    .eq('to_user_id', userId)
    .eq('status', 'pending');

  if (reqError || !reqs || reqs.length === 0) return [];
  const convoIds = reqs.map((r: any) => r.conversation_id);

  const { data, error } = await supabase
    .from('dm_conversation_participants')
    .select(
      `conversation_id,
      dm_conversations!inner(id, created_at, updated_at),
      profiles:profiles!user_id(id, display_name, avatar_url),
      dm_conversations(dm_messages(id, sender_id, message_text, created_at, is_read, message_type, media_url, post_id), dm_conversation_participants(user_id, profiles!user_id(id, display_name, avatar_url)))`
    )
    .in('conversation_id', convoIds);

  if (error) throw error;

  return (data || []).map((row: any) => {
    const convo = row.dm_conversations;
    const allMessages = convo.messages || [];
    const lastMessage = allMessages.length
      ? allMessages.reduce((latest: any, m: any) =>
          !latest || new Date(m.created_at) > new Date(latest.created_at) ? m : latest,
        null as any
        )
      : null;

    return {
      id: convo.id,
      participants: (convo.conversation_participants || []).map((p: any) => ({
        user_id: p.user_id,
        profile: p.profiles || null,
      })),
      last_message: lastMessage
        ? {
            id: lastMessage.id,
            sender_id: lastMessage.sender_id,
            body: lastMessage.message_text ?? '',
            created_at: lastMessage.created_at,
            is_read: lastMessage.is_read,
            message_type: lastMessage.message_type,
            media_url: lastMessage.media_url,
            post_id: lastMessage.post_id,
          }
        : null,
    };
  });
}

// Fetch all messages in a DM thread
// Returns: { messages: [{ id, body, sender_id, created_at }], participants: [{ user_id, profile }] }
export async function fetchThread(conversationId: string, userId: string) {
  const { data: messagesData, error: msgError } = await supabase
    .from('dm_messages')
    .select('id, conversation_id, sender_id, message_text, created_at, is_read, message_type, media_url, post_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (msgError) throw msgError;

  const { data: participantsData, error: pError } = await supabase
    .from('dm_conversation_participants')
    .select('user_id, profiles:profiles!user_id(id, display_name, avatar_url)')
    .eq('conversation_id', conversationId);

  if (pError) throw pError;

  // Mark messages as read for this user (simplified: mark all incoming as read)
  await supabase
    .from('dm_messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId);

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

  const participants: ConversationParticipant[] = (participantsData || []).map((p: any) => ({
    user_id: p.user_id,
    profile: p.profiles || null,
  }));

  return { messages, participants };
}

// Send a text message in a DM thread
export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
  options?: { messageType?: string; mediaUrl?: string | null; postId?: string | null }
) {
  const payload = {
    conversation_id: conversationId,
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

  if (error) throw error;

  // Update conversation updated_at
  await supabase
    .from('dm_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Notify all other participants in the conversation about the new DM
  try {
    const { data: participants, error: pError } = await supabase
      .from('dm_conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);

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
            entity_id: conversationId,
            body,
            data: { route: `/dm-thread?conversationId=${conversationId}` },
          })
        )
      );
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

// Get or create a 1:1 DM conversation between two users
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

    const existingId = Object.keys(byConversation).find((id) => {
      const set = byConversation[id];
      return set.has(userId1) && set.has(userId2) && set.size === 2;
    });

    if (existingId) return existingId;
  }

  // No existing 1:1 conversation – create one
  const { data: convo, error: cError } = await supabase
    .from('dm_conversations')
    .insert({})
    .select()
    .single();

  if (cError) throw cError;

  await supabase.from('dm_conversation_participants').insert([
    { conversation_id: convo.id, user_id: userId1 },
    { conversation_id: convo.id, user_id: userId2 },
  ]);

  return convo.id as string;
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
