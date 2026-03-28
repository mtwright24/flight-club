import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import ReactionSummaryRow from '../posts/ReactionSummaryRow';
import ReactionTrayOverlay from '../posts/ReactionTrayOverlay';
import { RoomPostComment } from '../../lib/supabase/posts';
import {
    CommentReactionSummary,
    fetchCommentReactionsSummary,
    fetchSocialCommentReactionsSummary,
    ReactionType,
    toggleCommentReaction,
    toggleSocialCommentReaction,
} from '../../lib/supabase/reactions';
import { colors, radius, spacing } from '../../styles/theme';

export type CommentReactionMode = 'room' | 'social';

interface CommentsDrawerProps {
  visible: boolean;
  comments: RoomPostComment[];
  onClose: () => void;
  onAddComment: (text: string) => Promise<void>;
  postId: string;
  /** When set with userId, shows react counts + tray (room vs social comment tables). */
  commentReactionMode?: CommentReactionMode | null;
  userId?: string | null;
}

export default function CommentsDrawer({
  visible,
  comments,
  onClose,
  onAddComment,
  postId,
  commentReactionMode = null,
  userId = null,
}: CommentsDrawerProps) {
  const router = useRouter();
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);

  const [commentReactionsSummary, setCommentReactionsSummary] = useState<CommentReactionSummary>({});
  const [trayVisible, setTrayVisible] = useState(false);
  const [trayAnchorLayout, setTrayAnchorLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const reactButtonRefs = useRef<{ [key: string]: View | null }>({});

  const commentIdsKey = comments.map((c) => c.id).join(',');

  const reloadCommentReactions = useCallback(async () => {
    if (!userId || !commentReactionMode || comments.length === 0) {
      setCommentReactionsSummary({});
      return;
    }
    const ids = comments.map((c) => c.id);
    const summary =
      commentReactionMode === 'room'
        ? await fetchCommentReactionsSummary(ids, userId)
        : await fetchSocialCommentReactionsSummary(ids, userId);
    setCommentReactionsSummary(summary);
  }, [userId, commentReactionMode, commentIdsKey, comments.length]);

  useEffect(() => {
    if (!visible || !userId || !commentReactionMode) {
      setCommentReactionsSummary({});
      return;
    }
    void reloadCommentReactions();
  }, [visible, userId, commentReactionMode, reloadCommentReactions]);

  const handlePressReact = useCallback(
    (commentId: string) => {
      if (!userId || !commentReactionMode) return;
      const ref = reactButtonRefs.current[commentId];
      if (!ref) return;
      ref.measureInWindow((x, y, width, height) => {
        setActiveCommentId(commentId);
        setTrayAnchorLayout({ x, y, width, height });
        setTrayVisible(true);
      });
    },
    [userId, commentReactionMode]
  );

  const handleSelectCommentReaction = useCallback(
    async (reaction: ReactionType) => {
      if (!userId || !activeCommentId || !commentReactionMode) return;
      const toggle =
        commentReactionMode === 'room' ? toggleCommentReaction : toggleSocialCommentReaction;
      const result = await toggle(activeCommentId, userId, reaction);
      if (result.success) {
        await reloadCommentReactions();
      }
      setTrayVisible(false);
      setActiveCommentId(null);
    },
    [userId, activeCommentId, commentReactionMode, reloadCommentReactions]
  );

  const handleSend = async () => {
    if (!commentText.trim() || sending) return;

    try {
      setSending(true);
      await onAddComment(commentText.trim());
      setCommentText('');
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setSending(false);
    }
  };

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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.overlay} onPress={onClose} />

          <View style={styles.drawer}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.dragHandle} />
              <Text style={styles.headerTitle}>Comments</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>

            {/* Comments list */}
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const rx = commentReactionsSummary[item.id] || { counts: {} };
                const showReactions = !!userId && !!commentReactionMode;
                return (
                  <View style={styles.commentItem}>
                    <View style={styles.commentHeader}>
                      <Pressable
                        style={styles.commentHeaderPressable}
                        onPress={() => {
                          router.push(`/profile/${item.user_id}`);
                          onClose();
                        }}
                      >
                        {item.profile_avatar_url ? (
                          <Image
                            source={{ uri: item.profile_avatar_url }}
                            style={styles.commentAvatar}
                          />
                        ) : (
                          <View style={styles.commentAvatarPlaceholder}>
                            <Text style={styles.commentAvatarText}>
                              {(item.profile_display_name || 'CM')
                                .split(' ')
                                .map((n: string) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)}
                            </Text>
                          </View>
                        )}
                        <View style={styles.commentHeaderTextCol}>
                          <Text style={styles.commentAuthor}>
                            {item.profile_display_name || 'Crew Member'}
                          </Text>
                          <Text style={styles.commentTime}>
                            {getRelativeTime(item.created_at)}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                    <Text style={styles.commentText}>
                      {(item as RoomPostComment & { body?: string }).content ??
                        (item as RoomPostComment & { body?: string }).body ??
                        ''}
                    </Text>
                    {showReactions ? (
                      <View
                        ref={(r) => {
                          reactButtonRefs.current[item.id] = r;
                        }}
                        collapsable={false}
                        style={styles.reactionRow}
                      >
                        <ReactionSummaryRow
                          counts={rx.counts}
                          userReaction={rx.userReaction}
                          onPressReact={() => handlePressReact(item.id)}
                          compact
                        />
                      </View>
                    ) : null}
                  </View>
                );
              }}
              contentContainerStyle={styles.commentsList}
              ListEmptyComponent={
                <View style={styles.emptyComments}>
                  <Text style={styles.emptyText}>No comments yet</Text>
                </View>
              }
            />

            {/* Comment input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Write a comment…"
                  placeholderTextColor={colors.textSecondary}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                  editable={!sending}
                />
                {sending ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                    style={styles.sendButton}
                  />
                ) : (
                  <Pressable
                    onPress={handleSend}
                    disabled={!commentText.trim()}
                    style={[
                      styles.sendButton,
                      !commentText.trim() && styles.sendButtonDisabled,
                    ]}
                  >
                    <Ionicons
                      name="send"
                      size={18}
                      color={
                        commentText.trim()
                          ? colors.primary
                          : colors.textSecondary
                      }
                    />
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {commentReactionMode && userId ? (
        <ReactionTrayOverlay
          visible={trayVisible}
          anchorLayout={trayAnchorLayout || undefined}
          selectedReaction={
            activeCommentId ? commentReactionsSummary[activeCommentId]?.userReaction : undefined
          }
          onSelect={handleSelectCommentReaction}
          onClose={() => {
            setTrayVisible(false);
            setActiveCommentId(null);
          }}
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  drawer: {
    height: '70%',
    backgroundColor: colors.cardBg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    flexDirection: 'column',
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '30',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  closeButton: {
    position: 'absolute',
    right: spacing.lg,
    top: spacing.md,
  },
  commentsList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  commentItem: {
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '20',
  },
  commentHeader: {
    marginBottom: spacing.xs,
  },
  commentHeaderPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  commentHeaderTextCol: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  reactionRow: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  commentAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  commentTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  commentText: {
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  emptyComments: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  inputContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border + '30',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderRadius: radius.full,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    maxHeight: 100,
  },
  sendButton: {
    padding: spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
