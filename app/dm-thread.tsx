import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notifyDmUnreadBadgeRefresh } from '../lib/dmUnreadBadgeStore';
import { getPostById } from '../lib/feed';
import { useAuth } from '../src/hooks/useAuth';
import { usePullToRefresh } from '../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../src/styles/refreshControl';
import {
  acceptDmMessageRequest,
  blockDmMessageRequest,
  declineDmMessageRequest,
  fetchDmMessageRequestForViewer,
  type DmMessageRequestForViewer,
  fetchThread,
  markDmConversationReadForViewer,
  resolveDmRequestsIfAllowedNow,
  sendMessage,
  subscribeToConversationMessages,
} from '../src/lib/supabase/dms';
import { pickAndUploadMessageMedia } from '../src/lib/uploadMessageMedia';
import * as ImagePicker from 'expo-image-picker';

function sharedPostPreviewText(post: any): string {
  if (!post) return 'Tap to view post';
  return (typeof post.content === 'string' && post.content.trim()) ||
    (typeof post.body === 'string' && post.body.trim()) ||
    'Tap to view post';
}

/** Align with PostCard / `posts` row: image, video thumbnail, or first of media_urls. */
function sharedPostPreviewImageUrl(post: any): string | null {
  if (!post) return null;
  const mt = String(post.media_type || '').toLowerCase();
  const fromArray =
    Array.isArray(post.media_urls) && post.media_urls.length ? String(post.media_urls[0]) : null;
  if (mt === 'image' || mt === 'photo') {
    return (post.media_url && String(post.media_url)) || fromArray || null;
  }
  if (mt === 'video' || mt === 'reel') {
    return (post.thumbnail_url && String(post.thumbnail_url)) || (post.media_url && String(post.media_url)) || fromArray || null;
  }
  return (post.media_url && String(post.media_url)) || (post.thumbnail_url && String(post.thumbnail_url)) || fromArray || null;
}

const DM_IMAGE_MAX_H = 260;
const DM_IMAGE_MIN_SKELETON_H = 120;

/** Fit natural size inside max bounds without upscaling (chat-style preview). */
function fitDmPreviewSize(nw: number, nh: number, maxW: number, maxH: number) {
  if (!nw || !nh) return { width: maxW, height: DM_IMAGE_MIN_SKELETON_H };
  const scale = Math.min(maxW / nw, maxH / nh, 1);
  return { width: Math.round(nw * scale), height: Math.round(nh * scale) };
}

/** In-thread DM photo: bounded size from real dimensions, tap opens `/image-viewer` (same route as room post grid). */
function DmInlineImagePreview({
  uri,
  isMe,
  onLoadError,
}: {
  uri: string;
  isMe: boolean;
  onLoadError: () => void;
}) {
  const router = useRouter();
  const { width: windowW } = useWindowDimensions();
  const maxW = Math.min(220, windowW * 0.72);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) setDims({ w, h });
      },
      () => {
        if (!cancelled) onLoadError();
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-measure when URL changes
  }, [uri]);

  const size = useMemo(() => {
    if (!dims) return null;
    return fitDmPreviewSize(dims.w, dims.h, maxW, DM_IMAGE_MAX_H);
  }, [dims, maxW]);

  const openViewer = useCallback(() => {
    router.push({
      pathname: '/image-viewer',
      params: { uri: encodeURIComponent(uri) },
    });
  }, [router, uri]);

  const skeletonBg = isMe ? 'rgba(255,255,255,0.22)' : '#cbd5e1';

  return (
    <Pressable
      onPress={openViewer}
      accessibilityRole="button"
      accessibilityLabel="View full size photo"
      style={({ pressed }) => [styles.dmImagePressable, { maxWidth: maxW }, pressed && { opacity: 0.92 }]}
    >
      {!size ? (
        <View style={[styles.dmImageSkeleton, { width: maxW, minHeight: DM_IMAGE_MIN_SKELETON_H, backgroundColor: skeletonBg }]} />
      ) : (
        <Image
          source={{ uri }}
          style={[styles.dmInlineImage, { width: size.width, height: size.height }]}
          resizeMode="contain"
          onError={onLoadError}
        />
      )}
    </Pressable>
  );
}

export default function DMThread() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const rawConversationId = useLocalSearchParams<{ conversationId?: string | string[] }>().conversationId;
  const conversationId = useMemo(() => {
    const raw =
      typeof rawConversationId === 'string'
        ? rawConversationId
        : Array.isArray(rawConversationId) && rawConversationId[0]
          ? rawConversationId[0]
          : '';
    return typeof raw === 'string' ? raw.trim() : '';
  }, [rawConversationId]);
  const rawRequestId = useLocalSearchParams<{ requestId?: string | string[] }>().requestId;
  const routeRequestId = useMemo(() => {
    const raw =
      typeof rawRequestId === 'string'
        ? rawRequestId
        : Array.isArray(rawRequestId) && rawRequestId[0]
          ? rawRequestId[0]
          : '';
    return typeof raw === 'string' ? raw.trim() : '';
  }, [rawRequestId]);
  const routeRequestIdRef = useRef(routeRequestId);
  routeRequestIdRef.current = routeRequestId;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [threadLoadError, setThreadLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sharedPosts, setSharedPosts] = useState<Record<string, any>>({});
  const [mediaLoadFailed, setMediaLoadFailed] = useState<Record<string, boolean>>({});
  const [requestGateStatus, setRequestGateStatus] = useState<'loading' | 'pending' | 'accepted' | 'declined'>('loading');
  const [requestRow, setRequestRow] = useState<DmMessageRequestForViewer | null>(null);
  const [requestActionBusy, setRequestActionBusy] = useState(false);
  const markDmImageFailed = useCallback((messageId: string) => {
    setMediaLoadFailed((prev) => ({ ...prev, [messageId]: true }));
  }, []);
  const flatListRef = useRef<FlatList>(null);
  const conversationIdRef = useRef(conversationId);
  const firstFocusOfConversationRef = useRef(true);
  const messagesRef = useRef<any[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  /** New thread: drop stale rows immediately so we never flash the previous conversation. */
  useEffect(() => {
    firstFocusOfConversationRef.current = true;
    setMessages([]);
    setParticipants([]);
    setThreadLoadError(null);
    setMediaLoadFailed({});
    setRequestGateStatus('loading');
    setRequestRow(null);
    setRequestActionBusy(false);
  }, [conversationId]);

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

  // Refetch whenever the screen gains focus (fixes empty thread after back → re-enter).
  useFocusEffect(
    useCallback(() => {
      if (!conversationId || !userId) {
        setLoading(false);
        return;
      }

      let cancelled = false;
      const targetConvo = conversationId;
      const showFullSpinner = firstFocusOfConversationRef.current;

      if (showFullSpinner) {
        setLoading(true);
        setThreadLoadError(null);
      }

      const run = async () => {
        let lastError: unknown = null;
        try {
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const [, thread] = await Promise.all([
                resolveDmRequestsIfAllowedNow(targetConvo),
                fetchThread(targetConvo, userId),
              ]);
              if (cancelled || conversationIdRef.current !== targetConvo) return;
              setMessages(thread.messages);
              setParticipants(thread.participants);
              setThreadLoadError(null);
              const req = await fetchDmMessageRequestForViewer(targetConvo, userId, {
                requestId: routeRequestIdRef.current || undefined,
              });
              setRequestRow(req);
              setRequestGateStatus(req?.status ?? 'accepted');
              lastError = null;
              notifyDmUnreadBadgeRefresh();
              break;
            } catch (e) {
              lastError = e;
              if (attempt < 2) {
                await new Promise((r) => setTimeout(r, 800 * attempt));
              }
            }
          }

          if (cancelled || conversationIdRef.current !== targetConvo) return;

          if (lastError) {
            if (messagesRef.current.length === 0) {
              setThreadLoadError('Unable to load messages right now. Please check your connection and try again.');
            }
          } else {
            setThreadLoadError(null);
            firstFocusOfConversationRef.current = false;
          }
        } finally {
          // Always clear spinner for this convo when this focus-run finishes (fixes Strict Mode / blur abort leaving loading stuck).
          if (!cancelled && conversationIdRef.current === targetConvo) {
            setLoading(false);
          }
        }
      };

      void run();

      return () => {
        cancelled = true;
      };
    }, [conversationId, userId, rawConversationId, routeRequestId])
  );

  const handleThreadPullRefresh = useCallback(async () => {
    if (!conversationId || !userId) return;
    const targetConvo = conversationId;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const [, thread] = await Promise.all([
          resolveDmRequestsIfAllowedNow(targetConvo),
          fetchThread(targetConvo, userId),
        ]);
        if (conversationIdRef.current !== targetConvo) return;
        setMessages(thread.messages);
        setParticipants(thread.participants);
        setThreadLoadError(null);
        const req = await fetchDmMessageRequestForViewer(targetConvo, userId, {
          requestId: routeRequestIdRef.current || undefined,
        });
        setRequestRow(req);
        setRequestGateStatus(req?.status ?? 'accepted');
        notifyDmUnreadBadgeRefresh();
        return;
      } catch {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }, [conversationId, userId]);

  const { refreshing: threadPullRefreshing, onRefresh: onThreadPullRefresh } =
    usePullToRefresh(handleThreadPullRefresh);

  useEffect(() => {
    if (!conversationId || !userId) return;

    const unsubscribe = subscribeToConversationMessages(conversationId, (msg) => {
      setMessages((prev) => {
        if (prev.find((m: any) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
      if (msg.sender_id !== userId) {
        void markDmConversationReadForViewer(conversationId, userId).then(() => {
          notifyDmUnreadBadgeRefresh();
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [conversationId, userId]);

  const handleSend = async () => {
    if (!composerEnabled) return;
    if (sending) return;
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
    } catch (e: any) {
      console.log('[DM] sendMessage error:', e);
      const msg =
        typeof e?.message === 'string'
          ? e.message
          : typeof e?.error_description === 'string'
            ? e.error_description
            : 'Could not send. Please try again.';
      Alert.alert('Message not sent', msg);
    } finally {
      setSending(false);
    }
  };

  const otherParticipant = useMemo(() => {
    return participants.find((p: any) => p.user_id !== userId) || participants[0] || null;
  }, [participants, userId]);

  const composerEnabled = requestGateStatus === 'accepted';
  const isRecipient = !!requestRow && requestRow.to_user_id === userId;
  const isRequester = !!requestRow && requestRow.from_user_id === userId;

  const refreshRequestGate = useCallback(async () => {
    if (!conversationId || !userId) return null;
    await resolveDmRequestsIfAllowedNow(conversationId);
    const req = await fetchDmMessageRequestForViewer(conversationId, userId, {
      requestId: routeRequestIdRef.current || undefined,
    });
    setRequestRow(req);
    setRequestGateStatus(req?.status ?? 'accepted');
    return req;
  }, [conversationId, userId]);

  const handleAcceptRequest = useCallback(async () => {
    if (!conversationId || !userId || !requestRow || requestGateStatus !== 'pending') return;
    setRequestActionBusy(true);
    try {
      if (!requestRow.id) {
        Alert.alert('Could not accept', 'Missing request id. Please go back and re-open the thread.');
        return;
      }
      const { error } = await acceptDmMessageRequest(
        conversationId,
        userId,
        requestRow.id
      );
      if (error) {
        Alert.alert('Could not accept', error);
        return;
      }
      const refreshed = await refreshRequestGate();
      if (!refreshed || refreshed.status !== 'accepted') {
        Alert.alert('Accept did not complete', 'The request state did not update. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Could not accept', e?.message ? String(e.message) : 'Unexpected error');
    } finally {
      setRequestActionBusy(false);
    }
  }, [conversationId, requestGateStatus, requestRow, refreshRequestGate, userId]);

  const handleDeclineRequest = useCallback(async () => {
    if (!conversationId || !userId || !requestRow || requestGateStatus !== 'pending') return;
    setRequestActionBusy(true);
    try {
      if (!requestRow.id) {
        Alert.alert('Could not decline', 'Missing request id. Please go back and re-open the thread.');
        return;
      }
      const { error } = await declineDmMessageRequest(conversationId, userId, requestRow.id);
      if (error) {
        Alert.alert('Could not decline', error);
        return;
      }
      const refreshed = await refreshRequestGate();
      if (!refreshed || refreshed.status !== 'declined') {
        Alert.alert('Decline did not complete', 'The request state did not update. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Could not decline', e?.message ? String(e.message) : 'Unexpected error');
    } finally {
      setRequestActionBusy(false);
    }
  }, [conversationId, requestGateStatus, requestRow, refreshRequestGate, userId]);

  const handleBlockRequest = useCallback(async () => {
    if (!conversationId || !userId || !requestRow || requestGateStatus !== 'pending') return;
    if (!isRecipient) {
      Alert.alert('Block', 'Only the person who received the request can block.');
      return;
    }
    if (!requestRow.id) {
      Alert.alert('Could not block', 'Missing request id. Please go back and re-open the thread.');
      return;
    }
    Alert.alert(
      'Block',
      'This will decline the request and block this user from messaging you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setRequestActionBusy(true);
            try {
              const { error } = await blockDmMessageRequest(
                conversationId,
                userId,
                requestRow.id,
                requestRow.from_user_id
              );
              if (error) {
                Alert.alert('Could not block', error);
                return;
              }
              const refreshed = await refreshRequestGate();
              if (!refreshed || refreshed.status !== 'declined') {
                Alert.alert('Block did not complete', 'The request state did not update. Please try again.');
              }
            } catch (e: any) {
              Alert.alert('Could not block', e?.message ? String(e.message) : 'Unexpected error');
            } finally {
              setRequestActionBusy(false);
            }
          },
        },
      ]
    );
  }, [
    conversationId,
    isRecipient,
    refreshRequestGate,
    requestGateStatus,
    requestRow,
    userId,
  ]);

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
    const mt = String(item.message_type || 'text').trim().toLowerCase();
    const hasUrl = typeof item.media_url === 'string' && item.media_url.trim().length > 0;
    const isVideo = mt === 'video';
    const isPostShare = mt === 'post_share' && item.post_id;
    // Any non-video DM attachment with a URL renders as an image (covers legacy rows where type drifted).
    const showMediaImage = hasUrl && !isVideo && !isPostShare;
    const showImage = showMediaImage && !mediaLoadFailed[item.id];
    const showImageFallback =
      (showMediaImage && !!mediaLoadFailed[item.id]) ||
      ((mt === 'image' || mt === 'photo') && !hasUrl && !isPostShare);
    const sharedPost = isPostShare ? sharedPosts[item.post_id] : null;
    const sharePreviewUri = sharedPost ? sharedPostPreviewImageUrl(sharedPost) : null;
    const placeholderStyle = isMe ? styles.mediaPlaceholderMe : styles.mediaPlaceholder;
    return (
      <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
        {!isMe && (
          <Ionicons name="person-circle" size={32} color="#cbd5e1" style={{ marginRight: 6 }} />
        )}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {showImage && (
            <DmInlineImagePreview
              uri={item.media_url.trim()}
              isMe={isMe}
              onLoadError={() => markDmImageFailed(item.id)}
            />
          )}
          {showImageFallback && (
            <Text style={placeholderStyle}>
              {hasUrl ? 'Photo unavailable (check storage access)' : 'Photo (missing attachment)'}
            </Text>
          )}
          {isVideo && hasUrl && (
            <Text style={placeholderStyle}>Video (preview not available in chat)</Text>
          )}
          {isVideo && !hasUrl && (
            <Text style={placeholderStyle}>Video (missing attachment)</Text>
          )}
          {isPostShare && (
            <Pressable
              style={styles.postShareCard}
              onPress={() => {
                if (sharedPost?.id) {
                  router.push(`/post/${sharedPost.id}`);
                }
              }}
            >
              <Text style={styles.postShareLabel}>Shared a post</Text>
              {sharePreviewUri ? (
                <Image source={{ uri: sharePreviewUri }} style={styles.postShareImage} resizeMode="cover" />
              ) : null}
              <Text style={styles.postShareText} numberOfLines={2}>
                {sharedPost ? sharedPostPreviewText(sharedPost) : 'Tap to view post'}
              </Text>
            </Pressable>
          )}
          {!!item.body && (
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.body}</Text>
          )}
          <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isMe ? (
            <Text style={[styles.deliveryStatus, styles.bubbleTimeMe]}>{item.is_read ? 'Read' : 'Sent'}</Text>
          ) : null}
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
        {(requestGateStatus === 'pending' || requestGateStatus === 'declined') && requestRow ? (
          <View style={styles.requestBanner}>
            <Text style={styles.requestBannerTitle}>
              {requestGateStatus === 'pending'
                ? isRecipient
                  ? 'Message request'
                  : isRequester
                    ? 'Request sent'
                    : 'Message request'
                : 'Message request declined'}
            </Text>
            <Text style={styles.requestBannerBody}>
              {requestGateStatus === 'pending'
                ? isRecipient
                  ? 'Accept to start chatting. Decline will remove this request.'
                  : isRequester
                    ? 'You can view this thread, but normal messaging is locked until they accept.'
                    : 'You can view this thread, but normal messaging is locked until they accept.'
                : isRequester
                  ? 'They declined your message request.'
                  : 'This conversation is no longer available for normal messaging.'}
            </Text>
            {requestGateStatus === 'pending' && isRecipient ? (
              <View style={styles.requestActionsRow}>
                <Pressable
                  style={[styles.requestBtn, styles.requestAcceptBtn, requestActionBusy && { opacity: 0.6 }]}
                  onPress={() => void handleAcceptRequest()}
                  disabled={requestActionBusy}
                  accessibilityRole="button"
                >
                  <Text style={styles.requestBtnText}>Accept</Text>
                </Pressable>
                <Pressable
                  style={[styles.requestBtn, styles.requestDeclineBtn, requestActionBusy && { opacity: 0.6 }]}
                  onPress={() => void handleDeclineRequest()}
                  disabled={requestActionBusy}
                  accessibilityRole="button"
                >
                  <Text style={styles.requestBtnText}>Decline</Text>
                </Pressable>
                <Pressable
                  style={[styles.requestBtn, styles.requestBlockBtn, requestActionBusy && { opacity: 0.6 }]}
                  onPress={() => void handleBlockRequest()}
                  disabled={requestActionBusy}
                  accessibilityRole="button"
                >
                  <Text style={styles.requestBtnText}>Block</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

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
            refreshControl={
              <RefreshControl
                refreshing={threadPullRefreshing}
                onRefresh={onThreadPullRefresh}
                colors={REFRESH_CONTROL_COLORS}
                tintColor={REFRESH_TINT}
              />
            }
          />
        )}

        {/* Composer bar with IG-style controls */}
        <View style={styles.composerRow}>
          <Pressable
            style={styles.iconCircle}
            disabled={uploading || !conversationId || !composerEnabled || requestActionBusy}
            onPress={async () => {
              if (!conversationId) return;
              setUploading(true);
              try {
                const ok = await requestMediaPermission('camera');
                if (!ok) return;

                const result = await pickAndUploadMessageMedia(conversationId, 'camera');
                if (result.success && result.url && userId) {
                  try {
                    const sent = await sendMessage(conversationId, userId, '', {
                      messageType: result.type === 'video' ? 'video' : 'image',
                      mediaUrl: result.url,
                    });
                    setMessages((prev) => {
                      if (prev.find((m: any) => m.id === sent.id)) return prev;
                      return [...prev, sent];
                    });
                    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
                  } catch (sendErr) {
                    console.warn('[DM] media send failed after upload:', sendErr);
                    Alert.alert('Unable to send media', 'Upload worked but the message could not be saved. Please try again.');
                  }
                } else if (result.error && result.error !== 'cancelled') {
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
            editable={composerEnabled && !sending}
            multiline={false}
            blurOnSubmit
            returnKeyType="send"
            submitBehavior="submit"
            onSubmitEditing={() => void handleSend()}
          />
          <Pressable
            style={styles.iconCircle}
            disabled={uploading || !conversationId || !composerEnabled || requestActionBusy}
            onPress={async () => {
              if (!conversationId) return;
              setUploading(true);
              try {
                const ok = await requestMediaPermission('library');
                if (!ok) return;

                const result = await pickAndUploadMessageMedia(conversationId, 'library');
                if (result.success && result.url && userId) {
                  try {
                    const sent = await sendMessage(conversationId, userId, '', {
                      messageType: result.type === 'video' ? 'video' : 'image',
                      mediaUrl: result.url,
                    });
                    setMessages((prev) => {
                      if (prev.find((m: any) => m.id === sent.id)) return prev;
                      return [...prev, sent];
                    });
                    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
                  } catch (sendErr) {
                    console.warn('[DM] media send failed after upload:', sendErr);
                    Alert.alert('Unable to send media', 'Upload worked but the message could not be saved. Please try again.');
                  }
                } else if (result.error && result.error !== 'cancelled') {
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
            style={[
              styles.iconCircle,
              (!composerEnabled || requestActionBusy || !input.trim() || !userId || !conversationId) && { opacity: 0.4 },
            ]}
            onPress={() => {
              void handleSend();
            }}
            disabled={sending || !input.trim() || !userId || !conversationId || !composerEnabled || requestActionBusy}
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
  bubbleTextMe: { color: '#f8fafc' },
  bubbleTime: { color: '#64748b', fontSize: 11, marginTop: 4, textAlign: 'right' },
  bubbleTimeMe: { color: '#cbd5e1' },
  deliveryStatus: { fontSize: 10, marginTop: 2, textAlign: 'right', fontWeight: '600' },
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
  dmImagePressable: {
    alignSelf: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 4,
  },
  dmImageSkeleton: {
    borderRadius: 12,
  },
  dmInlineImage: {
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  requestBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  requestBannerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 4,
  },
  requestBannerBody: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    lineHeight: 18,
  },
  requestActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  requestBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  requestAcceptBtn: {
    backgroundColor: '#2563EB',
  },
  requestDeclineBtn: {
    backgroundColor: '#64748b',
  },
  requestBlockBtn: {
    backgroundColor: '#B91C1C',
  },
  mediaPlaceholder: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  mediaPlaceholderMe: {
    fontSize: 14,
    color: '#e2e8f0',
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
  postShareImage: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#e2e8f0',
  },
  postShareText: {
    fontSize: 15,
    color: '#0f172a',
  },
});
