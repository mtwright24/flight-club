
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ActivityPreview, { NotificationItem } from '../components/ActivityPreview';
import { getCurrentUserProfile, getMonthlyAwards, getTrendingPosts, getTrendingRooms, getUnreadCounts } from '../lib/home';
import { notificationTargetHref, type Notification } from '../lib/notifications';
import { getRecentNotifications, markNotificationRead, subscribeToNotifications } from '../lib/notifications-preview';
import type { NotificationPreview } from '../lib/notifications-preview';
import FlightClubHeader from '../src/components/FlightClubHeader';
import { COLORS, RADIUS, SHADOW, SPACING } from '../src/styles/theme';

function formatActivityTimeAgo(dateString: string) {
  const date = new Date(dateString);
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

/** Map NotificationPreview → NotificationItem for ActivityPreview; add user_id for routing. */
function mapPreviewToItem(
  p: NotificationPreview,
  currentUserId: string,
): NotificationItem & { user_id: string } {
  const base = p as NotificationPreview & { user_id?: string };
  return {
    ...p,
    actor_id: p.actor_id ?? '',
    user_id: base.user_id ?? currentUserId,
    timeLabel: formatActivityTimeAgo(p.created_at),
  } as NotificationItem & { user_id: string };
}

export default function HomeScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);

  const [unread, setUnread] = useState({ notifications: 0, messages: 0 });
  const [unreadLoading, setUnreadLoading] = useState(true);

  const [activity, setActivity] = useState<NotificationItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const activitySubRef = React.useRef<any>(null);

  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState(false);

  const [rooms, setRooms] = useState<any[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState(false);

  const [awards, setAwards] = useState<any[]>([]);
  const [awardsLoading, setAwardsLoading] = useState(true);
  const [awardsError, setAwardsError] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await require('../src/lib/supabaseClient').supabase.auth.getUser();
        if (!mounted) return;
        if (error) {
          console.error('Home auth getUser error', error);
          setUserId(null);
        } else {
          setUserId(data.user?.id ?? null);
        }
      } catch (err) {
        console.error('Home auth exception', err);
        if (mounted) setUserId(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    getCurrentUserProfile(userId)
      .then((data) => setProfile(data))
      .catch((err) => {
        console.error('Home getCurrentUserProfile error', err);
        setProfileError(true);
      })
      .finally(() => setProfileLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setUnreadLoading(true);
    getUnreadCounts(userId)
      .then((data) => setUnread(data))
      .finally(() => setUnreadLoading(false));
  }, [userId]);

  // Refresh profile + unread counts whenever Home gains focus so
  // updates from Edit Profile are reflected in the welcome copy.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;

      setProfileLoading(true);
      getCurrentUserProfile(userId)
        .then((data) => {
          setProfile(data);
          setProfileError(false);
        })
        .catch((err) => {
          console.error('Home focus getCurrentUserProfile error', err);
          setProfileError(true);
        })
        .finally(() => setProfileLoading(false));

      setUnreadLoading(true);
      getUnreadCounts(userId)
        .then((data) => setUnread(data))
        .finally(() => setUnreadLoading(false));
    }, [userId])
  );


  // Fetch notifications preview and unread count (only when userId is a real string)
  const effectiveUserId = userId && typeof userId === 'string' ? userId : null;
  useEffect(() => {
    if (!effectiveUserId) {
      setActivity([]);
      setActivityLoading(false);
      return;
    }
    let mounted = true;
    setActivityLoading(true);
    setActivityError(null);
    getRecentNotifications(effectiveUserId, 4)
      .then((items) => {
        if (mounted) {
          setActivity(items.map((p) => mapPreviewToItem(p, effectiveUserId)));
        }
      })
      .catch((e) => {
        if (mounted) setActivityError('Failed to load activity');
      })
      .finally(() => {
        if (mounted) setActivityLoading(false);
      });

    // Subscribe to realtime updates
    if (activitySubRef.current) {
      activitySubRef.current.unsubscribe();
    }
    activitySubRef.current = subscribeToNotifications(effectiveUserId, (n) => {
      setActivity((prev) =>
        [mapPreviewToItem(n, effectiveUserId), ...prev].slice(0, 4),
      );
      void getUnreadCounts(effectiveUserId)
        .then((counts) => {
          if (mounted) setUnread(counts);
        })
        .catch(() => {});
    });
    return () => {
      mounted = false;
      if (activitySubRef.current) activitySubRef.current.unsubscribe();
    };
  }, [effectiveUserId]);

  useEffect(() => {
    setPostsLoading(true);
    getTrendingPosts()
      .then((data) => setPosts(data))
      .catch(() => setPostsError(true))
      .finally(() => setPostsLoading(false));
  }, []);

  useEffect(() => {
    setRoomsLoading(true);
    getTrendingRooms()
      .then((data) => setRooms(data))
      .catch(() => setRoomsError(true))
      .finally(() => setRoomsLoading(false));
  }, []);

  useEffect(() => {
    setAwardsLoading(true);
    getMonthlyAwards()
      .then((data) => setAwards(data))
      .catch(() => setAwardsError(true))
      .finally(() => setAwardsLoading(false));
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!userId) return;
    try {
      setRefreshing(true);

      setProfileLoading(true);
      const prof = await getCurrentUserProfile(userId);
      setProfile(prof);
      setProfileError(false);
      setProfileLoading(false);

      setUnreadLoading(true);
      const unreadNext = await getUnreadCounts(userId);
      setUnread(unreadNext);
      setUnreadLoading(false);

      setActivityLoading(true);
      setActivityError(null);
      const items = await getRecentNotifications(userId, 4);
      setActivity(items.map((p) => mapPreviewToItem(p, userId)));
      setActivityLoading(false);

      setPostsLoading(true);
      try {
        const postsNext = await getTrendingPosts();
        setPosts(postsNext);
        setPostsError(false);
      } catch {
        setPostsError(true);
      } finally {
        setPostsLoading(false);
      }

      setRoomsLoading(true);
      try {
        const roomsNext = await getTrendingRooms();
        setRooms(roomsNext);
        setRoomsError(false);
      } catch {
        setRoomsError(true);
      } finally {
        setRoomsLoading(false);
      }

      setAwardsLoading(true);
      try {
        const awardsNext = await getMonthlyAwards();
        setAwards(awardsNext);
        setAwardsError(false);
      } catch {
        setAwardsError(true);
      } finally {
        setAwardsLoading(false);
      }
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  // Tiles for quick tools
  const tiles = [
    {
      label: 'Crew Schedule\nExchange',
      icon: require('../assets/images/auth/brand/icon-crew-exchange.png'),
      route: '/crew-schedule',
    },
    {
      label: 'Non-Rev/\nStaff Loads',
      icon: require('../assets/images/auth/brand/icon-nonrev-loads.png'),
      route: '/non-rev-loads',
    },
    {
      label: 'Crashpads/\nHousing',
      icon: require('../assets/images/auth/brand/icon-crashpads-housing.png'),
      route: '/crashpads',
    },
    {
      label: 'Utility\nHub',
      icon: require('../assets/images/auth/brand/icon-utility-hub.png'),
      route: '/(screens)/utility',
    },
  ];

  // Helper to derive display name for the welcome copy
  // This is explicitly the Display Name from Edit Profile,
  // which we persist to profiles.first_name/full_name.
  const displayName = React.useMemo(() => {
    if (!profile) return '';
    return (profile.first_name || profile.full_name || '').toString();
  }, [profile]);

  // Main vertical FlatList sections
  const sections = [
    { key: 'welcome' },
    { key: 'quicktools' },
    { key: 'activity' },
    { key: 'posts' },
    { key: 'rooms' },
    { key: 'awards' },
  ];

  const renderSection = useCallback(({ item }: { item: { key: string } }) => {
    switch (item.key) {
      case 'welcome':
        return (
          <View style={styles.welcome}>
            <Text style={styles.welcomeTitle}>
              {profileLoading
                ? 'Welcome...'
                : profileError || !profile
                ? 'Welcome!'
                : displayName
                ? `Welcome ${displayName}!`
                : 'Welcome!'}
            </Text>
            <Text style={styles.welcomeMeta}>
              {profileLoading ? '' : profileError || !profile ? '' : `Base: ${profile.base || '—'} | Fleet: ${profile.fleet || '—'}`}
            </Text>
          </View>
        );
      case 'quicktools':
        return (
          <View style={styles.grid}>
            {tiles.map(({ label, icon, route }) => (
              <Pressable
                key={label}
                style={[styles.tile, SHADOW.card]}
                onPress={() => router.push(route as Href)}
              >
                <Image source={icon} style={styles.tileIcon} resizeMode="contain" />
                <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
              </Pressable>
            ))}
          </View>
        );
      case 'activity':
        return (
          <ActivityPreview
            items={activity}
            unreadCount={unread.notifications}
            loading={activityLoading}
            error={activityError}
            onPressItem={async (notification) => {
              try {
                await markNotificationRead(notification.id);
                setActivity((prev) =>
                  prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)),
                );
                setUnread((prev) => ({
                  ...prev,
                  notifications: notification.is_read ? prev.notifications : Math.max(0, prev.notifications - 1),
                }));
                router.push(
                  notificationTargetHref(notification as NotificationItem & Notification & { user_id: string }),
                );
              } catch (e) {
                console.warn('[home] activity item tap failed:', e);
                try {
                  router.push('/notifications' as Href);
                } catch {
                  /* ignore */
                }
              }
            }}
            onPressViewAll={() => router.push('/notifications' as Href)}
          />
        );
      case 'posts':
        return (
          <SectionBlock
            title="TRENDING POSTS"
            loading={postsLoading}
            error={postsError}
            empty={posts.length === 0}
            emptyText="No trending posts yet."
          >
            <TrendingPostsRow posts={posts} loading={postsLoading} router={router} />
          </SectionBlock>
        );
      case 'rooms':
        return (
          <SectionBlock
            title="TRENDING CHAT ROOMS"
            loading={roomsLoading}
            error={roomsError}
            empty={rooms.length === 0}
            emptyText="No trending rooms yet."
          >
            <TrendingChatRoomsRow rooms={rooms} loading={roomsLoading} router={router} />
          </SectionBlock>
        );
      case 'awards':
        return (
          <SectionBlock
            title="MONTHLY AWARDS"
            loading={awardsLoading}
            error={awardsError}
            empty={awards.length === 0}
            emptyText="No awards this month."
          >
            <MonthlyAwardsRow awards={awards} loading={awardsLoading} router={router} />
          </SectionBlock>
        );
      default:
        return null;
    }
  }, [profile, profileLoading, profileError, tiles, activity, activityLoading, activityError, unread.notifications, posts, postsLoading, postsError, rooms, roomsLoading, roomsError, awards, awardsLoading, awardsError, router]);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'top']}>
      <FlightClubHeader
        bellCount={unread.notifications}
        dmCount={unread.messages}
        onPressBell={() => router.push('/notifications')}
        onPressMessage={() => router.push('/messages-inbox')}
        onPressMenu={() => router.push('/menu')}
      />
      <FlatList
        data={sections}
        renderItem={renderSection}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListFooterComponent={<View style={{ height: SPACING.xl }} />}
      />
    </SafeAreaView>
  );
}

function SectionBlock({ title, rightAction, onRightAction, loading, error, empty, emptyText, children }: any) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {rightAction && (
          <Pressable onPress={onRightAction}>
            <Text style={styles.sectionAction}>{rightAction}</Text>
          </Pressable>
        )}
      </View>
      {loading ? (
        <View style={{ alignItems: 'center', padding: 24 }}><ActivityIndicator size="small" color={COLORS.red} /></View>
      ) : error ? (
        <Text style={{ color: COLORS.red, padding: 16 }}>Failed to load.</Text>
      ) : empty ? (
        <Text style={{ color: COLORS.text2, padding: 16 }}>{emptyText}</Text>
      ) : (
        children
      )}
    </View>
  );
}

function ActivityModule({ items, loading, error }: any) {
  if (loading || error || !items) return null;
  return (
    <View style={styles.activityWrap}>
      <View style={styles.activityGrid}>
        {items.map((item: any) => (
          <Pressable
            key={item.id}
            style={[styles.activityPill, SHADOW.soft]}
            onPress={() => {}}
          >
            <Text style={styles.activityText} numberOfLines={2} ellipsizeMode="tail">
              {item.summary || item.text}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TrendingPostsRow({ posts, loading, router }: any) {
  if (loading) return null;
  return (
    <FlatList
      data={posts}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingLeft: 16, paddingRight: 16, gap: 12 }}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.trendingCard, SHADOW.soft, { width: 290, height: 175 }]}
          onPress={() => router.push(`/post/${item.id}`)}
        >
          <View style={styles.trendingTopRow}>
            <Pressable
              style={styles.trendingAvatarWrap}
              onPress={() => item.user_id && router.push(`/profile/${item.user_id}`)}
            >
              <Image
                source={{ uri: item.profiles?.avatar_url || 'https://i.pravatar.cc/100' }}
                style={styles.trendingAvatar}
              />
            </Pressable>
            <Pressable
              style={styles.trendingAuthorBlock}
              onPress={() => item.user_id && router.push(`/profile/${item.user_id}`)}
            >
              <Text style={styles.trendingAuthor}>
                {item.profiles?.display_name || item.profiles?.full_name || 'User'}
              </Text>
              <Text style={styles.trendingTime}>{formatTimeAgo(item.created_at)}</Text>
            </Pressable>
            <View style={styles.trendingReaction}>
              <Text style={styles.trendingReactionText}>🔥 {item.like_count + (item.comment_count || 0) * 2}</Text>
            </View>
          </View>
          <View style={styles.trendingBody}>
            <Text style={styles.trendingText} numberOfLines={3} ellipsizeMode="tail">
              {item.content}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}

function TrendingChatRoomsRow({ rooms, loading, router }: any) {
  if (loading) return null;
  return (
    <FlatList
      data={rooms}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingLeft: 16, paddingRight: 16, gap: 12 }}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.chatCard, SHADOW.soft, { width: 260, height: 150 }]}
          onPress={() => router.push(`/crew-rooms/${item.id}`)}
        >
          <View style={styles.chatTopRow}>
            <Text style={styles.chatTitle} numberOfLines={1} ellipsizeMode="tail">
              {item.name}
            </Text>
            {item.is_live && (
              <View style={styles.chatLiveChip}>
                <Text style={styles.chatLiveText}>Live</Text>
              </View>
            )}
          </View>
          <Text style={styles.chatSubline} numberOfLines={1} ellipsizeMode="tail">
            {item.base_tag || ''}{item.crew_room_members?.length ? ` • ${item.crew_room_members.length} chatting` : ''}
          </Text>
          <Text style={styles.chatMessage} numberOfLines={2} ellipsizeMode="tail">
            {item.last_message_at ? `Last active: ${formatTimeAgo(item.last_message_at)}` : ''}
          </Text>
        </Pressable>
      )}
    />
  );
}

function MonthlyAwardsRow({ awards, loading, router }: any) {
  if (loading) return null;
  return (
    <FlatList
      data={awards}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingLeft: 16, paddingRight: 16, gap: 12 }}
      renderItem={({ item }) => (
        <Pressable
          style={styles.awardCard}
          onPress={() => router.push(`/awards/${item.id}`)}
        >
          <View style={styles.awardContent}>
            <Image
              source={{ uri: item.award_winners?.[0]?.profiles?.avatar_url || 'https://i.pravatar.cc/100' }}
              style={styles.awardAvatarImage}
              resizeMode="cover"
            />
            <Text style={styles.awardUserName}>
              {item.award_winners?.[0]?.profiles?.display_name ||
                item.award_winners?.[0]?.profiles?.full_name ||
                'Winner'}
            </Text>
            <Text style={styles.awardUserRole}>{item.title}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
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

/** Standalone styles for legacy `/home` route (do not require tab index — it does not export `styles`). */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  welcome: {
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  welcomeTitle: {
    color: COLORS.navy,
    fontSize: 26,
    fontWeight: '700',
  },
  welcomeMeta: {
    color: COLORS.text2,
    marginTop: 4,
    fontSize: 14,
  },
  grid: {
    flexDirection: 'row',
    columnGap: SPACING.sm,
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  tile: {
    width: '23%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 6,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIcon: {
    width: 56,
    height: 56,
    marginBottom: 6,
  },
  tileLabel: {
    textAlign: 'center',
    color: COLORS.navySoft,
    fontWeight: '600',
    fontSize: 9,
    lineHeight: 11,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.red,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.4,
  },
  sectionAction: {
    color: COLORS.text2,
    fontWeight: '600',
    fontSize: 12,
  },
  activityWrap: {
    backgroundColor: 'rgba(14,42,71,0.05)',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  activityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  activityPill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  activityText: {
    color: COLORS.navySoft,
    fontSize: 12,
    fontWeight: '600',
  },
  trendingCard: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 14,
    justifyContent: 'space-between',
  },
  trendingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  trendingAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    marginRight: 10,
  },
  trendingAvatar: {
    width: '100%',
    height: '100%',
  },
  trendingAuthorBlock: {
    flex: 1,
  },
  trendingAuthor: {
    color: COLORS.navy,
    fontWeight: '700',
    fontSize: 14,
  },
  trendingTime: {
    color: COLORS.text2,
    fontSize: 11,
    marginTop: 2,
  },
  trendingReaction: {
    backgroundColor: 'rgba(14,42,71,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trendingReactionText: {
    color: COLORS.navySoft,
    fontWeight: '700',
    fontSize: 11,
  },
  trendingText: {
    color: COLORS.navySoft,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    flexShrink: 1,
  },
  trendingBody: {
    flex: 1,
  },
  chatCard: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 14,
    justifyContent: 'space-between',
  },
  chatTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatTitle: {
    color: COLORS.navy,
    fontWeight: '700',
    fontSize: 14,
    flexShrink: 1,
    marginRight: 8,
  },
  chatLiveChip: {
    backgroundColor: 'rgba(14,42,71,0.08)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chatLiveText: {
    color: COLORS.navy,
    fontSize: 11,
    fontWeight: '700',
  },
  chatSubline: {
    color: COLORS.text2,
    fontSize: 11,
    marginTop: 4,
  },
  chatMessage: {
    color: COLORS.navySoft,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  awardCard: {
    width: 190,
    height: 220,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  awardContent: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 48,
  },
  awardAvatarImage: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 0,
  },
  awardUserName: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  awardUserRole: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: 2,
  },
});
