import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReactionSummaryRow from '../components/posts/ReactionSummaryRow';
import ReactionTrayOverlay from '../components/posts/ReactionTrayOverlay';
import ShareModal from '../components/posts/ShareModal';
import { useAuth } from '../hooks/useAuth';
import { fetchSocialFeedPostById } from '../lib/supabase/socialFeed';
import { createSocialPostComment, deleteSocialFeedPost, fetchSocialPostComments, updateSocialFeedPost } from '../lib/supabase/socialFeedComments';
import { fetchSocialFeedReactionsSummary } from '../lib/supabase/socialFeedReactions';
import { toggleSocialPostLike } from '../lib/supabase/socialFeedReactionsActions';
import {
  CommentReactionSummary,
  fetchSocialCommentReactionsSummary,
  ReactionType,
  toggleSocialCommentReaction,
} from '../lib/supabase/reactions';
import { isFeedVideoMedia } from '../lib/media/videoDetection';

function SocialPostDetailVideo({ uri, style }: { uri: string; style: object }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={style} contentFit="contain" nativeControls />;
}

interface SocialPostDetailScreenProps {
  postId: string;
  onClose: () => void;
}

export default function SocialPostDetailScreen({ postId, onClose }: SocialPostDetailScreenProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const router = useRouter();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [reactions, setReactions] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [updating, setUpdating] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const handleShare = () => setShareVisible(true);

  const [commentReactionsSummary, setCommentReactionsSummary] = useState<CommentReactionSummary>({});
  const [commentTrayVisible, setCommentTrayVisible] = useState(false);
  const [commentTrayAnchor, setCommentTrayAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const commentReactRefs = useRef<{ [key: string]: View | null }>({});

  const loadAll = async () => {
    try {
      setLoading(true);
      const data = await fetchSocialFeedPostById(postId);
      setPost(data);

        try {
          const comm = await fetchSocialPostComments(postId);
          setComments(comm);
          if (comm.length > 0) {
            const ids = comm.map((c: { id: string }) => c.id);
            const cr = await fetchSocialCommentReactionsSummary(ids, userId || '');
            setCommentReactionsSummary(cr);
          } else {
            setCommentReactionsSummary({});
          }
        } catch (commentError) {
        console.error('Error loading social post comments:', commentError);
        // Do not crash the screen if comments fail; just show none
        setComments([]);
      }

      if (data) {
        try {
          const summary = await fetchSocialFeedReactionsSummary([postId], userId || '');
          setReactions(summary[postId] || {});
        } catch (reactionError) {
          console.error('Error loading social post reactions:', reactionError);
          setReactions({});
        }
      }
    } catch (error) {
      console.error('Error loading social post detail:', error);
      Alert.alert('Error', 'Unable to load this post right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [postId, userId]);

  const handlePressCommentReact = useCallback(
    (commentId: string) => {
      if (!userId) return;
      const ref = commentReactRefs.current[commentId];
      if (!ref) return;
      ref.measureInWindow((x, y, width, height) => {
        setActiveCommentId(commentId);
        setCommentTrayAnchor({ x, y, width, height });
        setCommentTrayVisible(true);
      });
    },
    [userId]
  );

  const handleSelectCommentReaction = useCallback(
    async (reaction: ReactionType) => {
      if (!userId || !activeCommentId) return;
      const result = await toggleSocialCommentReaction(activeCommentId, userId, reaction);
      if (result.success) {
        const ids = comments.map((c: { id: string }) => c.id);
        const summary = await fetchSocialCommentReactionsSummary(ids, userId);
        setCommentReactionsSummary(summary);
      }
      setCommentTrayVisible(false);
      setActiveCommentId(null);
    },
    [userId, activeCommentId, comments]
  );

  const handleLike = async () => {
    if (!userId) return;
    await toggleSocialPostLike(postId, userId);
    loadAll();
  };

  const handleAddComment = async () => {
    if (!userId || !commentText.trim()) return;
    const result = await createSocialPostComment(postId, userId, commentText.trim(), replyingTo?.id);
    if (result.success) {
      setCommentText('');
      setReplyingTo(null);
      loadAll();
    } else if (result.error) {
      Alert.alert('Error', result.error);
    }
  };

  const handleDelete = async () => {
    if (!userId) return;
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteSocialFeedPost(postId, userId);
        onClose();
      }}
    ]);
  };

  const handleEdit = async () => {
    if (!post) return;
    setEditing(true);
    setEditContent(post.content || '');
  };

  const handleSaveEdit = async () => {
    if (!userId) return;
    setUpdating(true);
    await updateSocialFeedPost(postId, userId, editContent);
    setEditing(false);
    setUpdating(false);
    loadAll();
  };

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator size="large" color="#B5161E" /></View>
    );
  }
  if (!post) {
    return (
      <View style={styles.center}><Text>Post not found.</Text></View>
    );
  }

  const isAuthor = userId && post.user_id === userId;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Pressable onPress={onClose} style={{ marginBottom: 16 }}>
          <Ionicons name="close" size={28} color="#B5161E" />
        </Pressable>
        <Pressable onPress={() => router.push(`/profile/${post.user_id}`)}>
          <Text style={styles.author}>{post.author_display_name || 'User'}</Text>
        </Pressable>
        {editing ? (
          <>
            <TextInput
              style={styles.input}
              value={editContent}
              onChangeText={setEditContent}
              multiline
            />
            <View style={styles.row}>
              <Pressable style={styles.postBtn} onPress={handleSaveEdit} disabled={updating}>
                <Text style={styles.postBtnText}>{updating ? 'Saving...' : 'Save'}</Text>
              </Pressable>
              <Pressable style={styles.cancel} onPress={() => setEditing(false)}>
                <Text style={{ color: '#B5161E' }}>Cancel</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={styles.content}>{post.content}</Text>
        )}
        {post.media_urls && post.media_urls.length > 0 && (
          isFeedVideoMedia(post, post.media_urls[0]) ? (
            <SocialPostDetailVideo uri={post.media_urls[0]} style={styles.media} />
          ) : (
            <Image source={{ uri: post.media_urls[0] }} style={styles.media} />
          )
        )}
        <View style={styles.row}>
          <Pressable style={styles.reactionBtn} onPress={handleLike}>
            <Ionicons name={reactions.userReaction ? 'heart' : 'heart-outline'} size={22} color={reactions.userReaction ? '#B5161E' : '#64748B'} />
            <Text style={{ marginLeft: 6 }}>{reactions.counts?.solid || 0}</Text>
          </Pressable>
          <Pressable style={styles.shareBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={22} color="#64748B" />
          </Pressable>
          {isAuthor && !editing && (
            <>
              <Pressable style={styles.editBtn} onPress={handleEdit}><Ionicons name="create-outline" size={20} color="#B5161E" /></Pressable>
              <Pressable style={styles.deleteBtn} onPress={handleDelete}><Ionicons name="trash-outline" size={20} color="#B5161E" /></Pressable>
            </>
          )}
        </View>
          <ShareModal visible={shareVisible} postId={postId} postContent={post.content} onClose={() => setShareVisible(false)} />
        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Comments</Text>
          {comments.length === 0 && <Text style={styles.noComments}>No comments yet.</Text>}
          {comments.map((c: any, idx: number) => {
            const displayName = c.profile_display_name ?? c.profiles?.display_name ?? 'User';
            const avatarUrl = c.profile_avatar_url ?? c.profiles?.avatar_url ?? '';
            const body = c.body ?? c.content ?? '';
            const rx = commentReactionsSummary[c.id] || { counts: {} };
            const isReply = !!c.parent_comment_id;
            return (
              <View key={c.id || idx} style={[styles.commentRow, isReply && styles.commentRowReply]}>
                <View style={styles.commentRowInner}>
                  <Pressable
                    style={styles.commentRowPressable}
                    onPress={() => router.push(`/profile/${c.user_id}`)}
                  >
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.commentAvatar} />
                    ) : (
                      <View style={[styles.commentAvatar, styles.commentAvatarPh]} />
                    )}
                    <View style={styles.commentBubble}>
                      <Text style={styles.commentAuthor}>{displayName}</Text>
                      <Text style={styles.commentBody}>{body}</Text>
                    </View>
                  </Pressable>
                  <View
                    ref={(r) => {
                      commentReactRefs.current[c.id] = r;
                    }}
                    collapsable={false}
                    style={styles.commentReactionWrap}
                  >
                    <ReactionSummaryRow
                      variant="commentBar"
                      counts={rx.counts}
                      userReaction={rx.userReaction}
                      onPressReact={() => {
                        if (userId) handlePressCommentReact(c.id);
                      }}
                      onPressReply={
                        userId ? () => setReplyingTo({ id: c.id, name: displayName }) : undefined
                      }
                      canReact={!!userId}
                    />
                  </View>
                </View>
              </View>
            );
          })}
          {replyingTo ? (
            <View style={styles.replyingBanner}>
              <Text style={styles.replyingText} numberOfLines={1}>
                Replying to {replyingTo.name}
              </Text>
              <Pressable onPress={() => setReplyingTo(null)}>
                <Text style={styles.replyingCancel}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.addCommentRow}>
            <TextInput
              style={styles.addCommentInput}
              placeholder={replyingTo ? `Reply to ${replyingTo.name}…` : 'Add a comment…'}
              value={commentText}
              onChangeText={setCommentText}
              multiline
            />
            <Pressable style={styles.addCommentBtn} onPress={handleAddComment} disabled={!commentText.trim()}>
              <Ionicons name="send" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {userId ? (
        <ReactionTrayOverlay
          visible={commentTrayVisible}
          anchorLayout={commentTrayAnchor || undefined}
          selectedReaction={
            activeCommentId ? commentReactionsSummary[activeCommentId]?.userReaction : undefined
          }
          onSelect={handleSelectCommentReaction}
          onClose={() => {
            setCommentTrayVisible(false);
            setActiveCommentId(null);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  author: { fontWeight: '700', fontSize: 16, marginBottom: 8 },
  content: { fontSize: 16, marginBottom: 12 },
  media: { width: '100%', height: 240, borderRadius: 12, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  reactionBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 16, padding: 8 },
  editBtn: { marginRight: 8, padding: 8 },
  deleteBtn: { padding: 8 },
  shareBtn: { marginRight: 8, padding: 8 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, minHeight: 60, color: '#0F172A', marginBottom: 12 },
  postBtn: { backgroundColor: '#B5161E', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  postBtnText: { color: '#fff', fontWeight: '700' },
  cancel: { marginLeft: 16, marginTop: 8 },
  commentsSection: { marginTop: 24 },
  commentsTitle: { fontWeight: '700', fontSize: 15, marginBottom: 8 },
  noComments: { color: '#64748B', marginBottom: 8 },
  commentRow: { marginBottom: 12 },
  commentRowReply: { marginLeft: 20 },
  commentRowInner: { width: '100%' },
  replyingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  replyingText: { flex: 1, fontSize: 13, color: '#64748b', fontWeight: '600' },
  replyingCancel: { fontSize: 13, color: '#B5161E', fontWeight: '700' },
  commentRowPressable: { flexDirection: 'row', alignItems: 'flex-start' },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8, backgroundColor: '#eee' },
  commentAvatarPh: { backgroundColor: '#E5E7EB' },
  commentBubble: { backgroundColor: '#F1F5F9', borderRadius: 10, padding: 8, flex: 1 },
  commentReactionWrap: { marginLeft: 40, marginTop: 4 },
  commentAuthor: { fontWeight: '600', fontSize: 13, marginBottom: 2 },
  commentBody: { fontSize: 14 },
  addCommentRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  addCommentInput: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 8, color: '#0F172A', marginRight: 8 },
  addCommentBtn: { backgroundColor: '#B5161E', borderRadius: 8, padding: 10 },
});
