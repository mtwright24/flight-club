import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Modal,
  PanResponder,
  Animated,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../styles/theme';
import { useAuth } from '../hooks/useAuth';
import {
  fetchRoomPostById,
  RoomPost,
  fetchPostComments,
  RoomPostComment,
  createPostComment,
} from '../lib/supabase/posts';
import {
  fetchSocialFeedPostById,
  SocialFeedPost,
} from '../lib/supabase/socialFeed';
import {
  fetchPostReactionsSummary,
  togglePostReaction,
  PostReactionSummary,
  ReactionType,
  REACTIONS,
} from '../lib/supabase/reactions';
import { fetchSocialFeedReactionsSummary } from '../lib/supabase/socialFeedReactions';
import { supabase } from '../lib/supabaseClient';
import ReactionTrayOverlay from '../components/posts/ReactionTrayOverlay';
import ActionSheet, { ActionSheetOption } from '../components/common/ActionSheet';
import CommentsDrawer from '../components/comments/CommentsDrawer';
import ShareModal from '../components/posts/ShareModal';
import {
  createSocialPostComment,
  fetchSocialPostComments,
} from '../lib/supabase/socialFeedComments';
import { toggleSocialPostReaction } from '../lib/supabase/socialFeedReactionsActions';
import { isFeedVideoMedia } from '../lib/media/videoDetection';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

function PostMediaViewerVideo({ uri, style }: { uri: string; style: object }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={style} contentFit="contain" nativeControls />;
}

interface RoomData {
  id: string;
  name: string;
  is_private: boolean;
}

type ViewerMode = 'room' | 'social';
type AnyPost = RoomPost | SocialFeedPost;

export default function PostMediaViewerScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const params = useLocalSearchParams();
  const postId = params.postId as string;
  const roomId = params.roomId as string;
  const mediaIndex = parseInt(params.mediaIndex as string) || 0;

  const [post, setPost] = useState<AnyPost | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ViewerMode>('room');
  const [currentMediaIndex, setCurrentMediaIndex] = useState(mediaIndex);
  const [reactions, setReactions] = useState<PostReactionSummary>({});
  const [trayVisible, setTrayVisible] = useState(false);
  const [trayAnchorLayout, setTrayAnchorLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [commentsDrawerVisible, setCommentsDrawerVisible] = useState(false);
  const [comments, setComments] = useState<RoomPostComment[]>([]);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [overlaysVisible, setOverlaysVisible] = useState(true);
  const [authorName, setAuthorName] = useState('Crew Member');

  const reactButtonRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  // Load post, room, and reactions
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // First, try to load as a room (group) post
        let resolvedMode: ViewerMode = 'room';
        let loadedPost: AnyPost | null = await fetchRoomPostById(postId);

        if (!loadedPost) {
          // Fallback: try social feed post
          const socialPost = await fetchSocialFeedPostById(postId);
          if (!socialPost) {
            setLoading(false);
            return;
          }
          loadedPost = socialPost;
          resolvedMode = 'social';
        }

        setMode(resolvedMode);
        setPost(loadedPost);

        // Set author name from post profile data
        if (loadedPost.profile_display_name) {
          setAuthorName(loadedPost.profile_display_name);
        }

        if (userId) {
          if (resolvedMode === 'room') {
            // Fetch room for group posts
            const { data: roomData } = await supabase
              .from('rooms')
              .select('id, name, is_private')
              .eq('id', (loadedPost as RoomPost).room_id)
              .single();

            setRoom(roomData);

            // Fetch reactions for room posts
            const reactionsSummary = await fetchPostReactionsSummary([loadedPost.id], userId);
            setReactions(reactionsSummary);

            // Fetch comments for room posts
            const commentsData = await fetchPostComments(loadedPost.id, 50);
            setComments(commentsData);
          } else {
            // Social feed post: no room data
            setRoom(null);

            // Fetch reactions for social posts
            const reactionsSummary = await fetchSocialFeedReactionsSummary([loadedPost.id], userId);
            setReactions(reactionsSummary);

            // Fetch comments for social posts and map to RoomPostComment shape
            const socialComments = await fetchSocialPostComments(loadedPost.id);
            const mappedComments: RoomPostComment[] = (socialComments || []).map((item: any) => ({
              id: item.id,
              post_id: item.post_id,
              room_id: '',
              user_id: item.user_id,
              content: item.body ?? item.content ?? '',
              created_at: item.created_at,
              profile_display_name: item.profile_display_name ?? undefined,
              profile_avatar_url: item.profile_avatar_url ?? undefined,
            }));
            setComments(mappedComments);
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('[PostMediaViewer] Error loading data:', error);
        setLoading(false);
      }
    };

    loadData();
  }, [postId, userId]);

  // Swipe to dismiss gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical swipes
        return Math.abs(gestureState.dy) > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow downward swipes
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
          // Fade out as user swipes
          const newOpacity = 1 - (gestureState.dy / 400);
          opacity.setValue(Math.max(0, newOpacity));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // If swiped down more than 150px, dismiss
        if (gestureState.dy > 150) {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: 500,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            router.back();
          });
        } else {
          // Spring back
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
            }),
            Animated.spring(opacity, {
              toValue: 1,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  const handlePressReact = () => {
    if (!reactButtonRef.current) return;

    reactButtonRef.current.measureInWindow((x, y, width, height) => {
      setTrayAnchorLayout({ x, y, width, height });
      setTrayVisible(true);
    });
  };

  const handleSelectReaction = async (reaction: ReactionType) => {
    if (!userId || !post) return;

    // Optimistic update
    setReactions((prev) => {
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

    // API call based on mode
    const result =
      mode === 'room'
        ? await togglePostReaction(post.id, userId, reaction)
        : await toggleSocialPostReaction(post.id, userId, reaction);

    if (!result.success) {
      console.error('[PostMediaViewer] Failed to toggle reaction:', result.error);
      // Refetch correct reactions summary
      const summary =
        mode === 'room'
          ? await fetchPostReactionsSummary([post.id], userId)
          : await fetchSocialFeedReactionsSummary([post.id], userId);
      setReactions(summary);
    }
  };

  const handleAddComment = async (text: string, parentCommentId?: string | null) => {
    if (!post || !userId) return;

    if (mode === 'room') {
      if (!room) return;
      const result = await createPostComment(post.id, room.id, userId, text, parentCommentId);
      if (result.success && result.comment) {
        setComments((prev) => [...prev, result.comment!]);
      }
      return;
    }

    // Social feed comment
    const result = await createSocialPostComment(post.id, userId, text, parentCommentId);
    if (!result.success) {
      return;
    }

    // Reload comments for social post to include the new one
    const socialComments = await fetchSocialPostComments(post.id);
    const mappedComments: RoomPostComment[] = (socialComments || []).map((item: any) => ({
      id: item.id,
      post_id: item.post_id,
      room_id: '',
      user_id: item.user_id,
      content: item.body ?? item.content ?? '',
      parent_comment_id: item.parent_comment_id ?? null,
      created_at: item.created_at,
      profile_display_name: item.profile_display_name ?? undefined,
      profile_avatar_url: item.profile_avatar_url ?? undefined,
    }));
    setComments(mappedComments);
  };

  const getActionSheetOptions = (): ActionSheetOption[] => {
    if (!post) return [];

    const isAuthor = post.user_id === userId;

    if (isAuthor) {
      return [
        {
          label: 'Edit post',
          icon: 'create-outline',
          onPress: () => {
            // TODO: Implement edit
            console.log('Edit post');
          },
        },
        {
          label: 'Delete post',
          icon: 'trash-outline',
          destructive: true,
          onPress: () => {
            // TODO: Implement delete
            console.log('Delete post');
          },
        },
      ];
    } else {
      return [
        {
          label: 'Save post',
          icon: 'bookmark-outline',
          onPress: () => console.log('Save post'),
        },
        {
          label: 'Report post',
          icon: 'flag-outline',
          onPress: () => console.log('Report post'),
        },
      ];
    }
  };

  // Always show loading if data isn't ready yet
  if (!post || (mode === 'room' && !room)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const mediaUrls = (post.media_urls || []).filter(Boolean);
  const currentImageUrl = mediaUrls[currentMediaIndex];
  const currentIsVideo =
    !!currentImageUrl && isFeedVideoMedia(post as { media_type?: string | null }, currentImageUrl);
  const postReactions = reactions[post.id] || { counts: {} };
  const totalReactions = Object.values(postReactions.counts).reduce((a, b) => a + b, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View 
        style={[
          styles.animatedContainer,
          {
            transform: [{ translateY }],
            opacity,
          }
        ]}
      >
        {/* Dark background image */}
        <View style={styles.imageContainer}>
          <View 
            {...panResponder.panHandlers}
            style={styles.imageWrapper}
          >
            <Pressable 
              onPress={() => setOverlaysVisible(!overlaysVisible)}
              style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}
            >
              {currentImageUrl &&
                (currentIsVideo ? (
                  <PostMediaViewerVideo key={currentImageUrl} uri={currentImageUrl} style={styles.image} />
                ) : (
                  <Image
                    source={{ uri: currentImageUrl }}
                    style={styles.image}
                    resizeMode="contain"
                  />
                ))}
            </Pressable>
          </View>

        {/* Top controls overlay */}
        {overlaysVisible && (
          <View style={styles.topOverlay}>
            <Pressable onPress={() => router.back()} style={styles.topButton}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>

          <Pressable onPress={() => setActionSheetVisible(true)} style={styles.topButton}>
            <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
          </Pressable>
        </View>
        )}

        {/* Multi-image indicators */}
        {overlaysVisible && mediaUrls.length > 1 && (
          <View style={styles.pagerIndicators}>
            {mediaUrls.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.pagerDot,
                  idx === currentMediaIndex && styles.pagerDotActive,
                ]}
              />
            ))}
          </View>
        )}

        {/* Swipe handlers for multi-image */}
        {mediaUrls.length > 1 && (
          <>
            <Pressable
              onPress={() =>
                setCurrentMediaIndex(Math.max(0, currentMediaIndex - 1))
              }
              style={styles.swipeLeft}
              pointerEvents="box-none"
            />
            <Pressable
              onPress={() =>
                setCurrentMediaIndex(
                  Math.min(mediaUrls.length - 1, currentMediaIndex + 1)
                )
              }
              style={styles.swipeRight}
              pointerEvents="box-none"
            />
          </>
        )}
      </View>

      {/* Bottom post info overlay */}
      {overlaysVisible && (
        <View style={styles.bottomOverlay}>
          <View style={styles.postInfoBar}>
          {/* Room / context and author info */}
          <View style={styles.authorSection}>
            <Text style={styles.roomName}>{mode === 'room' && room ? room.name : 'Social Feed'}</Text>
            <Text style={styles.authorTime}>
              {authorName} · {new Date(post.created_at).toLocaleDateString()}
            </Text>
          </View>

          {/* Post text snippet */}
          {post.content && (
            <Text
              style={styles.postSnippet}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {post.content}
            </Text>
          )}

          {/* Reaction/comment counts */}
          <View style={styles.countsRow}>
            {totalReactions > 0 && (
              <Text style={styles.countText}>{totalReactions} reactions</Text>
            )}
            {comments.length > 0 && (
              <Text style={styles.countText}>{comments.length} comments</Text>
            )}
          </View>

          {/* Action buttons row */}
          <View style={styles.actionsRow}>
            <Pressable
              ref={reactButtonRef}
              onPress={handlePressReact}
              style={styles.actionButton}
            >
              {postReactions.userReaction ? (
                <>
                  <Text style={styles.actionEmoji}>
                    {REACTIONS.find((r) => r.type === postReactions.userReaction)
                      ?.emoji || '👍'}
                  </Text>
                  <Text style={styles.actionLabel}>
                    {REACTIONS.find((r) => r.type === postReactions.userReaction)
                      ?.label || 'React'}
                  </Text>
                </>
              ) : (
                <Text style={styles.actionLabel}>React</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => setCommentsDrawerVisible(true)}
              style={styles.actionButton}
            >
              <Ionicons name="chatbubble-outline" size={20} color="#fff" />
              <Text style={styles.actionLabel}>Comment</Text>
            </Pressable>

            <Pressable onPress={() => setShareModalVisible(true)} style={styles.actionButton}>
              <Ionicons name="share-social-outline" size={20} color="#fff" />
              <Text style={styles.actionLabel}>Share</Text>
            </Pressable>
          </View>
        </View>
      </View>
      )}

      </Animated.View>

      {/* Reaction tray */}
      <ReactionTrayOverlay
        visible={trayVisible}
        anchorLayout={trayAnchorLayout || undefined}
        selectedReaction={postReactions.userReaction}
        reactionCounts={postReactions.counts as Record<ReactionType, number>}
        onSelect={handleSelectReaction}
        onClose={() => setTrayVisible(false)}
      />

      {/* Comments drawer */}
      <CommentsDrawer
        visible={commentsDrawerVisible}
        comments={comments}
        onClose={() => setCommentsDrawerVisible(false)}
        onAddComment={handleAddComment}
        postId={post.id}
        commentReactionMode={mode}
        userId={userId ?? null}
      />

      {/* Action sheet menu */}
      <ActionSheet
        visible={actionSheetVisible}
        options={getActionSheetOptions()}
        onClose={() => setActionSheetVisible(false)}
      />

      {/* Share modal */}
      <ShareModal
        visible={shareModalVisible}
        postId={post.id}
        postContent={post.content}
        onClose={() => setShareModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  animatedContainer: {
    flex: 1,
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#fff',
    marginBottom: spacing.md,
  },
  closeButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  imageContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  imageWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  topOverlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pagerIndicators: {
    position: 'absolute',
    bottom: spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pagerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  pagerDotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  swipeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SCREEN_WIDTH * 0.3,
    height: '100%',
  },
  swipeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: SCREEN_WIDTH * 0.3,
    height: '100%',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingBottom: spacing.md,
  },
  postInfoBar: {
    padding: spacing.lg,
  },
  authorSection: {
    marginBottom: spacing.sm,
  },
  roomName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  authorTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: spacing.xs,
  },
  postSnippet: {
    fontSize: 13,
    color: '#fff',
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  countsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  countText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  actionEmoji: {
    fontSize: 20,
  },
  actionLabel: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
});
