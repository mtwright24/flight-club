import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReactionSummaryRow from '../components/posts/ReactionSummaryRow';
import ReactionTrayOverlay from '../components/posts/ReactionTrayOverlay';
import { useAuth } from '../hooks/useAuth';
import {
    createPostComment,
    fetchPostComments,
    fetchRoomPostById,
    RoomPost,
    RoomPostComment,
} from '../lib/supabase/posts';
import {
    CommentReactionSummary,
    fetchCommentReactionsSummary,
    fetchPostReactionsSummary,
    PostReactionSummary,
    ReactionType,
    toggleCommentReaction,
    togglePostReaction,
} from '../lib/supabase/reactions';
import { colors, radius, shadow, spacing } from '../styles/theme';

interface RoomPostDetailScreenProps {
  postId: string;
  onClose: () => void;
}

export default function RoomPostDetailScreen({ postId, onClose }: RoomPostDetailScreenProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const router = useRouter();

  const [post, setPost] = useState<RoomPost | null>(null);
  const [comments, setComments] = useState<RoomPostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);

  const [postReactionsSummary, setPostReactionsSummary] = useState<PostReactionSummary>({});
  const [commentReactionsSummary, setCommentReactionsSummary] = useState<CommentReactionSummary>({});

  const [trayVisible, setTrayVisible] = useState(false);
  const [trayAnchorLayout, setTrayAnchorLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [activeItemType, setActiveItemType] = useState<'post' | 'comment' | null>(null);
  const reactButtonRefs = useRef<{ [key: string]: View | null }>({});

  const loadPost = useCallback(async () => {
    try {
      setLoading(true);
      const postData = await fetchRoomPostById(postId);
      setPost(postData);

      if (postData?.id && userId) {
        const commentsData = await fetchPostComments(postData.id, 50);
        setComments(commentsData);

        // Fetch reactions for post
        const postSummary = await fetchPostReactionsSummary([postData.id], userId);
        setPostReactionsSummary(postSummary);

        // Fetch reactions for comments
        if (commentsData.length > 0) {
          const commentIds = commentsData.map((c) => c.id);
          const commentSummary = await fetchCommentReactionsSummary(commentIds, userId);
          setCommentReactionsSummary(commentSummary);
        }
      }
    } catch (error) {
      console.error('Error loading post detail:', error);
    } finally {
      setLoading(false);
    }
  }, [postId, userId]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  const canSend = useMemo(() => !!userId && commentText.trim().length > 0, [userId, commentText]);

  const handleSend = useCallback(async () => {
    if (!post || !userId || !canSend) return;

    try {
      setSending(true);
      const result = await createPostComment(post.id, post.room_id, userId, commentText);
      if (result.success && result.comment) {
        setComments((prev) => [...prev, result.comment!]);
        setCommentText('');
      }
    } catch (error) {
      console.error('Error sending comment:', error);
    } finally {
      setSending(false);
    }
  }, [post, userId, commentText, canSend]);

  const handlePressReact = useCallback(
    (itemId: string, itemType: 'post' | 'comment') => {
      if (!userId) return;

      const ref = reactButtonRefs.current[itemId];
      if (!ref) return;

      ref.measureInWindow((x, y, width, height) => {
        setActiveItemId(itemId);
        setActiveItemType(itemType);
        setTrayAnchorLayout({ x, y, width, height });
        setTrayVisible(true);
      });
    },
    [userId]
  );

  const handleSelectReaction = useCallback(
    async (reaction: ReactionType) => {
      if (!userId || !activeItemId || !activeItemType) return;

      if (activeItemType === 'post' && post) {
        // Optimistic UI update for post
        setPostReactionsSummary((prev) => {
          const newSummary = { ...prev };
          const postReactions = newSummary[post.id] || { counts: {} };
          const currentUserReaction = postReactions.userReaction;
          const newCounts = { ...postReactions.counts };

          if (currentUserReaction === reaction) {
            newCounts[reaction] = Math.max(0, (newCounts[reaction] || 0) - 1);
            newSummary[post.id] = { counts: newCounts };
          } else if (currentUserReaction) {
            newCounts[currentUserReaction] = Math.max(0, (newCounts[currentUserReaction] || 0) - 1);
            newCounts[reaction] = (newCounts[reaction] || 0) + 1;
            newSummary[post.id] = { counts: newCounts, userReaction: reaction };
          } else {
            newCounts[reaction] = (newCounts[reaction] || 0) + 1;
            newSummary[post.id] = { counts: newCounts, userReaction: reaction };
          }

          return newSummary;
        });

        // Call API
        const result = await togglePostReaction(post.id, userId, reaction);

        // If failed, revert
        if (!result.success) {
          console.error('[RoomPostDetail] Failed to toggle post reaction:', result.error);
          const summary = await fetchPostReactionsSummary([post.id], userId);
          setPostReactionsSummary(summary);
        }
      } else if (activeItemType === 'comment') {
        const commentId = activeItemId;

        // Optimistic UI update for comment
        setCommentReactionsSummary((prev) => {
          const newSummary = { ...prev };
          const commentReactions = newSummary[commentId] || { counts: {} };
          const currentUserReaction = commentReactions.userReaction;
          const newCounts = { ...commentReactions.counts };

          if (currentUserReaction === reaction) {
            newCounts[reaction] = Math.max(0, (newCounts[reaction] || 0) - 1);
            newSummary[commentId] = { counts: newCounts };
          } else if (currentUserReaction) {
            newCounts[currentUserReaction] = Math.max(0, (newCounts[currentUserReaction] || 0) - 1);
            newCounts[reaction] = (newCounts[reaction] || 0) + 1;
            newSummary[commentId] = { counts: newCounts, userReaction: reaction };
          } else {
            newCounts[reaction] = (newCounts[reaction] || 0) + 1;
            newSummary[commentId] = { counts: newCounts, userReaction: reaction };
          }

          return newSummary;
        });

        // Call API
        const result = await toggleCommentReaction(commentId, userId, reaction);

        // If failed, revert
        if (!result.success) {
          console.error('[RoomPostDetail] Failed to toggle comment reaction:', result.error);
          const commentIds = comments.map((c) => c.id);
          const summary = await fetchCommentReactionsSummary(commentIds, userId);
          setCommentReactionsSummary(summary);
        }
      }
    },
    [userId, activeItemId, activeItemType, post, comments]
  );

  if (loading || !post) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.headerRed} />
        </View>
      </SafeAreaView>
    );
  }

  const mediaUrls = (post.media_urls || []).filter(Boolean);
  const postReactions = postReactionsSummary[post.id] || { counts: {} };
  
  console.log('[ROOM POST DETAIL] mediaUrls:', mediaUrls, 'post.media_urls:', post.media_urls);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={{ width: 22 }} />
        </View>

        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.postCard}>
              <View style={styles.postHeader}>
                <Image
                  source={{ uri: post.profile_avatar_url || `https://i.pravatar.cc/100?u=${post.user_id}` }}
                  style={styles.avatar}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{post.profile_display_name || 'Crew Member'}</Text>
                  <Text style={styles.timeText}>{new Date(post.created_at).toLocaleString()}</Text>
                </View>
              </View>
              <Text style={styles.postText}>{post.content}</Text>
              {mediaUrls.length > 0 && (
                <View style={styles.mediaGrid}>
                  {mediaUrls.map((url, idx) => (
                    <Pressable
                      key={idx}
                      style={styles.mediaImage}
                      onPress={() => router.push({ pathname: '/image-viewer', params: { uri: url } })}
                    >
                      <Image
                        source={{ uri: url }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                        onError={() => console.log('[IMAGE ERROR] Failed to load:', url)}
                      />
                    </Pressable>
                  ))}
                </View>
              )}

              <View
                ref={(ref) => {
                  reactButtonRefs.current[post.id] = ref;
                }}
                collapsable={false}
              >
                <ReactionSummaryRow
                  counts={postReactions.counts}
                  userReaction={postReactions.userReaction}
                  onPressReact={() => handlePressReact(post.id, 'post')}
                />
              </View>

              <Text style={styles.commentHeader}>Comments</Text>
            </View>
          }
          renderItem={({ item }) => {
            const commentReactions = commentReactionsSummary[item.id] || { counts: {} };
            return (
              <View style={styles.commentRow}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1 }}
                  onPress={() => router.push(`/profile/${item.user_id}`)}
                >
                  <Image
                    source={{ uri: item.profile_avatar_url || `https://i.pravatar.cc/100?u=${item.user_id}` }}
                    style={styles.commentAvatar}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={styles.commentBubble}>
                      <Text style={styles.commentAuthor}>{item.profile_display_name || 'Crew Member'}</Text>
                      <Text style={styles.commentText}>{item.content}</Text>
                    </View>
                  </View>
                </Pressable>
                <View
                  ref={(ref) => {
                    reactButtonRefs.current[item.id] = ref;
                  }}
                  collapsable={false}
                >
                  <ReactionSummaryRow
                    counts={commentReactions.counts}
                    userReaction={commentReactions.userReaction}
                    onPressReact={() => handlePressReact(item.id, 'comment')}
                    compact
                  />
                </View>
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />

        <View style={styles.inputRow}>
          <TextInput
            placeholder="Write a comment..."
            value={commentText}
            onChangeText={setCommentText}
            style={styles.input}
            placeholderTextColor={colors.textSecondary}
          />
          <Pressable
            style={[styles.sendButton, (!canSend || sending) && { opacity: 0.5 }]}
            onPress={handleSend}
            disabled={!canSend || sending}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>

        <ReactionTrayOverlay
          visible={trayVisible}
          anchorLayout={trayAnchorLayout || undefined}
          selectedReaction={
            activeItemId && activeItemType === 'post'
              ? postReactionsSummary[activeItemId]?.userReaction
              : activeItemId && activeItemType === 'comment'
              ? commentReactionsSummary[activeItemId]?.userReaction
              : undefined
          }
          onSelect={handleSelectReaction}
          onClose={() => setTrayVisible(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  postCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.cardShadow,
    marginBottom: spacing.md,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: spacing.sm,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timeText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  postText: {
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  mediaImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  previewImage: {
    width: '100%',
    height: '80%',
    borderRadius: radius.md,
  },
  previewHint: {
    marginTop: spacing.lg,
    color: colors.cardBg,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  commentHeader: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.md,
    color: colors.textPrimary,
  },
  commentRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: spacing.sm,
  },
  commentBubble: {
    flex: 1,
    backgroundColor: colors.cardBg,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  commentText: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardBg,
    color: colors.textPrimary,
  },
  sendButton: {
    marginLeft: spacing.sm,
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  sendButtonText: {
    color: colors.cardBg,
    fontWeight: '700',
  },
});
