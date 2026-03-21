import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing } from '../../styles/theme';
import { REACTIONS, ReactionType } from '../../lib/supabase/reactions';

interface ReactionSummaryRowProps {
  counts: { [reaction: string]: number };
  userReaction?: ReactionType;
  onPressReact: () => void;
  onPressComment?: () => void;
  compact?: boolean;
}

export default function ReactionSummaryRow({
  counts,
  userReaction,
  onPressReact,
  onPressComment,
  compact = false,
}: ReactionSummaryRowProps) {
  // Get emojis with non-zero counts for display
  const countEntries = REACTIONS.map((r) => ({
    emoji: r.emoji,
    count: counts[r.type] || 0,
    type: r.type,
  })).filter((entry) => entry.count > 0);

  // Find user's reaction config for label
  const userReactionConfig = userReaction
    ? REACTIONS.find((r) => r.type === userReaction)
    : null;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Left: Emoji counts */}
      <View style={styles.countsRow}>
        {countEntries.length > 0 ? (
          countEntries.map((entry) => (
            <View key={entry.type} style={styles.countItem}>
              <Text style={[styles.countEmoji, compact && styles.countEmojiCompact]}>
                {entry.emoji}
              </Text>
              <Text style={[styles.countText, compact && styles.countTextCompact]}>
                {entry.count}
              </Text>
            </View>
          ))
        ) : (
          <View />
        )}
      </View>

      {/* Right: React / Comment actions */}
      <View style={styles.actionsRow}>
        <Pressable onPress={onPressReact} style={styles.actionButton}>
          {userReactionConfig ? (
            <>
              <Text style={[styles.actionEmoji, compact && styles.actionEmojiCompact]}>
                {userReactionConfig.emoji}
              </Text>
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
