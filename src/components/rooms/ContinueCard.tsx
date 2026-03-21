import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow, COLORS } from '../../styles/theme';
import { MyRoom } from '../../types/rooms';

interface ContinueCardProps {
  room: MyRoom;
  onPress: (roomId: string) => void;
}

export default function ContinueCard({ room, onPress }: ContinueCardProps) {
  const truncateText = (text: string, length: number = 60) => {
    return text.length > length ? text.substring(0, length) + '...' : text;
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress(room.id)}
    >
      <View style={styles.header}>
        <Text style={styles.label}>Continue where you left off</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.headerRed} />
      </View>

      <View style={styles.content}>
        <View style={styles.mainInfo}>
          <Text style={styles.roomName} numberOfLines={1}>
            {room.name}
          </Text>
          <View style={styles.metaRow}>
            {room.unread_count > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{room.unread_count} unread</Text>
              </View>
            )}
            {room.last_message_at && (
              <Text style={styles.timeAgo}>
                {getTimeAgo(new Date(room.last_message_at))}
              </Text>
            )}
          </View>
        </View>

        {room.unread_count > 0 && (
          <View style={styles.unreadPill}>
            <Text style={styles.unreadPillText}>{room.unread_count}</Text>
          </View>
        )}
      </View>

      {room.last_message_text && (
        <Text style={styles.preview} numberOfLines={2}>
          {room.last_message_text}
        </Text>
      )}
    </Pressable>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginVertical: spacing.md,
    ...shadow.cardShadow,
  },
  cardPressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  mainInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  roomName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unreadBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: COLORS.tint,
    borderRadius: radius.sm,
  },
  unreadText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.headerRed,
  },
  timeAgo: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  unreadPill: {
    backgroundColor: colors.headerRed,
    borderRadius: radius.pill,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadPillText: {
    color: colors.cardBg,
    fontWeight: '800',
    fontSize: 12,
  },
  preview: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
