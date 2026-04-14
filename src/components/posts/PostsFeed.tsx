import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  type AppStateStatus,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import {
    PostCommentSummary,
    RoomPost,
    createPostComment,
    deleteRoomPost,
    fetchCommentPreviews,
    updateRoomPost,
} from '../../lib/supabase/posts';
import { PostReactionSummary, REACTIONS } from '../../lib/supabase/reactions';
import { createSocialPostComment, fetchSocialCommentPreviews } from '../../lib/supabase/socialFeedComments';
import { colors, radius, spacing } from '../../styles/theme';
import { FlightClubRefreshControl } from '../common/FlightClubRefreshControl';
import ActionSheet, { ActionSheetOption } from '../common/ActionSheet';
import CommentPreview from './CommentPreview';
import EditPostModal from './EditPostModal';
import QuickCommentInput from './QuickCommentInput';
import ShareModal from './ShareModal';
import { FeedVideoPreview } from '../media/FeedVideoPreview';
import { useFeedVideoAutoplayPolicy } from '../../hooks/useFeedVideoAutoplayPolicy';
import { isFeedVideoMedia } from '../../lib/media/videoDetection';

/** Full-width single attachment must be video — only those cells participate in feed autoplay. */
function postIsSingleHeroVideo(post: RoomPost): boolean {
  const urls = Array.isArray(post.media_urls) ? post.media_urls : [];
  if (urls.length !== 1) return false;
  return isFeedVideoMedia(post as { media_type?: string | null }, urls[0]);
}

interface PostsFeedProps {
  posts: RoomPost[];
  emptyTitle: string;
  onPostPress?: (postId: string) => void;
  onPostDeleted?: (postId: string) => void;
  onPostUpdated?: () => void;
  reactionsSummary: PostReactionSummary;
  onOpenReactionTray?: (
    postId: string,
    anchorLayout: { x: number; y: number; width: number; height: number }
  ) => void;
  /** Must be an element (not arbitrary ReactNode) for FlatList ListHeaderComponent typing. */
  headerComponent?: React.ReactElement | null;
  scrollEnabled?: boolean;
  deletePostOverride?: (postId: string) => Promise<{ success: boolean; error?: string }>;
  onToggleLike?: (postId: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

function getRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function PostsFeed({
  posts,
  emptyTitle,
  onPostPress,
  onPostDeleted,
  onPostUpdated,
  reactionsSummary,
  onOpenReactionTray,
  headerComponent,
  scrollEnabled = true,
  deletePostOverride,
  onToggleLike,
  refreshing,
  onRefresh,
}: PostsFeedProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const router = useRouter();
  const screenFocused = useIsFocused();
  const { feedAutoplayEnabled } = useFeedVideoAutoplayPolicy();

  /** Which post’s single-hero video may autoplay (at most one id). Set from FlatList viewability. */
  const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const appForeground = appState === 'active';

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setAppState(next));
    return () => sub.remove();
  }, []);

  const [commentsSummary, setCommentsSummary] = useState<PostCommentSummary>({});
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetPostId, setActionSheetPostId] = useState<string | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingPost, setEditingPost] = useState<RoomPost | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [sharingPost, setSharingPost] = useState<RoomPost | null>(null);
  const reactButtonRefs = useRef<{ [key: string]: View | null }>({});

  useEffect(() => {
    if (!userId || posts.length === 0) return;
    const roomPosts = posts.filter((p) => (p as any).room_id);
    const socialPosts = posts.filter((p) => !(p as any).room_id);
    const roomIds = roomPosts.map((p) => p.id);
    const socialIds = socialPosts.map((p) => p.id);

    Promise.all([
      roomIds.length ? fetchCommentPreviews(roomIds, 2) : Promise.resolve({}),
      socialIds.length ? fetchSocialCommentPreviews(socialIds, 2) : Promise.resolve({}),
    ])
      .then(([roomSummary, socialSummary]) => {
        setCommentsSummary({
          ...(roomSummary as PostCommentSummary),
          ...(socialSummary as any),
        });
      })
      .catch((error) => {
        console.error('[PostsFeed] Failed to fetch comment previews:', error);
      });
  }, [posts, userId]);

  const handlePressReact = (postId: string) => {
    if (!userId) return;
    const ref = reactButtonRefs.current[postId];
    if (!ref) return;
    ref.measureInWindow((x, y, width, height) => {
      onOpenReactionTray?.(postId, { x, y, width, height });
    });
  };

  const handlePressMenu = (postId: string) => {
    setActionSheetPostId(postId);
    setActionSheetVisible(true);
  };

  const handleEditPost = (post: RoomPost) => {
    setEditingPost(post);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async (content: string) => {
    if (!editingPost || !userId) return;
    const result = await updateRoomPost(
      editingPost.id,
      content,
      editingPost.media_urls !== undefined ? editingPost.media_urls : undefined
    );
    if (result.success) {
      setEditModalVisible(false);
      setEditingPost(null);
      onPostUpdated?.();
    } else {
      Alert.alert('Error', result.error || 'Failed to update post');
    }
  };

  const handleSharePost = (post: RoomPost) => {
    setSharingPost(post);
    setShareModalVisible(true);
  };

  const handleDeletePost = (postId: string) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = deletePostOverride
              ? await deletePostOverride(postId)
              : await deleteRoomPost(postId);
            if (result.success) {
              onPostDeleted?.(postId);
            } else {
              Alert.alert('Error', result.error || 'Failed to delete post');
            }
          },
        },
      ]
    );
  };

  const handleQuickComment = async (postId: string, roomId: string | null | undefined, text: string) => {
    if (!userId) return;
    if (!text.trim()) return;

    // Room / group post comments use room_post_comments
    if (roomId) {
      const result = await createPostComment(postId, roomId, userId, text);
      if (result.success) {
        const summary = await fetchCommentPreviews([postId], 2);
        setCommentsSummary((prev) => ({ ...prev, ...summary }));
      } else {
        Alert.alert('Error', result.error || 'Failed to post comment');
      }
      return;
    }

    // Social feed comments use post_comments (if enabled in Supabase)
    const socialResult = await createSocialPostComment(postId, userId, text.trim());
    if (!socialResult.success) {
      if (socialResult.error) {
        Alert.alert('Error', socialResult.error);
      }
      return;
    }

    const summary = await fetchSocialCommentPreviews([postId], 2);
    setCommentsSummary((prev) => ({ ...prev, ...summary }));
  };

  const getActionSheetOptions = (): ActionSheetOption[] => {
    if (!actionSheetPostId) return [];
    const post = posts.find((p) => p.id === actionSheetPostId);
    if (!post) return [];
    const isAuthor = post.user_id === userId;
    if (isAuthor) {
      return [
        {
          label: 'Edit post',
          icon: 'create-outline',
          onPress: () => handleEditPost(post),
        },
        {
          label: 'Delete post',
          icon: 'trash-outline',
          destructive: true,
          onPress: () => handleDeletePost(post.id),
        },
      ];
    }
    return [
      {
        label: 'Save post',
        icon: 'bookmark-outline',
        onPress: () => {
          Alert.alert('Coming Soon', 'Save post functionality will be added soon.');
        },
      },
      {
        label: 'Report post',
        icon: 'flag-outline',
        onPress: () => {
          Alert.alert('Coming Soon', 'Report functionality will be added soon.');
        },
      },
    ];
  };

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>💬</Text>
      <Text style={styles.emptyText}>{emptyTitle}</Text>
    </View>
  ), [emptyTitle]);

  // --- Feed video autoplay (single full-width video only): one `activeVideoPostId`, ~70% visible, muted ---
  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 70,
      /** Reduces “everyone tries to play” while scrolling quickly */
      minimumViewTime: 120,
    }),
    []
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const visible = viewableItems.filter((t) => t.isViewable && t.item != null);
      if (visible.length === 0) {
        setActiveVideoPostId(null);
        return;
      }
      const sorted = [...visible].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const top = sorted[0]?.item as RoomPost | undefined;
      if (top && postIsSingleHeroVideo(top)) {
        setActiveVideoPostId(top.id);
      } else {
        setActiveVideoPostId(null);
      }
    },
    []
  );

  const renderItem = useCallback(({ item }: { item: RoomPost }) => {
    const mediaUrls = Array.isArray(item.media_urls) ? item.media_urls : [];
    const commentData = commentsSummary[item.id] || { total: 0, preview: [] };
    const summary = reactionsSummary[item.id];

    const counts = summary?.counts || {};
    const reactionEntries = Object.entries(counts).filter(([, count]) => count > 0);
    const sortedReactions = reactionEntries.sort((a, b) => (b[1] as number) - (a[1] as number));
    const [topReactionType, topReactionCount] = sortedReactions[0] || [undefined, 0];
    const topReactionConfig = REACTIONS.find((r) => r.type === topReactionType);
    const topReaction = topReactionConfig
      ? { emoji: topReactionConfig.emoji, type: topReactionConfig.type }
      : undefined;
    const reactionTotal = reactionEntries.reduce((sum, [, count]) => sum + (count as number), 0);
    const userReacted = !!summary?.userReaction;
    const isShortTextOnly = item.content.length < 40 && mediaUrls.length === 0;

    return (
      <View style={styles.postCard}>
        {/* Header */}
        <View style={styles.postContent}>
          <View style={styles.postHeader}>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
              onPress={() => router.push(`/profile/${item.user_id}`)}
            >
              <Image
                source={{
                  uri:
                    item.profile_avatar_url || `https://i.pravatar.cc/100?u=${item.user_id}`,
                }}
                style={styles.avatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.postName}>
                  {item.profile_display_name || 'Crew Member'}
                </Text>
                <Text style={styles.timeText}>{getRelativeTime(item.created_at)}</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => handlePressMenu(item.id)}
              style={({ pressed }) => [styles.menuButton, pressed && { opacity: 0.5 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>
          {/* Content */}
          <Pressable onPress={() => onPostPress?.(item.id)}>
            <Text style={[styles.postText, isShortTextOnly && styles.postTextShort]}>
              {item.content}
            </Text>
          </Pressable>
        </View>

        {/* Media */}
        {mediaUrls.length > 0 && (
          <View style={styles.mediaContainer}>
            {mediaUrls.length === 1 ? (
              (() => {
                const url0 = mediaUrls[0];
                const isVideo = isFeedVideoMedia(item as { media_type?: string | null }, url0);
                const poster =
                  (item as { thumbnail_url?: string | null }).thumbnail_url || undefined;
                const openDetail = () =>
                  router.push({
                    pathname: '/post-media-viewer',
                    params: {
                      postId: item.id,
                      roomId: item.room_id ?? '',
                      mediaIndex: 0,
                    },
                  });

                return (
                  <View style={styles.singleImageWrapper}>
                    {isVideo ? (
                      <FeedVideoPreview
                        uri={url0}
                        posterUri={poster}
                        height={400}
                        style={styles.mediaImageCover}
                        feedHero={{
                          isActive: activeVideoPostId === item.id,
                          feedAutoplayEnabled,
                          screenFocused,
                          appForeground,
                          onOpenDetail: openDetail,
                        }}
                      />
                    ) : (
                      <Pressable onPress={openDetail}>
                        <Image
                          source={{ uri: url0 }}
                          style={styles.mediaImageCover}
                          resizeMode="cover"
                        />
                      </Pressable>
                    )}
                  </View>
                );
              })()
            ) : (
              <View style={styles.mediaGrid}>
                {mediaUrls.map((url, idx) => {
                  const isVideo = isFeedVideoMedia(item as { media_type?: string | null }, url);
                  const poster =
                    (item as { thumbnail_url?: string | null }).thumbnail_url || undefined;
                  return (
                    <Pressable
                      key={idx}
                      onPress={() =>
                        router.push({
                          pathname: '/post-media-viewer',
                          params: {
                            postId: item.id,
                            roomId: item.room_id ?? '',
                            mediaIndex: idx,
                          },
                        })
                      }
                      style={styles.gridImageWrapper}
                    >
                      {isVideo ? (
                        <FeedVideoPreview
                          uri={url}
                          posterUri={poster}
                          style={styles.mediaImageGridCover}
                          showPlayBadge
                        />
                      ) : (
                        <Image
                          source={{ uri: url }}
                          style={styles.mediaImageGridCover}
                          resizeMode="cover"
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Counts row (comments only, aligned to right) */}
        <View style={styles.countsRow}>
          <View style={styles.countsLeft} />
          {commentData.total > 0 && (
            <Pressable onPress={() => onPostPress?.(item.id)}>
              <Text style={styles.countText}>
                {commentData.total} comment
                {commentData.total !== 1 ? 's' : ''}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Action row */}
        <View style={styles.actionRow}>
          <View style={styles.actionButtonsLeft}>
            <Pressable
              ref={(ref) => {
                reactButtonRefs.current[item.id] = ref;
              }}
              onPress={() => {
                if (onOpenReactionTray) {
                  handlePressReact(item.id);
                } else if (onToggleLike) {
                  onToggleLike(item.id);
                }
              }}
              style={({ pressed }) => [
                styles.actionButton,
                pressed && { backgroundColor: colors.border + '15' },
              ]}
            >
              <View style={styles.actionButtonContent}>
                {topReaction ? (
                  <Text style={styles.actionEmoji}>{topReaction.emoji}</Text>
                ) : (
                  <Ionicons
                    name="thumbs-up-outline"
                    size={20}
                    color={colors.textSecondary}
                    style={styles.actionIcon}
                  />
                )}
                <Text
                  style={[
                    styles.actionText,
                    userReacted && styles.actionTextActive,
                  ]}
                >
                  {reactionTotal > 0 ? reactionTotal : ''}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => onPostPress?.(item.id)}
              style={({ pressed }) => [
                styles.actionButton,
                pressed && { backgroundColor: colors.border + '15' },
              ]}
            >
              <View style={styles.actionButtonContent}>
                <Ionicons
                  name="chatbubble-outline"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.actionIcon}
                />
                {commentData.total > 0 && (
                  <Text style={styles.actionText}>{commentData.total}</Text>
                )}
              </View>
            </Pressable>
            <Pressable
              onPress={() => handleSharePost(item)}
              style={({ pressed }) => [
                styles.actionButton,
                pressed && { backgroundColor: colors.border + '15' },
              ]}
            >
              <View style={styles.actionButtonContent}>
                <Ionicons
                  name="arrow-redo-outline"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.actionIcon}
                />
                {((item as any).share_count ?? 0) > 0 && (
                  <Text style={styles.actionText}>
                    {(item as any).share_count}
                  </Text>
                )}
              </View>
            </Pressable>
          </View>
        </View>

        {/* Footer section */}
        <View style={styles.footerSection}>
          {commentData.total > 0 && (
            <CommentPreview
              comments={commentData.preview}
              totalCount={commentData.total}
              onPressViewAll={() => onPostPress?.(item.id)}
            />
          )}
          <QuickCommentInput
            onSubmit={(text) => handleQuickComment(item.id, (item as any).room_id, text)}
          />
        </View>
      </View>
    );
  }, [
    activeVideoPostId,
    appForeground,
    commentsSummary,
    feedAutoplayEnabled,
    onPostPress,
    onOpenReactionTray,
    onToggleLike,
    reactionsSummary,
    router,
    screenFocused,
    userId,
  ]);

  const keyExtractor = useCallback((item: RoomPost) => item.id, []);

  return (
    <>
      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={headerComponent}
        ListEmptyComponent={renderEmpty}
        scrollEnabled={scrollEnabled}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        style={styles.feedContainer}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged} // → `activeVideoPostId` + `FeedVideoPreview` `feedHero.isActive`
        refreshControl={
          onRefresh ? (
            <FlightClubRefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      />

      <ActionSheet
        visible={actionSheetVisible}
        options={getActionSheetOptions()}
        onClose={() => setActionSheetVisible(false)}
      />

      {editingPost && (
        <EditPostModal
          visible={editModalVisible}
          initialContent={editingPost.content}
          onSave={handleSaveEdit}
          onClose={() => {
            setEditModalVisible(false);
            setEditingPost(null);
          }}
        />
      )}

      {sharingPost && (
        <ShareModal
          visible={shareModalVisible}
          postId={sharingPost.id}
          postContent={sharingPost.content}
          onClose={() => {
            setShareModalVisible(false);
            setSharingPost(null);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  feedContainer: {
    backgroundColor: '#F0F2F5',
  },
  postCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  postContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: spacing.sm,
  },
  postName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  timeText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  menuButton: {
    padding: spacing.xs,
  },
  postText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 21,
    letterSpacing: -0.1,
    marginBottom: 12,
  },
  postTextShort: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  mediaContainer: {
    width: '100%',
    marginTop: 0,
  },
  singleImageWrapper: {
    width: '100%',
    height: 400,
    backgroundColor: colors.border + '20',
    position: 'relative',
  },
  mediaImageCover: {
    width: '100%',
    height: '100%',
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    position: 'relative',
  },
  gridImageWrapper: {
    width: '33.33%',
    aspectRatio: 1,
    overflow: 'hidden',
  },
  mediaImageGridCover: {
    width: '100%',
    height: '100%',
  },
  countsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  countsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  reactionCountGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countEmoji: {
    fontSize: 14,
  },
  countText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border + '15',
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '15',
  },
  actionButtonsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
  },
  actionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    marginRight: 6,
  },
  actionEmoji: {
    fontSize: 15,
  },
  actionText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  actionTextActive: {
    color: colors.headerRed,
  },
  footerSection: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
