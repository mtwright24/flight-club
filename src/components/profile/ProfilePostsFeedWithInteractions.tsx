import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import CommentsDrawer from '../comments/CommentsDrawer';
import PostsFeed from '../posts/PostsFeed';
import ReactionTrayOverlay from '../posts/ReactionTrayOverlay';
import { useAuth } from '../../hooks/useAuth';
import {
  createPostComment,
  deleteRoomPost,
  fetchPostComments,
  type RoomPost,
  type RoomPostComment,
} from '../../lib/supabase/posts';
import {
  fetchPostReactionsSummary,
  togglePostReaction,
  type PostReactionSummary,
  type ReactionType,
} from '../../lib/supabase/reactions';
import { deleteSocialFeedPost, createSocialPostComment, fetchSocialPostComments } from '../../lib/supabase/socialFeedComments';
import { fetchSocialFeedReactionsSummary } from '../../lib/supabase/socialFeedReactions';
import { toggleSocialPostReaction } from '../../lib/supabase/socialFeedReactionsActions';

type Props = {
  posts: RoomPost[];
  emptyTitle: string;
  headerComponent: React.ReactElement | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Called after delete / edit so parent can refetch */
  onPostsChanged?: () => void;
};

/**
 * Profile screens used to render {@link PostsFeed} without reaction handlers or `onPostPress`,
 * so like/comment/share behavior did not match the main feed. This component wires the same
 * interactions as {@link FeedScreen} / {@link RoomHomeScreenImpl} (social + room posts).
 */
export default function ProfilePostsFeedWithInteractions({
  posts,
  emptyTitle,
  headerComponent,
  refreshing,
  onRefresh,
  onPostsChanged,
}: Props) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [reactionsSummary, setReactionsSummary] = useState<PostReactionSummary>({});
  const [trayVisible, setTrayVisible] = useState(false);
  const [trayAnchorLayout, setTrayAnchorLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [commentsDrawerVisible, setCommentsDrawerVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<RoomPostComment[]>([]);

  const getPost = useCallback((postId: string) => posts.find((p) => p.id === postId), [posts]);

  useEffect(() => {
    if (!userId || posts.length === 0) {
      setReactionsSummary({});
      return;
    }
    const roomIds = posts.filter((p) => (p as { room_id?: string }).room_id).map((p) => p.id);
    const socialIds = posts.filter((p) => !(p as { room_id?: string }).room_id).map((p) => p.id);
    let cancelled = false;
    Promise.all([
      roomIds.length ? fetchPostReactionsSummary(roomIds, userId) : Promise.resolve({} as PostReactionSummary),
      socialIds.length ? fetchSocialFeedReactionsSummary(socialIds, userId) : Promise.resolve({} as PostReactionSummary),
    ])
      .then(([roomSum, socialSum]) => {
        if (!cancelled) setReactionsSummary({ ...roomSum, ...socialSum });
      })
      .catch((e) => console.error('[ProfilePostsFeed] reactions load failed', e));
    return () => {
      cancelled = true;
    };
  }, [posts, userId]);

  const refreshReactionSummary = useCallback(async () => {
    if (!userId || posts.length === 0) return;
    const roomIds = posts.filter((p) => (p as { room_id?: string }).room_id).map((p) => p.id);
    const socialIds = posts.filter((p) => !(p as { room_id?: string }).room_id).map((p) => p.id);
    const [roomSum, socialSum] = await Promise.all([
      roomIds.length ? fetchPostReactionsSummary(roomIds, userId) : Promise.resolve({} as PostReactionSummary),
      socialIds.length ? fetchSocialFeedReactionsSummary(socialIds, userId) : Promise.resolve({} as PostReactionSummary),
    ]);
    setReactionsSummary({ ...roomSum, ...socialSum });
  }, [posts, userId]);

  const openCommentsDrawer = useCallback(
    async (postId: string) => {
      const post = posts.find((p) => p.id === postId);
      setSelectedPostId(postId);
      setCommentsDrawerVisible(true);
      try {
        if (post && (post as { room_id?: string }).room_id) {
          const data = await fetchPostComments(postId, 50);
          setComments(data);
        } else {
          const data = await fetchSocialPostComments(postId);
          const mapped: RoomPostComment[] = (data || []).map((item: Record<string, unknown>) => ({
            id: item.id as string,
            post_id: item.post_id as string,
            room_id: '',
            user_id: item.user_id as string,
            content: (item.body ?? item.content ?? '') as string,
            created_at: item.created_at as string,
            profile_display_name:
              (item.profile_display_name as string) || (item.profiles as { display_name?: string })?.display_name || undefined,
            profile_avatar_url:
              (item.profile_avatar_url as string) || (item.profiles as { avatar_url?: string })?.avatar_url || undefined,
          }));
          setComments(mapped);
        }
      } catch (e) {
        console.error('[ProfilePostsFeed] load comments failed', e);
        setComments([]);
      }
    },
    [posts],
  );

  const handleAddComment = useCallback(
    async (text: string) => {
      if (!userId || !selectedPostId) return;
      const post = getPost(selectedPostId);
      const roomId = post ? (post as { room_id?: string | null }).room_id : null;
      if (roomId) {
        const result = await createPostComment(selectedPostId, roomId, userId, text);
        if (result.success && result.comment) {
          setComments((prev) => [...prev, result.comment!]);
        }
        return;
      }
      const result = await createSocialPostComment(selectedPostId, userId, text);
      if (!result.success) {
        if (result.error) Alert.alert('Could not post comment', result.error);
        return;
      }
      const data = await fetchSocialPostComments(selectedPostId);
      const mapped: RoomPostComment[] = (data || []).map((item: Record<string, unknown>) => ({
        id: item.id as string,
        post_id: item.post_id as string,
        room_id: '',
        user_id: item.user_id as string,
        content: (item.body ?? item.content ?? '') as string,
        created_at: item.created_at as string,
        profile_display_name:
          (item.profile_display_name as string) || (item.profiles as { display_name?: string })?.display_name || undefined,
        profile_avatar_url:
          (item.profile_avatar_url as string) || (item.profiles as { avatar_url?: string })?.avatar_url || undefined,
      }));
      setComments(mapped);
    },
    [userId, selectedPostId, getPost],
  );

  const handleOpenReactionTray = useCallback(
    (postId: string, anchorLayout: { x: number; y: number; width: number; height: number }) => {
      setActivePostId(postId);
      setTrayAnchorLayout(anchorLayout);
      setTrayVisible(true);
    },
    [],
  );

  const handleCloseReactionTray = useCallback(() => setTrayVisible(false), []);

  const handleSelectReaction = useCallback(
    async (reaction: ReactionType) => {
      if (!userId || !activePostId) return;
      const postId = activePostId;
      const post = getPost(postId);

      setReactionsSummary((prev) => {
        const newSummary = { ...prev };
        const postReactions = newSummary[postId] || { counts: {} };
        const currentUserReaction = postReactions.userReaction;
        const newCounts: Record<string, number> = { ...(postReactions.counts || {}) };

        if (currentUserReaction === reaction) {
          newCounts[reaction] = Math.max(0, (newCounts[reaction] || 0) - 1);
          newSummary[postId] = { counts: newCounts };
        } else if (currentUserReaction) {
          newCounts[currentUserReaction] = Math.max(0, (newCounts[currentUserReaction] || 0) - 1);
          newCounts[reaction] = (newCounts[reaction] || 0) + 1;
          newSummary[postId] = { counts: newCounts, userReaction: reaction };
        } else {
          newCounts[reaction] = (newCounts[reaction] || 0) + 1;
          newSummary[postId] = { counts: newCounts, userReaction: reaction };
        }

        return newSummary;
      });

      const isRoom = !!(post && (post as { room_id?: string }).room_id);
      const result = isRoom
        ? await togglePostReaction(postId, userId, reaction)
        : await toggleSocialPostReaction(postId, userId, reaction);
      if (!result.success) {
        await refreshReactionSummary();
      }
    },
    [userId, activePostId, getPost, refreshReactionSummary],
  );

  return (
    <>
      <PostsFeed
        posts={posts}
        emptyTitle={emptyTitle}
        reactionsSummary={reactionsSummary}
        onOpenReactionTray={handleOpenReactionTray}
        onPostPress={openCommentsDrawer}
        onPostUpdated={onPostsChanged}
        onPostDeleted={() => onPostsChanged?.()}
        refreshing={refreshing}
        onRefresh={onRefresh}
        deletePostOverride={async (postId: string) => {
          if (!userId) return { success: false, error: 'You must be signed in to delete posts.' };
          const post = getPost(postId);
          if (post && (post as { room_id?: string }).room_id) {
            return deleteRoomPost(postId);
          }
          try {
            await deleteSocialFeedPost(postId, userId);
            return { success: true };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to delete post',
            };
          }
        }}
        headerComponent={headerComponent}
      />
      {selectedPostId ? (
        <CommentsDrawer
          visible={commentsDrawerVisible}
          comments={comments}
          onClose={() => {
            setCommentsDrawerVisible(false);
            setSelectedPostId(null);
            setComments([]);
          }}
          onAddComment={handleAddComment}
          postId={selectedPostId}
        />
      ) : null}
      <ReactionTrayOverlay
        visible={trayVisible}
        anchorLayout={trayAnchorLayout || undefined}
        selectedReaction={activePostId ? reactionsSummary[activePostId]?.userReaction : undefined}
        reactionCounts={
          (activePostId ? reactionsSummary[activePostId]?.counts : {}) as Record<ReactionType, number>
        }
        onSelect={handleSelectReaction}
        onClose={handleCloseReactionTray}
      />
    </>
  );
}
