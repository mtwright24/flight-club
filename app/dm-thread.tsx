
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPostById } from '../lib/feed';
import FlightClubHeader from '../src/components/FlightClubHeader';
import { useAuth } from '../src/hooks/useAuth';
import { fetchThread, sendMessage, subscribeToConversationMessages } from '../src/lib/supabase/dms';
import { pickAndUploadMessageMedia } from '../src/lib/uploadMessageMedia';

export default function DMThread() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { conversationId } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sharedPosts, setSharedPosts] = useState<Record<string, any>>({});
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!conversationId || !userId) return;

    let unsubscribe: (() => void) | null = null;

    const loadThread = async () => {
      setLoading(true);
      try {
        const thread = await fetchThread(conversationId as string, userId);
        setMessages(thread.messages);
        setParticipants(thread.participants);
      } catch (e) {
        setMessages([]);
        setParticipants([]);
      }
      setLoading(false);

      unsubscribe = subscribeToConversationMessages(conversationId as string, (msg) => {
        setMessages((prev) => {
          if (prev.find((m: any) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
      });
    };

    loadThread();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [conversationId, userId]);

  const handleSend = async () => {
    if (!input.trim() || !conversationId || !userId) return;
    setSending(true);
    try {
      await sendMessage(conversationId as string, userId, input.trim());
      setInput('');
    } catch (e) {}
    setSending(false);
  };

  const otherParticipant = useMemo(() => {
    return participants.find((p: any) => p.user_id !== userId) || participants[0] || null;
  }, [participants, userId]);

  useEffect(() => {
    // Preload any shared posts referenced in messages
    const loadSharedPosts = async () => {
      const missingIds = Array.from(
        new Set(
          messages
            .filter((m: any) => m.message_type === 'post_share' && m.post_id && !sharedPosts[m.post_id])
            .map((m: any) => m.post_id as string)
        )
      );
      for (const postId of missingIds) {
        try {
          const post = await getPostById(postId);
          setSharedPosts((prev) => ({ ...prev, [postId]: post }));
        } catch (e) {
          // ignore load failures
        }
      }
    };
    if (messages.length) {
      loadSharedPosts();
    }
  }, [messages, sharedPosts]);

  const renderItem = ({ item }: { item: any }) => {
    const isMe = item.sender_id === userId;
    const sender = participants.find((p: any) => p.user_id === item.sender_id);
    const isImage = item.message_type === 'image' && item.media_url;
    const isVideo = item.message_type === 'video' && item.media_url;
    const isPostShare = item.message_type === 'post_share' && item.post_id;
    const sharedPost = isPostShare ? sharedPosts[item.post_id] : null;
    return (
      <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
        {!isMe && (
          <Ionicons name="person-circle" size={32} color="#cbd5e1" style={{ marginRight: 6 }} />
        )}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {isImage && (
            <Image source={{ uri: item.media_url }} style={styles.mediaImage} />
          )}
          {isVideo && (
            <Text style={styles.mediaPlaceholder}>Shared a video</Text>
          )}
          {isPostShare && (
            <Pressable
              style={styles.postShareCard}
              onPress={() => {
                if (sharedPost?.id) {
                  router.push({ pathname: '/social-post-detail', params: { id: sharedPost.id } });
                }
              }}
            >
              <Text style={styles.postShareLabel}>Shared a post</Text>
              <Text style={styles.postShareText} numberOfLines={2}>
                {sharedPost?.content || 'Tap to view post'}
              </Text>
            </Pressable>
          )}
          {!!item.body && (
            <Text style={styles.bubbleText}>{item.body}</Text>
          )}
          <Text style={styles.bubbleTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#B5161E' }} edges={['left', 'right', 'top']}>
      <FlightClubHeader
        title={otherParticipant?.profile?.display_name || 'Direct Message'}
        showLogo={false}
        bellCount={0}
        dmCount={0}
        onPressBell={() => router.push('/notifications')}
        onPressMessage={() => router.push('/messages-inbox')}
        onPressMenu={() => router.push('/menu')}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Composer bar with IG-style controls */}
        <View style={styles.composerRow}>
          <Pressable
            style={styles.iconCircle}
            disabled={uploading || !conversationId}
            onPress={async () => {
              if (!conversationId) return;
              setUploading(true);
              const result = await pickAndUploadMessageMedia(conversationId as string, 'camera');
              setUploading(false);
              if (result.success && result.url && userId) {
                await sendMessage(conversationId as string, userId, '', {
                  messageType: result.type === 'video' ? 'video' : 'image',
                  mediaUrl: result.url,
                });
              }
            }}
          >
            <Ionicons name="camera-outline" size={22} color="#64748b" />
          </Pressable>
          <TextInput
            style={styles.composerInput}
            placeholder="Message…"
            placeholderTextColor="#94a3b8"
            value={input}
            onChangeText={setInput}
            editable={!sending}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Pressable
            style={styles.iconCircle}
            disabled={uploading || !conversationId}
            onPress={async () => {
              if (!conversationId) return;
              setUploading(true);
              const result = await pickAndUploadMessageMedia(conversationId as string, 'library');
              setUploading(false);
              if (result.success && result.url && userId) {
                await sendMessage(conversationId as string, userId, '', {
                  messageType: result.type === 'video' ? 'video' : 'image',
                  mediaUrl: result.url,
                });
              }
            }}
          >
            <Ionicons name="image-outline" size={22} color="#64748b" />
          </Pressable>
          <Pressable style={styles.iconCircle}>
            <Ionicons name="mic-outline" size={22} color="#64748b" />
          </Pressable>
          <Pressable style={styles.iconCircle}>
            <Ionicons name="happy-outline" size={22} color="#64748b" />
          </Pressable>
          <Pressable
            style={[styles.iconCircle, !input.trim() && { opacity: 0.4 }]}
            onPress={handleSend}
            disabled={sending || !input.trim()}
          >
            <Ionicons name="send" size={20} color="#B5161E" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '75%', padding: 12, borderRadius: 18, backgroundColor: '#e0e7ef' },
  bubbleMe: { backgroundColor: '#2563EB', marginLeft: 40 },
  bubbleOther: { backgroundColor: '#e0e7ef', marginRight: 40 },
  bubbleText: { color: '#0f172a', fontSize: 16 },
  bubbleTime: { color: '#64748b', fontSize: 11, marginTop: 4, textAlign: 'right' },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  composerInput: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 8,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF3F9',
    marginHorizontal: 2,
  },
  mediaImage: {
    width: '100%',
    maxHeight: 220,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: '#cbd5e1',
  },
  mediaPlaceholder: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  postShareCard: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 4,
  },
  postShareLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  postShareText: {
    fontSize: 15,
    color: '#0f172a',
  },
});
