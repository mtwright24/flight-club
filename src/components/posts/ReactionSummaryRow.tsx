import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing } from '../../styles/theme';
import { REACTIONS, ReactionType } from '../../lib/supabase/reactions';

export type ReactionSummaryVariant = 'default' | 'commentBar';

interface ReactionSummaryRowProps {
  counts: { [reaction: string]: number };
  userReaction?: ReactionType;
  onPressReact: () => void;
  onPressComment?: () => void;
  /** Facebook-style comment row: Reply | aggregate count | react icon */
  onPressReply?: () => void;
  /** When false, hides the react affordance (e.g. logged out) but can still show counts */
  canReact?: boolean;
  compact?: boolean;
  variant?: ReactionSummaryVariant;
}

function aggregateReactionDisplay(counts: { [reaction: string]: number }): {
  total: number;
  dominantEmoji: string;
} {
  const total = REACTIONS.reduce((s, r) => s + (counts[r.type] || 0), 0);
  const nonzero = REACTIONS.map((r) => ({ type: r.type, count: counts[r.type] || 0, emoji: r.emoji })).filter(
    (x) => x.count > 0
  );
  nonzero.sort((a, b) => b.count - a.count);
  const dominantEmoji = nonzero[0]?.emoji || REACTIONS[0].emoji;
  return { total, dominantEmoji };
}

export default function ReactionSummaryRow({
  counts,
  userReaction,
  onPressReact,
  onPressComment,
  onPressReply,
  canReact = true,
  compact = false,
  variant = 'default',
}: ReactionSummaryRowProps) {
  const userReactionConfig = userReaction ? REACTIONS.find((r) => r.type === userReaction) : null;
  const { total, dominantEmoji } = aggregateReactionDisplay(counts);

  if (variant === 'commentBar') {
    return (
      <View style={styles.commentBarRow}>
        {onPressReply ? (
          <Pressable onPress={onPressReply} hitSlop={10} accessibilityRole="button" accessibilityLabel="Reply">
            <Text style={styles.replyText}>Reply</Text>
          </Pressable>
        ) : (
          <View style={styles.replySpacerZero} />
        )}
        <View style={styles.commentBarCenter}>
          {total > 0 ? (
            <View style={styles.aggregateGroup}>
              <Text style={styles.aggregateEmoji}>{dominantEmoji}</Text>
              <Text style={styles.aggregateCount}>{total}</Text>
            </View>
          ) : null}
        </View>
        {canReact ? (
          <Pressable
            onPress={onPressReact}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={userReactionConfig ? 'Change reaction' : 'React'}
            style={styles.commentBarReactHit}
          >
            {userReactionConfig ? (
              <Text style={styles.commentBarUserEmoji}>{userReactionConfig.emoji}</Text>
            ) : (
              <Ionicons name="thumbs-up-outline" size={20} color="#64748b" />
            )}
          </Pressable>
        ) : (
          <View style={styles.commentBarReactHit} />
        )}
      </View>
    );
  }

  const countEntries = REACTIONS.map((r) => ({
    emoji: r.emoji,
    count: counts[r.type] || 0,
    type: r.type,
  })).filter((entry) => entry.count > 0);

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={styles.countsRow}>
        {countEntries.length > 0 ? (
          countEntries.map((entry) => (
            <View key={entry.type} style={styles.countItem}>
              <Text style={[styles.countEmoji, compact && styles.countEmojiCompact]}>{entry.emoji}</Text>
              <Text style={[styles.countText, compact && styles.countTextCompact]}>{entry.count}</Text>
            </View>
          ))
        ) : (
          <View />
        )}
      </View>

      <View style={styles.actionsRow}>
        <Pressable onPress={onPressReact} style={styles.actionButton}>
          {userReactionConfig ? (
            <>
              <Text style={[styles.actionEmoji, compact && styles.actionEmojiCompact]}>{userReactionConfig.emoji}</Text>
              <Text style={[styles.actionText, styles.actionTextActive, compact && styles.actionTextCompact]}>
                {userReactionConfig.label}
              </Text>
            </>
          ) : (
            <Text style={[styles.actionText, compact && styles.actionTextCompact]}>React</Text>
          )}
        </Pressable>

        {onPressComment && (
          <>
            <Text style={styles.actionDivider}>·</Text>
            <Pressable onPress={onPressComment} style={styles.actionButton}>
              <Text style={[styles.actionText, compact && styles.actionTextCompact]}>Comment</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  commentBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 4,
  },
  replyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  replySpacerZero: { width: 0 },
  commentBarCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aggregateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aggregateEmoji: {
    fontSize: 15,
  },
  aggregateCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  commentBarReactHit: {
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  commentBarUserEmoji: {
    fontSize: 18,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border + '30',
  },
  containerCompact: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
  },
  countsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  countItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  countEmoji: {
    fontSize: 14,
  },
  countEmojiCompact: {
    fontSize: 12,
  },
  countText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  countTextCompact: {
    fontSize: 11,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  actionEmoji: {
    fontSize: 13,
  },
  actionEmojiCompact: {
    fontSize: 11,
  },
  actionText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  actionTextActive: {
    color: colors.headerRed,
  },
  actionTextCompact: {
    fontSize: 11,
  },
  actionDivider: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
