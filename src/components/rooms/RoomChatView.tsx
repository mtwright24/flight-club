import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { colors, spacing, radius } from '../../styles/theme';

interface RoomChatViewProps {
  roomId: string;
}

interface ChatMessage {
  id: string | number;
  room_id: string | number;
  user_id: string | null;
  text: string | null;
  created_at: string;
}

interface ProfileMap {
  [userId: string]: { 
    display_name?: string | null; 
    full_name?: string | null;
    avatar_url?: string | null;
  };
}

const formatTime = (dateString: string) => {
  const d = new Date(dateString);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatDay = (dateString: string) => {
  const d = new Date(dateString);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return isToday ? 'Today' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const isWithinMinutes = (a: string, b: string, minutes: number) => {
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff <= minutes * 60 * 1000;
};

const MessageBubble = React.memo(
  ({
    isMe,
    showName,
    showAvatar,
    showTime,
    name,
    text,
    time,
    avatarUrl,
  }: {
    isMe: boolean;
    showName: boolean;
    showAvatar: boolean;
    showTime: boolean;
    name: string;
    text: string;
    time: string;
    avatarUrl?: string | null;
  }) => {
    const getInitials = (name: string) => {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft]}>
        {!isMe && (
          <View style={styles.avatarContainer}>
            {showAvatar ? (
              avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{getInitials(name)}</Text>
                </View>
              )
            ) : (
              <View style={styles.avatarSpacer} />
            )}
          </View>
        )}
        <View style={styles.messageContent}>
          {showName && <Text style={[styles.senderName, isMe && styles.senderNameRight]}>{name}</Text>}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
            <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther]}>
              {text}
            </Text>
          </View>
          {showTime && <Text style={[styles.timestamp, isMe && styles.timestampRight]}>{time}</Text>}
        </View>
        {isMe && (
          <View style={styles.avatarContainer}>
            {showAvatar ? (
              avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{getInitials(name)}</Text>
                </View>
              )
            ) : (
              <View style={styles.avatarSpacer} />
            )}
          </View>
        )}
      </View>
    );
  }
);

export default function RoomChatView({ roomId }: RoomChatViewProps) {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  const roomIdValue: any = useMemo(() => {
    if (roomId == null) return roomId;
    // If it's already a UUID format (contains hyphens), return as-is
    if (String(roomId).includes('-')) {
      return roomId;
    }
    // Otherwise return as number
    return Number(roomId);
  }, [roomId]);

  useEffect(() => {
    let isMounted = true;

    const loadRecent = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('room_messages')
        .select('id, room_id, user_id, text, created_at')
        .eq('room_id', roomIdValue)
        .gt('expires_at', 'now()')
        .order('created_at', { ascending: true })
        .limit(50);

      if (!isMounted) return;
      if (error) {
        console.log('room_messages load error', error);
        setLoading(false);
        return;
      }

      setMessages(data || []);

      // Fetch profiles for all user_ids in messages
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(m => m.user_id).filter(Boolean))] as string[];
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', userIds);

          if (profilesData) {
            const profileMap: ProfileMap = {};
            profilesData.forEach(p => {
              profileMap[p.id] = {
                display_name: p.display_name,
                avatar_url: p.avatar_url,
              };
            });
            setProfiles(profileMap);
          }
        }
      }

      setLoading(false);
    };

    loadRecent();

    const channel = supabase
      .channel(`room-${roomId}-messages`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomIdValue}` },
        (payload) => {
          console.log('realtime message received:', payload.new);
          const incoming = payload.new as ChatMessage;
          setMessages((prev) => {
            // Check if message with this exact id already exists
            if (prev.find((m) => String(m.id) === String(incoming.id))) {
              console.log('message id already exists, skipping', incoming.id);
              return prev;
            }
            // Always add new incoming messages from realtime
            console.log('adding message from realtime:', incoming.id);
            return [...prev, incoming];
          });

          // Fetch profile for new message sender if not already loaded
          if (incoming.user_id && !profiles[incoming.user_id]) {
            supabase
              .from('profiles')
              .select('id, display_name, avatar_url')
              .eq('id', incoming.user_id)
              .single()
              .then(({ data }) => {
                if (data) {
                  setProfiles((prev) => ({
                    ...prev,
                    [data.id]: {
                      display_name: data.display_name,
                      avatar_url: data.avatar_url,
                    },
                  }));
                }
              });
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      try {
        channel.unsubscribe();
      } catch {}
    };
  }, [roomId, roomIdValue]);

  useEffect(() => {
    if (messages.length === 0) return;
    const missingUserIds = Array.from(
      new Set(
        messages
          .map((m) => m.user_id)
          .filter((id): id is string => !!id && !profiles[id])
      )
    );

    if (missingUserIds.length === 0) return;

    supabase
      .from('profiles')
      .select('id, display_name, full_name, avatar_url')
      .in('id', missingUserIds)
      .then(({ data }) => {
        if (!data) return;
        setProfiles((prev) => {
          const next = { ...prev };
          data.forEach((p) => {
            next[p.id] = { 
              display_name: p.display_name, 
              full_name: p.full_name,
              avatar_url: p.avatar_url
            };
          });
          return next;
        });
      });
  }, [messages, profiles]);

  useEffect(() => {
    if (messages.length === 0) return;
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !roomIdValue) {
      console.log('early return - text:', trimmed, 'roomId:', roomIdValue);
      return;
    }

    console.log('handleSend called - text:', trimmed, 'roomId:', roomIdValue, 'userId:', userId);
    
    setText('');
    Keyboard.dismiss();

    try {
      console.log('attempting insert with:', { room_id: roomIdValue, user_id: userId, text: trimmed });
      
      const { data, error } = await supabase
        .from('room_messages')
        .insert([{ room_id: roomIdValue, user_id: userId, text: trimmed }])
        .select('id, room_id, user_id, text, created_at');

      if (error) {
        console.error('INSERT ERROR:', error.message, error.details, error.hint);
        return;
      }

      console.log('INSERT SUCCESS:', data);
      
      // Manually add the message to state immediately
      if (data && data.length > 0) {
        setMessages((prev) => {
          // Check if it already exists
          if (prev.find((m) => String(m.id) === String(data[0].id))) {
            return prev;
          }
          return [...prev, data[0]];
        });
      }
    } catch (err) {
      console.error('INSERT EXCEPTION:', err);
    }
  }, [text, roomIdValue, userId]);

  const renderItem = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const prev = index > 0 ? messages[index - 1] : null;
    const isMe = item.user_id && userId && item.user_id === userId;

    const showDateSeparator =
      !prev ||
      new Date(prev.created_at).toDateString() !== new Date(item.created_at).toDateString();

    const sameSender =
      prev &&
      prev.user_id === item.user_id &&
      isWithinMinutes(prev.created_at, item.created_at, 2);

    const displayName = item.user_id
      ? profiles[item.user_id]?.display_name || profiles[item.user_id]?.full_name || 'Crew Member'
      : 'Crew Member';

    const avatarUrl = item.user_id ? profiles[item.user_id]?.avatar_url : null;

    return (
      <View>
        {showDateSeparator && <Text style={styles.dateSeparator}>{formatDay(item.created_at)}</Text>}
        <MessageBubble
          isMe={!!isMe}
          showName={!sameSender}
          showAvatar={!sameSender}
          showTime={!sameSender}
          name={displayName}
          text={item.text || ''}
          time={formatTime(item.created_at)}
          avatarUrl={avatarUrl}
        />
      </View>
    );
  }, [messages, profiles, userId]);

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No messages yet. Start the conversation.</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={[styles.composer, { paddingBottom: 4 }]}>
          <Pressable style={styles.addButton} onPress={() => {}}>
            <Text style={styles.addButtonText}>+</Text>
          </Pressable>
          <TextInput
            placeholder="Message"
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={setText}
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={!text.trim()}
            style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  dateSeparator: {
    alignSelf: 'center',
    marginVertical: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.cardBg,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  avatarContainer: {
    width: 36,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.headerRed + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.headerRed,
  },
  avatarSpacer: {
    width: 32,
    height: 32,
  },
  messageContent: {
    maxWidth: '70%',
  },
  senderName: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
    fontWeight: '600',
    marginLeft: 4,
  },
  senderNameRight: {
    textAlign: 'right',
    marginRight: 4,
    marginLeft: 0,
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleMe: {
    backgroundColor: colors.headerRed + '15',
    borderWidth: 1,
    borderColor: colors.headerRed + '30',
    alignSelf: 'flex-end',
  },
  bubbleOther: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextMe: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  messageTextOther: {
    color: colors.textPrimary,
  },
  timestamp: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    marginLeft: 4,
  },
  timestampRight: {
    textAlign: 'right',
    marginRight: 4,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardBg,
    gap: 8,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.border + '40',
  },
  addButtonText: {
    fontSize: 20,
    color: colors.textSecondary,
    marginTop: -2,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.cardBg,
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: colors.headerRed,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
  sendButtonText: {
    color: colors.cardBg,
    fontWeight: '700',
    fontSize: 13,
  },
});
