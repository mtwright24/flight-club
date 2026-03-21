import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, radius, shadow } from '../styles/theme';
import RoomChips from '../components/rooms/RoomChips';
import RoomDiscoverySection from '../components/rooms/RoomDiscoverySection';
import SuggestedRoomsSection from '../components/rooms/SuggestedRoomsSection';
import CreateRoomSheet from '../components/rooms/CreateRoomSheet';
import { useCrewRooms } from '../hooks/useCrewRooms';
import { Room } from '../types/rooms';


// HELPER: Relative time formatter (e.g., "5m ago", "1h ago")
function getRelativeTime(dateOrString?: string | Date | null): string {
  if (!dateOrString) return 'now';
  try {
    const date = typeof dateOrString === 'string' ? new Date(dateOrString) : dateOrString;
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
  } catch {
    return 'now';
  }
}

export default function CrewRoomsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [expandedMyRooms, setExpandedMyRooms] = useState(false);
  // FIXED: Explicit error state tracking
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomsFetchedSuccessfully, setRoomsFetchedSuccessfully] = useState(false);

  const crewRoomsState = useCrewRooms({
    userId: userId || '',
  });

  const {
    myRooms,
    lastActiveRoom,
    suggestedRooms,
    liveNowRooms,
    isFirstTime,
    loading,
    error: crewRoomsError,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    filters,
    setFilters,
    joinRoom,
    refetch,
  } = crewRoomsState;

  // FIXED: Track error state separately and set fetchedSuccessfully after first load
  React.useEffect(() => {
    if (!userId) {
      setRoomsError(null);
      setRoomsFetchedSuccessfully(false);
      return;
    }
    if (crewRoomsError) {
      setRoomsError(crewRoomsError);
    } else if (!loading && userId) {
      setRoomsError(null);
      setRoomsFetchedSuccessfully(true);
    }
  }, [crewRoomsError, loading, userId]);

  // ADDED: Sort and filter my rooms
  const sortedMyRooms = useMemo(() => {
    const sorted = [...myRooms].sort((a, b) => {
      // 1) Pinned first
      if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) {
        return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      }
      // 2) Unread count desc
      const aUnread = a.unread_count || 0;
      const bUnread = b.unread_count || 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      // 3) Last message time desc (nulls last)
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      // 4) Name asc
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [myRooms]);

  // Filter my rooms by search
  const filteredMyRooms = useMemo(() => {
    if (!searchQuery) return sortedMyRooms;
    const query = searchQuery.toLowerCase();
    return sortedMyRooms.filter(
      (room) =>
        room.name.toLowerCase().includes(query) ||
        room.base?.toLowerCase().includes(query) ||
        room.fleet?.toLowerCase().includes(query)
    );
  }, [sortedMyRooms, searchQuery]);

  // Display only first 4 my rooms unless expanded
  const displayedMyRooms = expandedMyRooms ? filteredMyRooms : filteredMyRooms.slice(0, 4);

  const handleRoomPress = useCallback((roomId: string, roomName?: string) => {
    console.log('[ANALYTICS] open_room', { roomId });
    try {
      router.push({
        pathname: '/(tabs)/crew-rooms/room-home',
        params: { roomId, roomName: roomName || '' },
      });
    } catch (e) {
      console.error('Navigation error:', e);
    }
  }, [router]);

  const handleCreateRoomSuccess = useCallback(
    (room: Room) => {
      console.log('[ANALYTICS] create_room_success_in_screen', { roomId: room.id });
      // Navigate to new room or refresh list
      handleRoomPress(room.id);
    },
    [handleRoomPress]
  );

  const handleJoinRoom = useCallback(
    async (roomId: string) => {
      const result = await joinRoom(roomId);
      if (result.success) {
        console.log('[ANALYTICS] join_room_in_screen', { roomId });
        // Optionally navigate to room
        handleRoomPress(roomId);
      }
    },
    [joinRoom, handleRoomPress]
  );

  if (!userId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Please sign in to view rooms.</Text>
        </View>
        {/* FAB always visible even before sign-in for consistency */}
        <Pressable
          style={({ pressed }) => [
            styles.fab,
            { bottom: insets.bottom + 72 },
            pressed && styles.fabPressed,
          ]}
          onPress={() => setCreateSheetVisible(true)}
        >
          <Ionicons name="add" size={28} color="white" />
        </Pressable>
        <CreateRoomSheet
          visible={createSheetVisible}
          userId={userId || ''}
          onClose={() => setCreateSheetVisible(false)}
          onSuccess={() => setCreateSheetVisible(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeContainer} edges={['left', 'right']}>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search rooms by base, fleet, airline…"
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Filter Chips */}
          <RoomChips filters={filters} onFilterChange={setFilters} onCreatePress={() => setCreateSheetVisible(true)} />

          {/* FIXED: Error state — show ONLY error banner, hide content below */}
          {roomsError && (
            <View style={styles.errorBanner}>
              <View style={styles.errorRow}>
                <Text style={styles.errorText}>{roomsError}</Text>
                <Pressable onPress={() => refetch?.()} style={styles.retryButton}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* FIXED: Loading state only on first load */}
          {loading && !roomsFetchedSuccessfully && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.headerRed} />
              <Text style={styles.loadingText}>Loading your rooms…</Text>
            </View>
          )}

          {/* FIXED: Empty state only when no error and rooms list is empty */}
          {!roomsError && roomsFetchedSuccessfully && filteredMyRooms.length === 0 && (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateTitle}>No rooms yet</Text>
              <Text style={styles.emptyStateDesc}>Join a room to get started. Discover rooms below or create your own.</Text>
            </View>
          )}

          {/* Continue Section — only show if rooms exist and not loading */}
          {!roomsError && filteredMyRooms.length > 0 && lastActiveRoom && !loading && (
            <View style={styles.sectionBlock}>
              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>Continue where you left off</Text>
                <Pressable onPress={() => setExpandedMyRooms(true)}>
                  <Text style={styles.headerLink}>See All &gt;</Text>
                </Pressable>
              </View>

              <Pressable
                style={styles.continueCard}
                onPress={() => handleRoomPress(lastActiveRoom.id, lastActiveRoom.name)}
              >
                <View style={styles.continueIconBox}>
                  {lastActiveRoom.avatar_url ? (
                    <Image
                      source={{ uri: lastActiveRoom.avatar_url }}
                      style={styles.continueAvatar}
                    />
                  ) : (
                    <Text style={styles.continueAvatarInitials}>
                      {lastActiveRoom.name.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.continueTextBlock}>
                  <View style={styles.continueTitleRow}>
                    <Text style={styles.continueRoomName} numberOfLines={1}>
                      {lastActiveRoom.name}
                    </Text>
                    {lastActiveRoom.unread_count > 0 && (
                      <Text style={styles.continueUnread}>
                        — {lastActiveRoom.unread_count} unread
                      </Text>
                    )}
                  </View>
                  <Text style={styles.continueSnippet} numberOfLines={1}>
                    {lastActiveRoom.last_message_text || 'Tap to continue'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.cardBg} />
              </Pressable>
            </View>
          )}

          {/* My Rooms Inbox — only show if rooms exist and no error */}
          {!roomsError && filteredMyRooms.length > 0 && (
            <View style={styles.myRoomsSection}>
              <View style={styles.headerRow}>
                <Text style={styles.myRoomsTitle}>MY ROOMS</Text>
                {myRooms.length > 4 && (
                  <Pressable onPress={() => setExpandedMyRooms((prev) => !prev)}>
                    <Text style={styles.headerLink}>{expandedMyRooms ? 'Show Less' : 'See All >'}</Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.roomListContainer}>
                {displayedMyRooms.map((room, idx) => {
                  const unreadCount = room.unread_count || 0;
                  const timeLabel = room.last_message_at ? getRelativeTime(room.last_message_at) : '—';
                  const isActive = (room as any).live_count > 0;
                  return (
                    <View key={room.id}>
                      <Pressable
                        style={styles.roomRow}
                        onPress={() => handleRoomPress(room.id, room.name)}
                      >
                        <View style={styles.rowLeftIcon}>
                          {room.avatar_url ? (
                            <Image
                              source={{ uri: room.avatar_url }}
                              style={styles.roomAvatar}
                            />
                          ) : (
                            <Text style={styles.roomAvatarInitials}>
                              {room.name.charAt(0).toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View style={styles.rowTextBlock}>
                          <View style={styles.rowTitleRow}>
                            <Text style={styles.rowRoomName} numberOfLines={1}>
                              {room.name}{room.base ? ` — ${room.base}` : ''}
                            </Text>
                            {isActive && <View style={styles.activeDot} />}
                          </View>
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {unreadCount > 0 ? `${unreadCount} unread • ${timeLabel}` : `No unread • ${timeLabel}`}
                          </Text>
                          {room.last_message_text ? (
                            <Text style={styles.rowSnippet} numberOfLines={1}>
                              {room.last_message_text}
                            </Text>
                          ) : null}
                        </View>
                        {unreadCount > 0 ? (
                          <View style={styles.unreadPill}>
                            <Text style={styles.unreadPillText}>{unreadCount}</Text>
                            <Ionicons name="chevron-forward" size={12} color={colors.cardBg} />
                          </View>
                        ) : (
                          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                        )}
                      </Pressable>
                      {idx < displayedMyRooms.length - 1 && <View style={styles.separator} />}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Suggested Rooms Section (First-time or always if empty) */}
          {!roomsError && (myRooms.length === 0 || isFirstTime) && suggestedRooms.length > 0 && (
            <SuggestedRoomsSection
              rooms={suggestedRooms}
              onJoinRoom={handleJoinRoom}
              isFirstTime={isFirstTime}
              loading={loading}
            />
          )}

          {/* Discovery Section — hide on error */}
          {!roomsError && !loading && (
            <RoomDiscoverySection
              suggestedRooms={suggestedRooms}
              liveNowRooms={liveNowRooms}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onJoinPress={handleJoinRoom}
              onRoomPress={handleRoomPress}
            />
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Red FAB Button */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 72 }]}
        onPress={() => setCreateSheetVisible(true)}
      >
        <Ionicons name="add" size={28} color="white" />
      </Pressable>

      {/* Create Room Modal */}
      <CreateRoomSheet
        visible={createSheetVisible}
        userId={userId}
        onClose={() => setCreateSheetVisible(false)}
        onSuccess={handleCreateRoomSuccess}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  safeContainer: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl + 40, // Extra space for FAB
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardBg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
  },
  errorBanner: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(225, 29, 72, 0.1)',
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.dangerRed,
  },
  errorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    color: colors.dangerRed,
    fontWeight: '600',
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.headerRed,
    borderRadius: radius.sm,
    marginLeft: spacing.md,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.cardBg,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyStateDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  sectionBlock: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.headerRed,
  },
  continueCard: {
     flexDirection: 'row',
     alignItems: 'center',
     borderRadius: radius.lg,
     paddingHorizontal: spacing.md,
     paddingVertical: spacing.md,
     gap: spacing.md,
     borderWidth: 2,
     borderColor: colors.headerRed,
     backgroundColor: colors.cardBg,
     ...shadow.cardShadow,
  },
  continueIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.headerRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  continueAvatarInitials: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.cardBg,
  },
  continueTextBlock: {
    flex: 1,
  },
  continueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  continueRoomName: {
     fontSize: 14,
     fontWeight: '800',
     color: colors.textPrimary,
  },
  continueUnread: {
     fontSize: 12,
     fontWeight: '700',
     color: colors.headerRed,
  },
  continueSnippet: {
     fontSize: 12,
     color: colors.textSecondary,
     opacity: 0.9,
  },
  myRoomsSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.screenBg,
  },
  myRoomsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roomListContainer: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.cardShadow,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowLeftIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.headerRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  roomAvatarInitials: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.cardBg,
  },
  rowTextBlock: {
    flex: 1,
  },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  rowRoomName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  rowMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  rowSnippet: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  unreadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  unreadPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.cardBg,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 40 + spacing.md,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.headerRed,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.cardShadow,
    zIndex: 999,
  },
  fabPressed: {
    transform: [{ scale: 0.9 }],
    opacity: 0.8,
  },
});
