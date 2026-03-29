import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Pressable,
  RefreshControl,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import PostCard from '../../components/PostCard';
import ReactionSummaryRow from '../../src/components/posts/ReactionSummaryRow';
import ReactionTrayOverlay from '../../src/components/posts/ReactionTrayOverlay';
import { getPostById, getComments, addComment } from '../../lib/feed';
import {
  CommentReactionSummary,
  fetchSocialCommentReactionsSummary,
  type ReactionType,
  toggleSocialCommentReaction,
} from '../../src/lib/supabase/reactions';
import { useAuth } from '../../src/hooks/useAuth';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const postId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);

  const [commentReactionsSummary, setCommentReactionsSummary] = useState<CommentReactionSummary>({});
  const [trayVisible, setTrayVisible] = useState(false);
  const [trayAnchor, setTrayAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const reactRefs = useRef<{ [key: string]: View | null }>({});

  const loadCommentReactions = useCallback(async (list: any[]) => {
    if (!list.length) {
      setCommentReactionsSummary({});
      return;
    }
    const ids = list.map((c) => c.id).filter(Boolean);
    if (!ids.length) return;
    const summary = await fetchSocialCommentReactionsSummary(ids, userId ?? '');
    setCommentReactionsSummary(summary);
  }, [userId]);

  const loadPostAndComments = useCallback(
    async (isPull = false) => {
      if (!postId) return;
      if (!isPull) setLoading(true);
      try {
        const p = await getPostById(postId);
        setPost(p);
        const c = await getComments(postId, { limit: 50, offset: 0 });
        setComments(c);
        await loadCommentReactions(c);
      } catch {
        /* keep prior */
      } finally {
        if (!isPull) setLoading(false);
      }
    },
    [postId, loadCommentReactions]
  );

  useEffect(() => {
    void loadPostAndComments(false);
  }, [loadPostAndComments]);

  const { refreshing: postPullRefreshing, onRefresh: onPostPullRefresh } = usePullToRefresh(async () => {
    await loadPostAndComments(true);
  });

  const handlePressReact = useCallback(
    (commentId: string) => {
      if (!userId) return;
      const ref = reactRefs.current[commentId];
      if (!ref) return;
      ref.measureInWindow((x, y, width, height) => {
        setActiveCommentId(commentId);
        setTrayAnchor({ x, y, width, height });
        setTrayVisible(true);
      });
    },
    [userId]
  );

  const handleSelectReaction = useCallback(
    async (reaction: ReactionType) => {
      if (!userId || !activeCommentId) return;
      const result = await toggleSocialCommentReaction(activeCommentId, userId, reaction);
      if (result.success) {
        await loadCommentReactions(comments);
      }
      setTrayVisible(false);
      setActiveCommentId(null);
    },
    [userId, activeCommentId, comments, loadCommentReactions]
  );

  const handleAddComment = async () => {
    if (!commentText.trim() || !postId) return;
    setPosting(true);
    try {
      await addComment(postId, commentText.trim(), replyingTo?.id);
      setCommentText('');
      setReplyingTo(null);
      const c = await getComments(postId, { limit: 50, offset: 0 });
      setComments(c);
      await loadCommentReactions(c);
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#B5161E" />
      </View>
    );
  }
  if (!post) {
    return (
      <View style={styles.center}>
        <Text>Post not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.safe}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={postPullRefreshing}
            onRefresh={onPostPullRefresh}
            colors={REFRESH_CONTROL_COLORS}
            tintColor={REFRESH_TINT}
          />
        }
      >
        <PostCard post={post} />
        <View style={styles.commentsSection}>
          {comments.map((c) => {
            const profile = c.profiles;
            const name =
              profile?.display_name || profile?.full_name || profile?.first_name || 'User';
            const avatar = profile?.avatar_url || '';
            const rx = commentReactionsSummary[c.id] || { counts: {} };
            const isReply = !!c.parent_comment_id;
            return (
              <View key={c.id} style={[styles.commentRow, isReply && styles.commentRowReply]}>
                <Pressable
                  style={styles.commentMain}
                  onPress={() => c.user_id && router.push(`/profile/${c.user_id}`)}
                >
                  {avatar ? (
                    <Image source={{ uri: avatar }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPh]} />
                  )}
                  <View style={styles.commentTextCol}>
                    <Text style={styles.commentUser}>{name}</Text>
                    <Text style={styles.commentBody}>{c.body}</Text>
                  </View>
                </Pressable>
                <View
                  ref={(r) => {
                    reactRefs.current[c.id] = r;
                  }}
                  collapsable={false}
                  style={styles.reactionRow}
                >
                  <ReactionSummaryRow
                    variant="commentBar"
                    counts={rx.counts}
                    userReaction={rx.userReaction}
                    onPressReact={() => {
                      if (userId) handlePressReact(c.id);
                    }}
                    onPressReply={
                      userId ? () => setReplyingTo({ id: c.id, name }) : undefined
                    }
                    canReact={!!userId}
                  />
                </View>
              </View>
            );
          })}
          {replyingTo ? (
            <View style={styles.replyingBanner}>
              <Text style={styles.replyingText} numberOfLines={1}>
                Replying to {replyingTo.name}
              </Text>
              <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
                <Text style={styles.replyingCancel}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.addCommentRow}>
            <TextInput
              style={styles.input}
              value={commentText}
              onChangeText={setCommentText}
              placeholder={replyingTo ? `Reply to ${replyingTo.name}…` : 'Add a comment…'}
              editable={!posting}
            />
            <Pressable
              onPress={handleAddComment}
              disabled={posting || !commentText.trim()}
              style={styles.button}
            >
              <Text style={styles.buttonText}>{posting ? 'Posting...' : 'Post'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {userId ? (
        <ReactionTrayOverlay
          visible={trayVisible}
          anchorLayout={trayAnchor || undefined}
          selectedReaction={
            activeCommentId ? commentReactionsSummary[activeCommentId]?.userReaction : undefined
          }
          reactionCounts={
            activeCommentId
              ? (commentReactionsSummary[activeCommentId]?.counts as Record<ReactionType, number>)
              : undefined
          }
          onSelect={handleSelectReaction}
          onClose={() => {
            setTrayVisible(false);
            setActiveCommentId(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  commentsSection: { marginTop: 24 },
  commentRow: {
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  commentRowReply: {
    marginLeft: 28,
    backgroundColor: '#F8FAFC',
  },
  replyingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  replyingText: { flex: 1, fontSize: 13, color: '#64748b', fontWeight: '600' },
  replyingCancel: { fontSize: 13, color: '#B5161E', fontWeight: '700' },
  commentMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: '#E5E7EB',
  },
  avatarPh: { backgroundColor: '#E5E7EB' },
  commentTextCol: { flex: 1, minWidth: 0 },
  commentUser: { fontWeight: '700', color: '#0F172A', marginBottom: 2, fontSize: 13 },
  commentBody: { color: '#0F172A', fontSize: 14 },
  reactionRow: {
    marginTop: 8,
    marginLeft: 46,
    alignSelf: 'flex-start',
  },
  addCommentRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 8,
    marginRight: 8,
    color: '#0F172A',
  },
  button: { backgroundColor: '#B5161E', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
