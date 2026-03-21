import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../styles/theme';

interface GroupHeaderProps {
  name: string;
  memberCount: number;
  isPrivate: boolean;
  tags?: (string | null | undefined)[];
  isMember: boolean;
  onJoin: () => void;
  onInvite: () => void;
}

export default function GroupHeader({
  name,
  memberCount,
  isPrivate,
  tags = [],
  isMember,
  onJoin,
  onInvite,
}: GroupHeaderProps) {
  const validTags = tags.filter(Boolean);

  return (
    <View style={styles.container}>
      {/* Title */}
      <Text style={styles.title}>{name}</Text>

      {/* Subline */}
      <Text style={styles.subline}>
        {isPrivate ? 'Private' : 'Public'} group • {memberCount} members
      </Text>

      {/* Tags */}
      {validTags.length > 0 && (
        <View style={styles.tagsRow}>
          {validTags.map((tag, idx) => (
            <View key={idx} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.actionButton, isMember && styles.joinedButton]}
          onPress={!isMember ? onJoin : undefined}
        >
          <Text style={[styles.actionText, isMember && styles.joinedText]}>
            {isMember ? 'Joined' : 'Join'}
          </Text>
          <Ionicons
            name="chevron-down"
            size={16}
            color={isMember ? colors.headerRed : colors.cardBg}
            style={{ marginLeft: spacing.xs }}
          />
        </Pressable>
        <Pressable style={styles.inviteButton} onPress={onInvite}>
          <Text style={styles.inviteText}>Invite</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subline: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  tagPill: {
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.cardBg,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.headerRed,
    borderRadius: radius.md,
  },
  joinedButton: {
    backgroundColor: colors.screenBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.cardBg,
  },
  joinedText: {
    color: colors.headerRed,
  },
  inviteButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.headerRed,
    borderRadius: radius.md,
  },
  inviteText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.cardBg,
  },
});
