import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../styles/theme';
import { MyRoom } from '../../types/rooms';

interface RoomListItemProps {
  room: MyRoom;
  onPress: (roomId: string) => void;
}

export default function RoomListItem({ room, onPress }: RoomListItemProps) {
  const getEmoji = (type?: string): string => {
    const emojiMap: Record<string, string> = {
      base: '🌍',
      fleet: '✈️',
      airline: '🛫',
      crashpad: '🏨',
      swap: '🔄',
      layover: '🌙',
      commuters: '🚗',
      private: '🔒',
      general: '💬',
    };
    return emojiMap[type || 'general'] || '💬';
  };

  const tagLine = [room.base, room.fleet]
    .filter(Boolean)
    .join(' • ');

  const metaLine = room.unread_count > 0
    ? `${room.unread_count} unread • ${getTimeAgo(new Date(room.last_message_at || room.joined_at))}`
    : `No unread • ${getTimeAgo(new Date(room.last_message_at || room.joined_at))}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      onPress={() => onPress(room.id)}
    >
      <View style={styles.content}>
        <View style={styles.emojiCircle}>
          <Text style={styles.emoji}>{getEmoji(room.type)}</Text>
        </View>

        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={styles.roomName} numberOfLines={1}>
              {room.name}
            </Text>
            {room.unread_count > 0 && (
              <View style={styles.unreadPill}>
                <Text style={styles.unreadPillText}>{room.unread_count}</Text>
              </View>
            )}
          </View>

          {tagLine && (
            <Text style={styles.tagLine} numberOfLines={1}>
              {tagLine}
              {room.is_verified && ' • ✓ Verified'}
              {room.member_count > 0 && ` • ${room.member_count} members`}
            </Text>
          )}

          <Text style={styles.metaLine}>{metaLine}</Text>

          {room.last_message_text && (
            <Text style={styles.preview} numberOfLines={1}>
              {room.last_message_text}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.divider} />
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
  item: {
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  itemPressed: {
    backgroundColor: colors.screenBg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  emojiCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.screenBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  emoji: {
    fontSize: 24,
  },
  info: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  roomName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  unreadPill: {
    backgroundColor: colors.headerRed,
    borderRadius: radius.pill,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadPillText: {
    color: colors.cardBg,
    fontWeight: '800',
    fontSize: 11,
  },
  tagLine: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  metaLine: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  preview: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md,
    marginLeft: 60,
  },
});
