
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPostById } from '../lib/feed';
import { useAuth } from '../src/hooks/useAuth';
import { fetchThread, sendMessage, subscribeToConversationMessages } from '../src/lib/supabase/dms';
import { pickAndUploadMessageMedia } from '../src/lib/uploadMessageMedia';
import * as ImagePicker from 'expo-image-picker';

export default function DMThread() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const rawConversationId = useLocalSearchParams<{ conversationId?: string | string[] }>().conversationId;
  const conversationId = useMemo(() => {
    if (typeof rawConversationId === 'string') return rawConversationId;
    if (Array.isArray(rawConversationId) && rawConversationId[0]) return rawConversationId[0];
    return '';
  }, [rawConversationId]);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [threadLoadError, setThreadLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sharedPosts, setSharedPosts] = useState<Record<string, any>>({});
  const flatListRef = useRef<FlatList>(null);

  const requestMediaPermission = async (source: 'camera' | 'library'): Promise<boolean> => {
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      const status = perm?.status;
      if (status !== 'granted') {
        Alert.alert(
          'Permission required',
          source === 'camera'
            ? 'Please allow camera access to send photos/videos.'
            : 'Please allow photo library access to send photos/videos.',
        );
        return false;
      }

      return true;
    } catch {
      Alert.alert('Permission error', 'Unable to request media permissions. Please try again.');
      return false;
    }
  };

  useEffect(() => {
    if (!conversationId) {
      setLoading(false);
      setMessages([]);
      setParticipants([]);
      return;
    }
    if (!userId) return;

    let unsubscribe: (() => void) | null = null;

    const loadThread = async () => {
      setLoading(true);
      setThreadLoadError(null);
      // Optimistically clear so we don't show the previous thread while loading a new one.
      setMessages([]);
      setParticipants([]);
      let lastError: any = null;

      // Minimal retry to avoid transient "Network request failed" blank threads.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const thread = await fetchThread(conversationId, userId);
          setMessages(thread.messages);
          setParticipants(thread.participants);
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 800 * attempt));
          }
        }
      }

      if (lastError) {
        setThreadLoadError('Unable to load messages right now. Please check your connection and try again.');
        setLoading(false);
        return;
      }
      setLoading(false);

      unsubscribe = subscribeToConversationMessages(conversationId, (msg) => {
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
      const body = input.trim();
      const sent = await sendMessage(conversationId, userId, body);
      setInput('');

      // Optimistically append so text appears even if realtime delivery is delayed.
      setMessages((prev) => {
        if (prev.find((m: any) => m.id === sent.id)) return prev;
        return [...prev, sent];
      });

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      // Keep existing behavior (no UI toast) but do not silently swallow.
      console.log('[DM] sendMessage error:', e);
    } finally {
      setSending(false);
    }
  };

  const otherParticipant = useMemo(() => {
    return participants.find((p: any) => p.user_id !== userId) || participants[0] || null;
  }, [participants, userId]);

  const ThreadHeader = ({ title, avatarUrl }: { title: string; avatarUrl?: string | null }) => {
    return (
      <View style={styles.threadHeaderOuter}>
        <View style={styles.threadHeaderRow}>
          <Pressable
            onPress={() => router.replace('/messages-inbox')}
            style={styles.threadBackBtn}
            accessibilityLabel="Back to Messages"
            hitSlop={6}
          >
            <Ionicons name="chevron-back" size={22} color="#64748b" />
          </Pressable>
          <View style={styles.threadAvatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.threadAvatarImg} />
            ) : (
              <Ionicons name="person-circle" size={32} color="#cbd5e1" />
            )}
          </View>
          <View style={styles.threadTitleCol}>
            <Text style={styles.threadTitle}>{title}</Text>
            <Text style={styles.threadSubtitle}>Private crew conversation</Text>
          </View>
          {/* No other actions in this deep task header. */}
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.threadDivider} />
      </View>
    );
  };

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

  if (!conversationId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['left', 'right', 'top', 'bottom']}>
        <ThreadHeader title="Direct Message" avatarUrl={null} />
        <View style={{ flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center' }}>
          <Text style={{ fontSize: 16, color: '#64748b', textAlign: 'center', marginBottom: 16 }}>
            This conversation could not be opened.
          </Text>
          <Pressable onPress={() => router.replace('/messages-inbox')} style={{ alignSelf: 'center', padding: 12 }}>
            <Text style={{ color: '#B5161E', fontWeight: '700' }}>Back to Messages</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['left', 'right', 'top', 'bottom']}>
      <ThreadHeader
        title={otherParticipant?.profile?.display_name || 'Direct Message'}
        avatarUrl={otherParticipant?.profile?.avatar_url}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : threadLoadError && messages.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
            <Text style={styles.loadErrorText}>{threadLoadError}</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            style={{ flex: 1 }}
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
              try {
                const ok = await requestMediaPermission('camera');
                if (!ok) return;

                const result = await pickAndUploadMessageMedia(conversationId, 'camera');
                if (result.success && result.url && userId) {
                  await sendMessage(conversationId, userId, '', {
                    messageType: result.type === 'video' ? 'video' : 'image',
                    mediaUrl: result.url,
                  });
                } else if (result.error) {
                  Alert.alert('Unable to send media', result.error);
                }
              } finally {
                setUploading(false);
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
              try {
                const ok = await requestMediaPermission('library');
                if (!ok) return;

                const result = await pickAndUploadMessageMedia(conversationId, 'library');
                if (result.success && result.url && userId) {
                  await sendMessage(conversationId, userId, '', {
                    messageType: result.type === 'video' ? 'video' : 'image',
                    mediaUrl: result.url,
                  });
                } else if (result.error) {
                  Alert.alert('Unable to send media', result.error);
                }
              } finally {
                setUploading(false);
              }
            }}
          >
            <Ionicons name="image-outline" size={22} color="#64748b" />
          </Pressable>
          <Pressable style={[styles.iconCircle, { opacity: 0.4 }]} disabled>
            <Ionicons name="mic-outline" size={22} color="#64748b" />
          </Pressable>
          <Pressable style={[styles.iconCircle, { opacity: 0.4 }]} disabled>
            <Ionicons name="happy-outline" size={22} color="#64748b" />
          </Pressable>
          <Pressable
            style={[styles.iconCircle, (!input.trim() || !userId || !conversationId) && { opacity: 0.4 }]}
            onPress={() => {
              void handleSend();
            }}
            disabled={sending || !input.trim() || !userId || !conversationId}
          >
            <Ionicons name="send" size={20} color="#B5161E" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  threadHeaderOuter: { backgroundColor: '#F8FAFC' },
  threadHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  threadBackBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  threadAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },
  threadAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  threadTitleCol: { flex: 1, paddingLeft: 12 },
  threadTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  threadSubtitle: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 2 },
  loadErrorText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  threadDivider: { height: 1, backgroundColor: '#E5E7EB' },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '75%', padding: 12, borderRadius: 18, backgroundColor: '#ffffff' },
  bubbleMe: { backgroundColor: '#2563EB', marginLeft: 40 },
  bubbleOther: { backgroundColor: '#ffffff', marginRight: 40 },
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
