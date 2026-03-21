import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, radius, shadow } from '../../styles/theme';
import { REACTIONS, ReactionType } from '../../lib/supabase/reactions';

interface ReactionTrayProps {
  selectedReaction?: ReactionType;
  reactionCounts?: Partial<Record<ReactionType, number>>;
  onSelect: (reaction: ReactionType) => void;
}

export default function ReactionTray({
  selectedReaction,
  reactionCounts = {},
  onSelect,
}: ReactionTrayProps) {
  return (
    <View style={styles.tray}>
      {REACTIONS.map((reaction) => {
        const isSelected = selectedReaction === reaction.type;
        const count = reactionCounts[reaction.type] || 0;
        return (
          <Pressable
            key={reaction.type}
            style={[styles.reactionButton, isSelected && styles.reactionButtonSelected]}
            onPress={() => onSelect(reaction.type)}
          >
            <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
            <Text style={[styles.reactionLabel, isSelected && styles.reactionLabelSelected]}>
              {reaction.label}
            </Text>
            {count > 0 && (
              <Text style={[styles.reactionCount, isSelected && styles.reactionCountSelected]}>
                {count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    flexDirection: 'row',
    backgroundColor: colors.cardBg,
    borderRadius: radius.xl,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 0,
    ...shadow.cardShadow,
  },
  reactionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 5,
    borderRadius: radius.sm,
    minWidth: 29,
  },
  reactionButtonSelected: {
    backgroundColor: colors.headerRed + '10',
  },
  reactionEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  reactionLabel: {
    fontSize: 7.5,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  reactionLabelSelected: {
    color: colors.headerRed,
    fontWeight: '700',
  },
  reactionCount: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  reactionCountSelected: {
    color: colors.headerRed,
  },
});
