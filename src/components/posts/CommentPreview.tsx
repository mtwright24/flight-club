import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CommentPreview as CommentPreviewType } from '../../lib/supabase/posts';
import { colors, spacing } from '../../styles/theme';

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

interface CommentPreviewProps {
  comments: CommentPreviewType[];
  totalCount: number;
  onPressViewAll: () => void;
}

export default function CommentPreview({
  comments,
  totalCount,
  onPressViewAll,
}: CommentPreviewProps) {
  const router = useRouter();

  if (totalCount === 0) return null;

  // Show only the latest comment (first in array)
  const latestComment = comments[0];
  if (!latestComment) return null;

  const authorName = latestComment.author_name?.trim() || 'Crew Member';
  const text = latestComment.content.trim();
  const previewText = text.length > 80 ? `${text.substring(0, 80)}...` : text;

  return (
    <View style={styles.container}>
      {/* Single comment preview with avatar + timestamp */}
      <View style={styles.commentPreview}>
        <View style={styles.row}>
          <Pressable
            onPress={() => router.push(`/profile/${latestComment.user_id}`)}
          >
            {latestComment.avatar_url ? (
              <Image source={{ uri: latestComment.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{authorName.charAt(0)}</Text>
              </View>
            )}
          </Pressable>
          <View style={styles.commentBody}>
            <View style={styles.commentHeaderLine}>
              <Pressable onPress={() => router.push(`/profile/${latestComment.user_id}`)}>
                <Text style={styles.authorName}>{authorName}</Text>
              </Pressable>
              <Text style={styles.timestamp}>{formatTimeAgo(latestComment.created_at)}</Text>
            </View>
            <Pressable onPress={onPressViewAll}>
              <Text style={styles.commentText} numberOfLines={2}>
                {previewText}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* View all if there are more comments */}
      {totalCount > 1 && (
        <Pressable onPress={onPressViewAll} style={styles.viewAllButton}>
          <Text style={styles.viewAllText}>
            View {totalCount > 2 ? `all ${totalCount}` : '1 more'} comment{totalCount > 2 ? 's' : ''}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  commentPreview: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: colors.border + '40',
  },
  avatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: colors.border + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontWeight: '700',
    color: colors.textSecondary,
  },
  commentBody: {
    flex: 1,
  },
  commentHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  authorName: {
    fontWeight: '700',
    color: colors.textPrimary,
    marginRight: 6,
    fontSize: 13,
  },
  timestamp: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  commentText: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  viewAllButton: {
    paddingVertical: 4,
  },
  viewAllText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
