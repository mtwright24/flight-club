import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../styles/theme';
import { Room } from '../../types/rooms';

type Props = {
  room: Room;
  onJoin: (roomId: string) => Promise<void>;
  isJoining?: boolean;
};

/**
 * SuggestedRoomCard
 * Displays a room card in the Suggested section with:
 * - Room name
 * - Tags (base, fleet, airline)
 * - Member count
 * - Verified badge
 * - Join button
 */
export default function SuggestedRoomCard({ room, onJoin, isJoining }: Props) {
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    setLoading(true);
    try {
      await onJoin(room.id);
    } finally {
      setLoading(false);
    }
  };

  const tags = [];
  if (room.base) tags.push(room.base);
  if (room.fleet) tags.push(room.fleet);
  if (room.airline) tags.push(room.airline);

  return (
    <View style={[styles.card, shadow.cardShadow]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.roomName} numberOfLines={2}>{room.name}</Text>
          {room.is_verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={colors.headerRed} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}
        </View>
      </View>

      {tags.length > 0 && (
        <View style={styles.tagsRow}>
          {tags.map((tag, idx) => (
            <View key={idx} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.memberInfo}>
          <Ionicons name="people" size={14} color={colors.textSecondary} />
          <Text style={styles.memberText}>
            {room.member_count || 0} members
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.joinButton,
            pressed && styles.joinButtonPressed,
            (loading || isJoining) && styles.joinButtonDisabled,
          ]}
          onPress={handleJoin}
          disabled={loading || isJoining}
        >
          {loading || isJoining ? (
            <ActivityIndicator size="small" color={colors.cardBg} />
          ) : (
            <>
              <Ionicons name="add-circle" size={16} color={colors.cardBg} />
              <Text style={styles.joinText}>Join</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.sm,
    marginVertical: spacing.xs,
    minWidth: 200,
  },
  header: {
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  roomName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(181, 22, 30, 0.1)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.headerRed,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  tag: {
    backgroundColor: 'rgba(181, 22, 30, 0.08)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: 'rgba(181, 22, 30, 0.2)',
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.headerRed,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  joinButtonPressed: {
    backgroundColor: 'rgba(181, 22, 30, 0.8)',
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.cardBg,
  },
});
