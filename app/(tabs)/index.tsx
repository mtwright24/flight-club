import { useFocusEffect } from '@react-navigation/native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ActivityPreview, { type NotificationItem } from '../../components/ActivityPreview';
import { getCurrentUserProfile, getMonthlyAwards, getTrendingPosts } from '../../lib/home';
import { getHomeToolShortcutIds } from '../../lib/homeShortcutsStorage';
import { pickRecommendedTools } from '../../lib/homeRecommendedTools';
import { toolsRegistry, toolShortcutChipLabel } from '../../lib/toolsRegistry';
import {
  notificationPathToHref,
  resolveNotificationRoute,
  type Notification,
} from '../../lib/notifications';
import {
  getRecentNotifications,
  markNotificationRead,
  subscribeToNotifications,
  type NotificationPreview,
} from '../../lib/notifications-preview';
import { COLORS, RADIUS, SHADOW, SPACING } from '../../src/styles/theme';
import { useAuth } from '../../src/hooks/useAuth';
import { useNotificationsBadge } from '../../src/hooks/useNotificationsBadge';
import { fetchMyRooms, fetchPublicRooms } from '../../src/lib/supabase/rooms';
import type { MyRoom, Room } from '../../src/types/rooms';

type HomeTileId = 'crew-schedule' | 'staff-loads' | 'pad-housing' | 'utility';

const tiles: { id: HomeTileId; lines: string[]; icon: number }[] = [
  {
    id: 'crew-schedule',
    lines: ['Crew', 'Schedule'],
    icon: require('../../assets/images/auth/brand/icon-crew-exchange.png'),
  },
  {
    id: 'staff-loads',
    lines: ['Staff', 'Loads'],
    icon: require('../../assets/images/auth/brand/icon-nonrev-loads.png'),
  },
  {
    id: 'pad-housing',
    lines: ['Pad', 'Housing'],
    icon: require('../../assets/images/auth/brand/icon-crashpads-housing.png'),
  },
  {
    id: 'utility',
    lines: ['Utility'],
    icon: require('../../assets/images/auth/brand/icon-utility-hub.png'),
  },
];

function routeForTile(id: HomeTileId): Href {
  switch (id) {
    case 'crew-schedule':
      return '/crew-exchange';
    case 'staff-loads':
      return '/loads';
    case 'pad-housing':
      return '/(screens)/crashpads';
    case 'utility':
      return '/(screens)/utility';
    default:
      return '/';
  }
}

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

function mapPreviewToItem(p: NotificationPreview, currentUserId: string): NotificationItem & { user_id: string } {
  const base = p as NotificationPreview & { user_id?: string };
  return {
    ...p,
    actor_id: p.actor_id ?? '',
    user_id: base.user_id ?? currentUserId,
    timeLabel: formatActivityTimeAgo(p.created_at),
  } as NotificationItem & { user_id: string };
}

type AwardCardModel = {
  id: string;
  title: string;
  skin: number;
  textColor: string;
  user: { id: string; name: string; airlineRole: string; avatarUri: string };
};

function mapMonthlyAwardsToCards(awards: any[]): AwardCardModel[] {
  const skins = [
    require('../../assets/images/brand/award-gold.png'),
    require('../../assets/images/brand/award-purple.png'),
    require('../../assets/images/brand/award-blue.png'),
  ];
  const textColors = ['#C9A23A', '#6F4BC6', '#4A87E8'];
  const out: AwardCardModel[] = [];
  let idx = 0;
  for (const award of awards || []) {
    const winners = award?.award_winners || [];
    for (const w of winners.slice(0, 1)) {
      const p = w?.profiles || {};
      const uid = p.id || w.user_id;
      if (!uid) continue;
      const mod = idx % 3;
      out.push({
        id: `${award.id}-${w.user_id}`,
        title: award.title || award.type || 'Crew honor',
        skin: skins[mod],
        textColor: textColors[mod],
        user: {
          id: String(uid),
          name: p.full_name || p.display_name || 'Member',
          airlineRole: typeof p.username === 'string' && p.username ? `@${p.username}` : ' ',
          avatarUri: p.avatar_url || 'https://i.pravatar.cc/100?img=31',
        },
      });
      idx++;
    }
  }
  return out;
}

function ShortcutsRow({ userId, toolIds }: { userId?: string | null; toolIds: string[] }) {
  const router = useRouter();
  const [pinnedRooms, setPinnedRooms] = useState<MyRoom[]>([]);

  const reloadPins = useCallback(() => {
    if (!userId) {
      setPinnedRooms([]);
      return;
    }
    fetchMyRooms(userId)
      .then((rooms) => setPinnedRooms(rooms.filter((r) => r.pinned).slice(0, 4)))
      .catch(() => setPinnedRooms([]));
  }, [userId]);

  useEffect(() => {
    reloadPins();
  }, [reloadPins]);

  useFocusEffect(
    useCallback(() => {
      reloadPins();
    }, [reloadPins]),
  );

  const toolChips = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; label: string; route: string }[] = [];
    for (const id of toolIds) {
      if (seen.has(id)) continue;
      const t = toolsRegistry.find((x) => x.id === id);
      if (!t) continue;
      seen.add(id);
      list.push({ id: t.id, label: toolShortcutChipLabel(t), route: t.route });
    }
    return list;
  }, [toolIds]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>SHORTCUTS</Text>
        <Pressable onPress={() => router.push('/home-shortcuts')} hitSlop={8}>
          <Text style={styles.sectionAction}>Edit</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        style={styles.shortcutsScroll}
        contentContainerStyle={styles.shortcutsScrollContent}
      >
        {pinnedRooms.map((room) => (
          <Pressable
            key={`room-${room.id}`}
            style={[styles.shortcutChip, SHADOW.soft]}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/crew-rooms/room-home',
                params: { roomId: room.id, roomName: room.name || '' },
              })
            }
          >
            <Text style={styles.shortcutChipText} numberOfLines={1}>
              {room.name.length > 22 ? `${room.name.slice(0, 20)}…` : room.name}
            </Text>
          </Pressable>
        ))}
        {toolChips.map((chip) => (
          <Pressable
            key={chip.id}
            style={[styles.shortcutChip, SHADOW.soft]}
            onPress={() => router.push(chip.route as Href)}
          >
            <Text style={styles.shortcutChipText} numberOfLines={1}>
              {chip.label}
            </Text>
          </Pressable>
        ))}
        {pinnedRooms.length === 0 && toolChips.length === 0 ? (
          <Pressable style={[styles.shortcutChip, styles.shortcutChipMuted, SHADOW.soft]} onPress={() => router.push('/home-shortcuts')}>
            <Text style={styles.shortcutChipTextMuted}>Set up shortcuts</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function RecommendedToolsBlock({
  profile,
  excludeIds,
}: {
  profile: Awaited<ReturnType<typeof getCurrentUserProfile>> | null;
  excludeIds: Set<string>;
}) {
  const router = useRouter();
  const tools = useMemo(() => {
    const picked = pickRecommendedTools(profile, excludeIds);
    if (picked.length > 0) return picked;
    return toolsRegistry.filter((t) => !excludeIds.has(t.id)).slice(0, 6);
  }, [profile, excludeIds]);
  if (tools.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>RECOMMENDED TOOLS</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={styles.recoToolsScroll}
      >
        {tools.map((t) => {
          const iconName = (t.iconName || 'apps-outline') as React.ComponentProps<typeof Ionicons>['name'];
          return (
            <Pressable
              key={t.id}
              style={[styles.recoToolCard, SHADOW.soft]}
              onPress={() => router.push(t.route as Href)}
            >
              <Ionicons name={iconName} size={22} color={COLORS.red} />
              <Text style={styles.recoToolTitle} numberOfLines={2}>
                {t.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function RecommendedForYouBlock({
  posts,
  rooms,
  postsLoading,
  roomsLoading,
}: {
  posts: any[];
  rooms: Room[];
  postsLoading: boolean;
  roomsLoading: boolean;
}) {
  const router = useRouter();
  const slicePosts = posts.slice(0, 4);
  const sliceRooms = rooms.slice(0, 5);
  const loading = postsLoading || roomsLoading;
  const empty = !loading && slicePosts.length === 0 && sliceRooms.length === 0;

  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>RECOMMENDED FOR YOU</Text>
      </View>
      {loading ? (
        <View style={styles.rowLoading}>
          <ActivityIndicator color={COLORS.red} />
        </View>
      ) : empty ? (
        <Text style={styles.emptySectionText}>Explore rooms and the feed to see suggestions here.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={styles.recoForYouScroll}
        >
          {sliceRooms.map((room) => (
            <Pressable
              key={`reco-room-${room.id}`}
              style={[styles.recoMixCard, SHADOW.soft]}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/crew-rooms/room-home',
                  params: { roomId: room.id, roomName: room.name || '' },
                })
              }
            >
              <Text style={styles.recoMixKicker}>ROOM</Text>
              <Text style={styles.recoMixTitle} numberOfLines={2}>
                {room.name}
              </Text>
              <Text style={styles.recoMixMeta}>
                {room.member_count ?? 0} members
                {room.last_message_at ? ` · ${formatActivityTimeAgo(room.last_message_at)}` : ''}
              </Text>
            </Pressable>
          ))}
          {slicePosts.map((post) => (
            <Pressable
              key={`reco-post-${post.id}`}
              style={[styles.recoMixCard, SHADOW.soft]}
              onPress={() => router.push(`/post/${post.id}` as Href)}
            >
              <Text style={styles.recoMixKicker}>POST</Text>
              <Text style={styles.recoMixTitle} numberOfLines={3}>
                {post.content || 'Post'}
              </Text>
              <Text style={styles.recoMixMeta} numberOfLines={1}>
                {post.profiles?.full_name || post.profiles?.display_name || 'Member'} ·{' '}
                {formatActivityTimeAgo(post.created_at)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function TopTenBlock({ posts, loading }: { posts: any[]; loading: boolean }) {
  const router = useRouter();
  const top = posts.slice(0, 10);
  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>TOP 10</Text>
      </View>
      <Text style={styles.scaffoldHint}>This week’s most engaged posts in the community.</Text>
      {loading ? (
        <View style={styles.rowLoading}>
          <ActivityIndicator color={COLORS.red} />
        </View>
      ) : top.length === 0 ? (
        <Text style={styles.emptySectionText}>No posts in the last week yet.</Text>
      ) : (
        <TopTenPostsRow posts={top} router={router} />
      )}
    </View>
  );
}

function LiveActionBlock({ rooms, loading }: { rooms: Room[]; loading: boolean }) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>LIVE ACTION ALERTS</Text>
      </View>
      <Text style={styles.scaffoldHint}>Recently active public crew rooms.</Text>
      {loading ? (
        <View style={styles.rowLoading}>
          <ActivityIndicator color={COLORS.red} />
        </View>
      ) : rooms.length === 0 ? (
        <Text style={styles.emptySectionText}>No public rooms to show yet. Open Crew Rooms to explore.</Text>
      ) : (
        <LiveActionAlertsRow rooms={rooms} router={router} />
      )}
    </View>
  );
}

function CrewHonorsBlock({ awardsRaw, loading }: { awardsRaw: any[]; loading: boolean }) {
  const router = useRouter();
  const cards = useMemo(() => mapMonthlyAwardsToCards(awardsRaw), [awardsRaw]);
  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>CREW HONORS</Text>
      </View>
      {loading ? (
        <View style={styles.rowLoading}>
          <ActivityIndicator color={COLORS.red} />
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.honorsQuietCard}>
          <Ionicons name="ribbon-outline" size={28} color={COLORS.red} style={{ marginBottom: 8 }} />
          <Text style={styles.honorsQuietTitle}>Honors roll</Text>
          <Text style={styles.honorsQuietBody}>
            Monthly recognitions will appear here when your program runs an awards cycle. Check back later — nothing is
            wrong with your account.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.awardScrollContent}
          snapToInterval={206}
          decelerationRate="fast"
        >
          {cards.map((award) => (
            <AwardCard key={award.id} award={award} router={router} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default function DashboardHome() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id;
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getCurrentUserProfile>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [trendingPosts, setTrendingPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [liveRooms, setLiveRooms] = useState<Room[]>([]);
  const [recoRooms, setRecoRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [awardsRaw, setAwardsRaw] = useState<any[]>([]);
  const [awardsLoading, setAwardsLoading] = useState(true);
  const [shortcutToolIds, setShortcutToolIds] = useState<string[]>([]);

  const refreshHomeLists = useCallback(() => {
    setPostsLoading(true);
    setRoomsLoading(true);
    setAwardsLoading(true);
    void getTrendingPosts().then((p) => {
      setTrendingPosts(p);
      setPostsLoading(false);
    });
    void fetchPublicRooms({ limit: 20 }).then((r) => {
      setLiveRooms(r);
      setRoomsLoading(false);
    });
    void getMonthlyAwards().then((a) => {
      setAwardsRaw(a);
      setAwardsLoading(false);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshHomeLists();
      if (userId) {
        void getHomeToolShortcutIds(userId).then(setShortcutToolIds);
      }
    }, [refreshHomeLists, userId]),
  );

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getCurrentUserProfile(userId)
      .then((data) => setProfile(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setShortcutToolIds([]);
      setRecoRooms([]);
      return;
    }
    void getHomeToolShortcutIds(userId).then(setShortcutToolIds);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setRecoRooms([]);
      return;
    }
    const base = profile?.base || undefined;
    void fetchPublicRooms({ base: base || undefined, limit: 10 }).then(setRecoRooms);
  }, [userId, profile?.base]);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.welcome}>
          {authLoading || loading ? (
            <>
              <Text style={styles.welcomeTitle}>Welcome...</Text>
              <Text style={styles.welcomeMeta}></Text>
            </>
          ) : error || !profile ? (
            <>
              <Text style={styles.welcomeTitle}>Welcome!</Text>
              <Text style={styles.welcomeMeta}></Text>
            </>
          ) : (
            <>
              <Text style={styles.welcomeTitle}>
                {(() => {
                  const displayName =
                    (session?.user?.user_metadata?.display_name as string | undefined) ||
                    profile.first_name ||
                    profile.full_name;
                  return displayName ? `Welcome, ${displayName}!` : 'Welcome!';
                })()}
              </Text>
              <Text style={styles.welcomeMeta}>Base: {profile.base || '—'} | Fleet: {profile.fleet || '—'}</Text>
            </>
          )}
        </View>

        <View style={styles.grid}>
          {tiles.map(({ id, lines, icon }) => (
            <Pressable
              key={id}
              style={[styles.tile, SHADOW.card]}
              onPress={() => router.push(routeForTile(id))}
            >
              <Image source={icon} style={styles.tileIcon} resizeMode="contain" />
              <View style={styles.tileLabelCol}>
                {lines.length === 1 ? (
                  <Text
                    style={styles.tileLabelSingle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {lines[0]}
                  </Text>
                ) : (
                  lines.map((line) => (
                    <Text key={line} style={styles.tileLabelLine} numberOfLines={1}>
                      {line}
                    </Text>
                  ))
                )}
              </View>
            </Pressable>
          ))}
        </View>

        <ShortcutsRow userId={userId} toolIds={shortcutToolIds} />

        <Section title="ACTIVITY" rightAction="View All >" onRightActionPress={() => router.push('/notifications')} />
        <RecommendedToolsBlock profile={profile} excludeIds={new Set(shortcutToolIds)} />
        <RecommendedForYouBlock
          posts={trendingPosts}
          rooms={recoRooms}
          postsLoading={postsLoading}
          roomsLoading={roomsLoading}
        />
        <TopTenBlock posts={trendingPosts} loading={postsLoading} />
        <LiveActionBlock rooms={liveRooms} loading={roomsLoading} />
        <CrewHonorsBlock awardsRaw={awardsRaw} loading={awardsLoading} />
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeActivitySnapshot() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const unreadBadge = useNotificationsBadge();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const subRef = useRef<ReturnType<typeof subscribeToNotifications> | null>(null);

  const avatarUris = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const it of items) {
      const u = it.actor_avatar_url;
      if (u && !seen.has(u)) {
        seen.add(u);
        out.push(u);
        if (out.length >= 5) break;
      }
    }
    return out;
  }, [items]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    getRecentNotifications(userId, 4)
      .then((rows) => {
        if (mounted) setItems(rows.map((p) => mapPreviewToItem(p, userId)));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    if (subRef.current) {
      try {
        subRef.current.unsubscribe();
      } catch {
        /* ignore */
      }
    }
    subRef.current = subscribeToNotifications(userId, (n) => {
      setItems((prev) => [mapPreviewToItem(n, userId), ...prev].slice(0, 4));
    });

    return () => {
      mounted = false;
      if (subRef.current) {
        try {
          subRef.current.unsubscribe();
        } catch {
          /* ignore */
        }
      }
    };
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void getRecentNotifications(userId, 4)
        .then((rows) => {
          setItems(rows.map((p) => mapPreviewToItem(p, userId)));
        })
        .catch(() => {});
    }, [userId]),
  );

  return (
    <View style={styles.activityWrap}>
      <View style={styles.activityTopRow}>
        <Pressable
          style={styles.avatarStack}
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel="Open notifications"
        >
          {avatarUris.map((uri, index) => (
            <View key={uri} style={[styles.avatar, { marginLeft: index === 0 ? 0 : -12 }]}>
              <Image source={{ uri }} style={styles.avatarImg} />
            </View>
          ))}
        </Pressable>
        {unreadBadge > 0 ? (
          <Pressable
            style={styles.activitySummaryChip}
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel={`${unreadBadge} unread, open notifications`}
          >
            <Text style={styles.activitySummaryChipText}>+{unreadBadge}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.activityPreviewEmbed}>
        <ActivityPreview
          embedded
          items={items}
          unreadCount={unreadBadge}
          loading={loading}
          error={null}
          embeddedEmptyTitle="You’re caught up"
          embeddedEmptySubtitle="New likes, mentions, and crew activity will show up here. Open notifications for the full list."
          onPressItem={async (notification) => {
            try {
              await markNotificationRead(notification.id);
              setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)));
              const notifForRoute = notification as NotificationItem & { user_id: string };
              const route = resolveNotificationRoute(notifForRoute as Notification);
              router.push(notificationPathToHref(route));
            } catch {
              /* non-blocking */
            }
          }}
          onPressViewAll={() => router.push('/notifications')}
        />
      </View>
    </View>
  );
}

function Section({
  title,
  rightAction,
  onRightActionPress,
}: {
  title: string;
  rightAction?: string;
  onRightActionPress?: () => void;
}) {
  if (title === 'ACTIVITY') {
    return (
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {rightAction ? (
            onRightActionPress ? (
              <Pressable onPress={onRightActionPress} accessibilityRole="button" accessibilityLabel="View all activity">
                <Text style={styles.sectionAction}>{rightAction}</Text>
              </Pressable>
            ) : (
              <Text style={styles.sectionAction}>{rightAction}</Text>
            )
          ) : null}
        </View>
        <HomeActivitySnapshot />
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {rightAction ? <Text style={styles.sectionAction}>{rightAction}</Text> : null}
      </View>
      <View style={[styles.placeholder, SHADOW.soft]} />
    </View>
  );
}

function TopTenPostsRow({ posts, router }: { posts: any[]; router: ReturnType<typeof useRouter> }) {
  const TREND_BIG_W = 290;
  const TREND_CARD_H = 175;
  const TREND_GAP = 12;
  const TREND_SIDE_PAD = 16;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingLeft: TREND_SIDE_PAD,
        paddingRight: TREND_SIDE_PAD,
        gap: TREND_GAP,
      }}
    >
      {posts.map((post, index) => {
        const rank = index + 1;
        const avatarUrl = post.profiles?.avatar_url || 'https://i.pravatar.cc/100';
        const author =
          post.profiles?.display_name || post.profiles?.full_name || 'Member';
        const likes = Number(post.like_count) || 0;
        const comments = Number(post.comment_count) || 0;
        const hasSignal = likes > 0 || comments > 0;
        const engagementLabel = !hasSignal
          ? 'New'
          : [
              likes > 0 ? `${likes} like${likes === 1 ? '' : 's'}` : null,
              comments > 0 ? `${comments} repl${comments === 1 ? 'y' : 'ies'}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
        return (
          <Pressable
            key={post.id}
            style={[
              styles.topTenCard,
              SHADOW.soft,
              { width: TREND_BIG_W, height: TREND_CARD_H },
            ]}
            onPress={() => router.push(`/post/${post.id}` as Href)}
          >
            <View style={styles.topTenRankBadge}>
              <Text style={styles.topTenRankText}>#{rank}</Text>
            </View>
            <View style={styles.trendingTopRow}>
              <View style={styles.trendingAvatarWrap}>
                <Image source={{ uri: avatarUrl }} style={styles.trendingAvatar} />
              </View>
              <View style={styles.trendingAuthorBlock}>
                <Text style={styles.trendingAuthor} numberOfLines={1}>
                  {author}
                </Text>
                <Text style={styles.trendingTime}>{formatActivityTimeAgo(post.created_at)}</Text>
              </View>
            </View>
            <View style={styles.topTenEngagementRow}>
              <Text style={styles.topTenEngagementLabel} numberOfLines={1}>
                {engagementLabel}
              </Text>
            </View>
            <View style={styles.trendingBody}>
              <Text style={styles.trendingText} numberOfLines={3} ellipsizeMode="tail">
                {post.content}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function LiveActionAlertsRow({
  rooms,
  router,
}: {
  rooms: Room[];
  router: ReturnType<typeof useRouter>;
}) {
  const CHAT_CARD_W = 268;
  const CHAT_CARD_H = 168;
  const TREND_LIVE_W = 190;
  const TREND_CARD_H = 175;
  const GAP = 12;
  const SIDE_PAD = 16;

  const previewRooms = rooms.slice(0, 8);
  const firstAvatars = previewRooms
    .map((r) => r.avatar_url)
    .filter((u): u is string => Boolean(u))
    .slice(0, 3);
  const fillerAvatars =
    firstAvatars.length > 0
      ? firstAvatars
      : ['https://i.pravatar.cc/100?img=12', 'https://i.pravatar.cc/100?img=13'];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingLeft: SIDE_PAD, paddingRight: SIDE_PAD, gap: GAP }}
    >
      <Pressable
        style={[
          styles.trendingCard,
          styles.trendingCardSmall,
          SHADOW.soft,
          { width: TREND_LIVE_W, height: TREND_CARD_H },
        ]}
        onPress={() => router.push('/(tabs)/crew-rooms')}
      >
        <View style={styles.liveTopRow}>
          <Text style={styles.liveTitle}>Crew Rooms</Text>
          <View style={styles.liveAvatars}>
            {fillerAvatars.map((uri, idx) => (
              <View key={`${uri}-${idx}`} style={[styles.liveAvatarWrap, { marginLeft: idx === 0 ? 0 : -10 }]}>
                <Image source={{ uri }} style={styles.liveAvatar} />
              </View>
            ))}
          </View>
        </View>
        <View>
          <Text style={styles.liveStatus}>
            {previewRooms.length > 0
              ? `${previewRooms.length} active rooms`
              : 'Browse all rooms'}
          </Text>
          <Text style={styles.liveChannel} numberOfLines={1}>
            Jump into live conversation
          </Text>
        </View>
        <Text style={styles.liveCta}>Open Crew Rooms {'>'}</Text>
      </Pressable>

      {previewRooms.map((room) => (
        <Pressable
          key={room.id}
          style={[styles.liveActionRoomCard, SHADOW.soft, { width: CHAT_CARD_W, minHeight: CHAT_CARD_H }]}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/crew-rooms/room-home',
              params: { roomId: room.id, roomName: room.name || '' },
            })
          }
        >
          <View style={styles.chatTopRow}>
            <Text style={styles.liveActionRoomTitle} numberOfLines={2} ellipsizeMode="tail">
              {room.name}
            </Text>
            <View style={styles.chatLiveChip}>
              <Text style={styles.chatLiveText}>Live</Text>
            </View>
          </View>
          <Text style={styles.liveActionRoomMeta} numberOfLines={1} ellipsizeMode="tail">
            {room.member_count != null ? `${room.member_count} members` : 'Crew room'}
            {room.last_message_at ? ` · ${formatActivityTimeAgo(room.last_message_at)}` : ''}
          </Text>
          <Text style={styles.liveActionRoomPreview} numberOfLines={3} ellipsizeMode="tail">
            {room.last_message_text?.trim() || 'Tap to open the room and see the latest messages.'}
          </Text>
          <View style={styles.liveActionRoomFooter}>
            {room.avatar_url ? (
              <View style={[styles.chatAvatarWrap, { marginLeft: 0 }]}>
                <Image source={{ uri: room.avatar_url }} style={styles.chatAvatar} />
              </View>
            ) : (
              <View style={{ width: 30 }} />
            )}
            <Text style={styles.liveActionRoomTime} numberOfLines={1}>
              {room.last_message_at ? `Updated ${formatActivityTimeAgo(room.last_message_at)}` : ' '}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function AwardCard({
  award,
  router,
}: {
  award: AwardCardModel;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <Pressable
      style={styles.awardCard}
      onPress={() => router.push(`/profile/${award.user.id}` as Href)}
    >
      <ImageBackground
        source={award.skin}
        style={styles.awardBackground}
        resizeMode="cover"
        imageStyle={styles.awardBackgroundImage}
      >
        <View style={styles.awardContent}>
          <Pressable
            style={styles.awardAvatarAbsolute}
            onPress={(e: any) => {
              if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
              router.push(`/profile/${award.user.id}` as Href);
            }}
          >
            <Image
              source={{ uri: award.user.avatarUri }}
              style={styles.awardAvatarImage}
              resizeMode="cover"
            />
          </Pressable>

          <View style={styles.awardBottomSection}>
            <Text style={[styles.awardUserName, { color: award.textColor }]}>{award.user.name}</Text>
            <Text style={[styles.awardUserRole, { color: award.textColor }]}>{award.title}</Text>
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    backgroundColor: COLORS.red,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    height: 34,
    width: 180,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.redDark,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  scroll: {
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
  scaffoldHint: {
    color: COLORS.text2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    paddingRight: SPACING.xs,
  },
  shortcutChip: {
    flexShrink: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  shortcutChipMuted: {
    backgroundColor: COLORS.cardAlt,
    borderStyle: 'dashed',
  },
  shortcutChipText: {
    color: COLORS.navySoft,
    fontWeight: '700',
    fontSize: 13,
  },
  shortcutChipTextMuted: {
    color: COLORS.text2,
    fontWeight: '600',
    fontSize: 13,
  },
  recoToolsScroll: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: SPACING.lg,
    paddingBottom: 4,
  },
  recoToolCard: {
    width: 132,
    minHeight: 90,
    padding: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    gap: 8,
  },
  recoToolTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navySoft,
    lineHeight: 15,
  },
  recoForYouScroll: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: SPACING.lg,
    paddingBottom: 4,
  },
  recoMixCard: {
    width: 200,
    minHeight: 104,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  recoMixKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.red,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  recoMixTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
  },
  recoMixMeta: {
    fontSize: 11,
    color: COLORS.text2,
    marginTop: 8,
    fontWeight: '600',
  },
  rowLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptySectionText: {
    fontSize: 14,
    color: COLORS.text2,
    fontWeight: '600',
    lineHeight: 20,
    paddingVertical: 8,
  },
  shortcutsScroll: {
    marginHorizontal: -2,
    overflow: 'visible',
  },
  shortcutsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 0,
    gap: 10,
    paddingVertical: 6,
    paddingRight: SPACING.lg,
    paddingLeft: 2,
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
  tileLabelCol: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    width: '100%',
    paddingHorizontal: 2,
  },
  tileLabelLine: {
    textAlign: 'center',
    color: COLORS.navySoft,
    fontWeight: '600',
    fontSize: 9,
    lineHeight: 11,
  },
  tileLabelSingle: {
    textAlign: 'center',
    color: COLORS.navySoft,
    fontWeight: '600',
    fontSize: 10,
    lineHeight: 12,
    width: '100%',
  },
  tileIcon: {
    width: 56,
    height: 56,
    marginBottom: 6,
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
  placeholder: {
    height: 110,
    backgroundColor: COLORS.cardAlt,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  activityWrap: {
    backgroundColor: 'rgba(14,42,71,0.05)',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  activityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  activitySummaryChip: {
    marginLeft: 'auto',
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: COLORS.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activitySummaryChipText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.15,
  },
  activityPreviewEmbed: {
    marginTop: 8,
  },
  trendingCard: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 14,
    justifyContent: 'space-between',
  },
  topTenCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 14,
    paddingTop: 12,
    justifyContent: 'flex-start',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.red,
    position: 'relative',
    overflow: 'hidden',
  },
  topTenRankBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(181, 22, 30, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    zIndex: 1,
  },
  topTenRankText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.red,
  },
  topTenEngagementRow: {
    marginBottom: 6,
    marginTop: 4,
  },
  topTenEngagementLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text2,
    letterSpacing: 0.15,
  },
  trendingCardSmall: {
    justifyContent: 'space-between',
  },
  liveActionRoomCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 14,
    justifyContent: 'flex-start',
  },
  liveActionRoomTitle: {
    color: COLORS.navy,
    fontWeight: '800',
    fontSize: 15,
    lineHeight: 19,
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  liveActionRoomMeta: {
    color: COLORS.text2,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 16,
  },
  liveActionRoomPreview: {
    color: COLORS.navySoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    marginTop: 10,
  },
  liveActionRoomFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    minHeight: 32,
  },
  liveActionRoomTime: {
    flex: 1,
    textAlign: 'right',
    color: COLORS.text2,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
  },
  honorsQuietCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  honorsQuietTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.navy,
    marginBottom: 6,
  },
  honorsQuietBody: {
    fontSize: 14,
    color: COLORS.text2,
    lineHeight: 21,
    textAlign: 'center',
    fontWeight: '500',
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
  liveTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveTitle: {
    color: COLORS.navy,
    fontWeight: '700',
    fontSize: 14,
  },
  liveStatus: {
    color: COLORS.text2,
    fontWeight: '600',
    fontSize: 12,
    marginTop: 6,
  },
  liveChannel: {
    color: COLORS.navySoft,
    fontWeight: '600',
    fontSize: 12,
    marginTop: 4,
  },
  liveCta: {
    color: COLORS.text2,
    fontWeight: '600',
    fontSize: 12,
    alignSelf: 'flex-end',
  },
  liveAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveAvatarWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  liveAvatar: {
    width: '100%',
    height: '100%',
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
  chatBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatAvatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  chatAvatar: {
    width: '100%',
    height: '100%',
  },
  chatTime: {
    color: COLORS.text2,
    fontSize: 11,
    fontWeight: '600',
  },
  awardScrollContent: {
    paddingLeft: 16,
    paddingRight: 16,
    gap: 12,
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
  awardBackground: {
    width: '100%',
    height: '100%',
  },
  awardBackgroundImage: {
    borderRadius: 22,
    width: '100%',
    height: '100%',
  },
  awardContent: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 48,
  },
  awardAvatarContainer: {
    marginTop: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  awardAvatarAbsolute: {
    position: 'absolute',
    top: 46,
    left: '50%',
    transform: [{ translateX: -59 }],
    width: 118,
    height: 118,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  awardAvatarImage: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 0,
  },
  awardBottomSection: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 170,
    alignItems: 'center',
    paddingHorizontal: 12,
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