import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Image } from 'react-native';
import { colors, spacing, radius, shadow, SHADOW } from '../../styles/theme';
import { Room } from '../../types/rooms';

interface RoomDiscoverySectionProps {
  suggestedRooms: Room[];
  liveNowRooms: Room[];
  activeTab: 'airlines' | 'bases' | 'pilots';
  onTabChange: (tab: 'airlines' | 'bases' | 'pilots') => void;
  onJoinPress: (roomId: string) => void;
  onRoomPress: (roomId: string) => void;
}

const TABS = ['Airlines', 'Bases', 'Pilots'] as const;

export default function RoomDiscoverySection({
  suggestedRooms,
  liveNowRooms,
  activeTab,
  onTabChange,
  onJoinPress,
  onRoomPress,
}: RoomDiscoverySectionProps) {
  const [expandedSuggested, setExpandedSuggested] = useState(false);
  const [expandedLive, setExpandedLive] = useState(false);

  const displayedSuggested = expandedSuggested ? suggestedRooms : suggestedRooms.slice(0, 4);
  const displayedLive = expandedLive ? liveNowRooms : liveNowRooms.slice(0, 6);

  return (
    <View style={styles.container}>
      {/* Suggested For You */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>SUGGESTED FOR YOU</Text>
          {!expandedSuggested && suggestedRooms.length > 4 && (
            <Pressable onPress={() => setExpandedSuggested(true)}>
              <Text style={styles.seeAll}>See All {'>'}</Text>
            </Pressable>
          )}
        </View>

        {displayedSuggested.length > 0 ? (
          <View style={styles.roomsList}>
            {displayedSuggested.map((room) => (
              <SuggestedRoomCard
                key={room.id}
                room={room}
                onJoinPress={onJoinPress}
                onRoomPress={onRoomPress}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No suggested rooms right now.</Text>
        )}

        {expandedSuggested && (
          <Pressable onPress={() => setExpandedSuggested(false)}>
            <Text style={styles.collapse}>Show Less</Text>
          </Pressable>
        )}
      </View>

      {/* Live Now */}
      <View style={[styles.section, styles.liveSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>LIVE NOW</Text>
        </View>

        <View style={styles.tabs}>
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab.toLowerCase() && styles.tabActive]}
              onPress={() => onTabChange(tab.toLowerCase() as any)}
            >
              <Text
                style={[styles.tabText, activeTab === tab.toLowerCase() && styles.tabTextActive]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        {displayedLive.length > 0 ? (
          <View style={styles.roomsList}>
            {displayedLive.map((room) => (
              <LiveRoomCard
                key={room.id}
                room={room}
                onRoomPress={onRoomPress}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No live rooms right now.</Text>
        )}

        {expandedLive && (
          <Pressable onPress={() => setExpandedLive(false)}>
            <Text style={styles.collapse}>Show Less</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function SuggestedRoomCard({
  room,
  onJoinPress,
  onRoomPress,
}: {
  room: Room;
  onJoinPress: (id: string) => void;
  onRoomPress: (id: string) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.suggestedCard, pressed && styles.cardPressed]}
      onPress={() => onRoomPress(room.id)}
    >
      <View style={styles.suggestedContent}>
        <View>
          <Text style={styles.suggestedName} numberOfLines={1}>
            {room.name}
          </Text>
          <Text style={styles.suggestedMeta}>
            {room.type} • {room.member_count || 0} members
          </Text>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.joinBtn, pressed && styles.joinBtnPressed]}
        onPress={() => onJoinPress(room.id)}
      >
        <Text style={styles.joinBtnText}>JOIN</Text>
      </Pressable>
    </Pressable>
  );
}

function LiveRoomCard({
  room,
  onRoomPress,
}: {
  room: Room;
  onRoomPress: (id: string) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.liveCard, pressed && styles.cardPressed]}
      onPress={() => onRoomPress(room.id)}
    >
      <View style={styles.liveContent}>
        <View style={styles.liveBadge}>
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        <View style={styles.liveInfo}>
          <Text style={styles.liveName} numberOfLines={1}>
            {room.name}
          </Text>
          <Text style={styles.liveMeta}>
            {room.type} • {room.base || room.airline || 'General'}
          </Text>
        </View>
      </View>
      <View style={styles.liveCount}>
        <Text style={styles.liveCountText}>{room.live_count || 0}</Text>
        <Text style={styles.liveCountLabel}>active</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.screenBg,
    paddingBottom: spacing.xl,
  },
  section: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  liveSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.headerRed,
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.headerRed,
    borderColor: colors.headerRed,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tabTextActive: {
    color: colors.cardBg,
  },
  roomsList: {
    gap: spacing.sm,
  },
  suggestedCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SHADOW.soft,
  },
  cardPressed: {
    opacity: 0.8,
  },
  suggestedContent: {
    flex: 1,
  },
  suggestedName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  suggestedMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  joinBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.headerRed,
    marginLeft: spacing.md,
  },
  joinBtnPressed: {
    backgroundColor: colors.headerRedDark,
  },
  joinBtnText: {
    color: colors.cardBg,
    fontSize: 12,
    fontWeight: '700',
  },
  liveCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SHADOW.soft,
  },
  liveContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  liveBadge: {
    backgroundColor: colors.headerRed,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveBadgeText: {
    color: colors.cardBg,
    fontSize: 10,
    fontWeight: '800',
  },
  liveInfo: {
    flex: 1,
  },
  liveName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  liveMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  liveCount: {
    alignItems: 'center',
    marginLeft: spacing.md,
  },
  liveCountText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.headerRed,
  },
  liveCountLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  collapse: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.headerRed,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
