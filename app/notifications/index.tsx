import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NotificationTopBlocks from '../../components/notifications/NotificationTopBlocks';
import NotificationRow from '../../components/notifications/NotificationRow';
import { followUser, getFollowedUserIds } from '../../lib/feed';
import {
  enrichNotificationsWithActors,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  Notification,
  notificationTargetHref,
} from '../../lib/notifications';
import { fetchTopBlockCounts, type TopBlockCounts } from '../../lib/notificationTopBlocks';
import { notificationMatchesCategoryChip, type NotificationCategoryChip } from '../../lib/notificationRegistry';
import { notificationIsRead } from '../../lib/notificationInboxUi';
import { notifyNotificationsBadgeRefresh } from '../../lib/notificationsBadgeStore';
import { useAuth } from '../../src/hooks/useAuth';
import { supabase } from '../../src/lib/supabaseClient';
import { colors, radius, spacing } from '../../src/styles/theme';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';

const EMPTY_TOP_COUNTS: TopBlockCounts = {
  messageRequests: 0,
  crewRoomInvites: 0,
  tradeMatches: 0,
  housingAlerts: 0,
};

const CATEGORY_CHIPS: { key: NotificationCategoryChip; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'messages', label: 'Messages' },
  { key: 'crew_rooms', label: 'Crew Rooms' },
  { key: 'tradeboard', label: 'Tradeboard' },
  { key: 'housing', label: 'Housing' },
];

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function isSameLocalDay(iso: string, ref: Date): boolean {
  const t = new Date(iso || 0).getTime();
  if (Number.isNaN(t)) return false;
  return startOfLocalDay(new Date(t)) === startOfLocalDay(ref);
}

type NotifSection = { title: string; data: Notification[] };

type ReadScope = 'all' | 'unread';

export default function NotificationsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [readScope, setReadScope] = useState<ReadScope>('all');
  const [categoryChip, setCategoryChip] = useState<NotificationCategoryChip>('all');
  const [followingIds, setFollowingIds] = useState<Set<string>>(() => new Set());
  const [followBackLoadingId, setFollowBackLoadingId] = useState<string | null>(null);
  const [topBlockCounts, setTopBlockCounts] = useState<TopBlockCounts>(EMPTY_TOP_COUNTS);

  const loadBlockCounts = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      setTopBlockCounts(EMPTY_TOP_COUNTS);
      return;
    }
    try {
      const c = await fetchTopBlockCounts(uid);
      setTopBlockCounts(c);
    } catch (e) {
      console.warn('[Notifications] fetchTopBlockCounts failed:', e);
    }
  }, [session?.user?.id]);

  const reloadFirstPage = useCallback(async () => {
    if (!session?.user?.id) {
      setNotifications([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchNotifications(1);
      setNotifications(data);
      setHasMore(data.length === 30);
      setPage(1);
    } catch (e) {
      console.warn('[Notifications] reloadFirstPage failed:', e);
    } finally {
      setLoading(false);
    }
    void loadBlockCounts();
  }, [session?.user?.id, loadBlockCounts]);

  useEffect(() => {
    reloadFirstPage();
  }, [reloadFirstPage]);

  useEffect(() => {
    void loadBlockCounts();
  }, [loadBlockCounts]);

  useEffect(() => {
    if (!session?.user?.id) {
      setFollowingIds(new Set());
      return;
    }
    void (async () => {
      try {
        const ids = await getFollowedUserIds(session.user.id);
        setFollowingIds(new Set(ids));
      } catch {
        setFollowingIds(new Set());
      }
    })();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel('notifications-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload: { new: Notification }) => {
          const n = payload.new;
          void enrichNotificationsWithActors([n]).then(([row]) => {
            setNotifications((prev) => {
              if (prev.find((x) => x.id === row.id)) return prev;
              return [row, ...prev];
            });
            notifyNotificationsBadgeRefresh();
            void loadBlockCounts();
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, loadBlockCounts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reloadFirstPage();
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (!session?.user?.id || !hasMore || loading) return;
    const nextPage = page + 1;
    setLoading(true);
    try {
      const data = await fetchNotifications(nextPage);
      setNotifications((prev) => [...prev, ...data]);
      setHasMore(data.length === 30);
      setPage(nextPage);
    } catch (e) {
      console.warn('[Notifications] onEndReached load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePress = useCallback(
    async (notification: Notification) => {
      const alreadyRead = notificationIsRead(notification);
      if (!alreadyRead) {
        try {
          await markNotificationsRead([notification.id]);
        } catch (e) {
          console.warn('[Notifications] mark read failed:', e);
          Alert.alert('Could not update', 'Try again in a moment.');
          return;
        }
        setNotifications((prev) =>
          prev.map((x) => (x.id === notification.id ? { ...x, is_read: true, read: true } : x))
        );
        notifyNotificationsBadgeRefresh();
      }
      const href = notificationTargetHref(notification);
      try {
        router.push(href);
      } catch (e) {
        console.warn('[Notifications] navigate failed:', e);
        Alert.alert('Unable to open', 'This update could not be opened.');
      }
    },
    [router]
  );

  const handleFollowBack = useCallback(async (n: Notification) => {
    const uid = n.actor_id;
    if (!uid) return;
    setFollowBackLoadingId(uid);
    try {
      const { error } = await followUser(uid);
      if (error) {
        Alert.alert('Follow failed', error.message || 'Please try again.');
        return;
      }
      setFollowingIds((prev) => new Set([...prev, uid]));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Please try again.';
      Alert.alert('Follow failed', msg);
    } finally {
      setFollowBackLoadingId(null);
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    const snapshot = notifications;
    setNotifications((list) => list.map((x) => ({ ...x, is_read: true, read: true })));
    notifyNotificationsBadgeRefresh();
    try {
      await markAllNotificationsRead();
      notifyNotificationsBadgeRefresh();
      void loadBlockCounts();
    } catch (e) {
      setNotifications(snapshot);
      console.warn('[Notifications] mark all read failed:', e);
      Alert.alert('Could not mark all read', 'Check your connection and try again.');
      notifyNotificationsBadgeRefresh();
    }
  }, [notifications, loadBlockCounts]);

  const filtered = useMemo(() => {
    let list = notifications;
    if (readScope === 'unread') {
      list = list.filter((n) => !notificationIsRead(n));
    }
    return list.filter((n) => notificationMatchesCategoryChip(categoryChip, n.type));
  }, [notifications, readScope, categoryChip]);

  const sections = useMemo((): NotifSection[] => {
    const now = new Date();
    const unread = filtered.filter((n) => !notificationIsRead(n));
    const read = filtered.filter((n) => notificationIsRead(n));
    const readToday = read.filter((n) => isSameLocalDay(n.created_at, now));
    const readEarlier = read.filter((n) => !isSameLocalDay(n.created_at, now));

    const out: NotifSection[] = [];
    if (unread.length) out.push({ title: 'New', data: unread });
    if (readToday.length) out.push({ title: 'Today', data: readToday });
    if (readEarlier.length) out.push({ title: 'Earlier', data: readEarlier });
    if (!out.length) out.push({ title: 'New', data: [] });
    return out;
  }, [filtered]);

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <NotificationRow
        item={item}
        followingIds={followingIds}
        onOpen={handlePress}
        onFollowBack={handleFollowBack}
        followBackLoadingId={followBackLoadingId}
      />
    ),
    [followingIds, followBackLoadingId, handlePress, handleFollowBack]
  );

  const renderSectionHeader = useCallback(({ section }: { section: NotifSection }) => {
    if (!section.data.length) return null;
    return (
      <View style={styles.sectionHeaderBar}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
    );
  }, []);

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  const listHeader = useCallback(
    () => (
      <View style={styles.listHeaderWrap}>
        <NotificationTopBlocks counts={topBlockCounts} />
        <View style={styles.filterLayerA}>
          <View style={styles.segmentGroup}>
            <Pressable onPress={() => setReadScope('all')} hitSlop={8} style={[styles.segmentHit, styles.segmentHitSpacing]}>
              <Text style={[styles.segmentLabel, readScope === 'all' && styles.segmentLabelActive]}>
                All
              </Text>
              {readScope === 'all' ? (
                <View style={styles.segmentUnderline} />
              ) : (
                <View style={styles.segmentUnderlinePlaceholder} />
              )}
            </Pressable>
            <Pressable onPress={() => setReadScope('unread')} hitSlop={8} style={styles.segmentHit}>
              <Text style={[styles.segmentLabel, readScope === 'unread' && styles.segmentLabelActive]}>
                Unread
              </Text>
              {readScope === 'unread' ? (
                <View style={styles.segmentUnderline} />
              ) : (
                <View style={styles.segmentUnderlinePlaceholder} />
              )}
            </Pressable>
          </View>
          <Pressable onPress={handleMarkAllRead} style={styles.markAllReadRow} hitSlop={6}>
            <Text style={styles.markAllReadText}>Mark all read</Text>
          </Pressable>
        </View>
        <View style={styles.pillsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow}
            keyboardShouldPersistTaps="handled"
          >
            {CATEGORY_CHIPS.map(({ key, label }, chipIndex) => {
              const active = categoryChip === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setCategoryChip(key)}
                  style={[
                    styles.pill,
                    chipIndex < CATEGORY_CHIPS.length - 1 && styles.pillSpacing,
                    active && styles.pillActive,
                  ]}
                >
                  <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    ),
    [topBlockCounts, readScope, categoryChip, handleMarkAllRead]
  );

  const totalInFilter = filtered.length;
  const listEmptyLoading = loading && !notifications.length;
  const hasNoRowsInFilter = !loading && totalInFilter === 0;
  const filterCombinationEmpty = hasNoRowsInFilter && notifications.length > 0;
  const totallyEmpty = hasNoRowsInFilter && notifications.length === 0;
  const footerLoading = loading && notifications.length > 0;

  return (
    <SafeAreaView edges={['top']} style={styles.safeTop}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerIconBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.cardBg} />
        </Pressable>
        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          ellipsizeMode="tail"
          {...(Platform.OS === 'ios'
            ? { adjustsFontSizeToMinimumFontScale: true, minimumFontScale: 0.85 }
            : {})}
        >
          Notifications
        </Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <View style={styles.body}>
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => (item.id ? String(item.id) : `row-${index}`)}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ItemSeparatorComponent={ItemSeparator}
          SectionSeparatorComponent={() => null}
          ListHeaderComponent={listHeader}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={REFRESH_CONTROL_COLORS}
              tintColor={REFRESH_TINT}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.35}
          style={styles.list}
          contentContainerStyle={styles.listContentScroll}
          ListEmptyComponent={
            listEmptyLoading ? (
              <View style={styles.emptyWrap}>
                <ActivityIndicator color={colors.headerRed} />
              </View>
            ) : filterCombinationEmpty ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>No notifications</Text>
                <Text style={styles.emptySubtitle}>Nothing here for this filter yet.</Text>
              </View>
            ) : totallyEmpty ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>No notifications</Text>
                <Text style={styles.emptySubtitle}>{"You're all caught up."}</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            footerLoading ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={colors.headerRed} />
            ) : null
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeTop: {
    flex: 1,
    backgroundColor: colors.headerRed,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: 52,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.cardBg,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerRightSpacer: {
    width: 44,
    height: 44,
  },
  body: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  listHeaderWrap: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: 'column',
    alignItems: 'stretch',
    backgroundColor: '#FFFFFF',
  },
  filterLayerA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  segmentGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  segmentHit: {
    paddingBottom: 2,
    minWidth: 44,
    alignItems: 'center',
  },
  segmentHitSpacing: {
    marginRight: 22,
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280',
    paddingBottom: 4,
  },
  segmentLabelActive: {
    fontWeight: '800',
    color: '#111827',
  },
  segmentUnderline: {
    height: 2,
    width: '100%',
    minWidth: 36,
    backgroundColor: colors.headerRed,
    borderRadius: 1,
  },
  segmentUnderlinePlaceholder: {
    height: 2,
    width: '100%',
    minWidth: 36,
    opacity: 0,
  },
  markAllReadRow: {
    flexShrink: 0,
    paddingLeft: 8,
    paddingVertical: 4,
  },
  markAllReadText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  pillsWrap: {
    backgroundColor: '#F7F7F8',
    paddingBottom: 6,
    paddingTop: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pillsRow: {
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    flexDirection: 'row',
  },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: '#E8EAED',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillSpacing: {
    marginRight: 6,
  },
  pillActive: {
    backgroundColor: colors.headerRed,
    borderColor: colors.headerRed,
    borderWidth: 1,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  pillLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  list: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  listContentScroll: {
    paddingBottom: 28,
    flexGrow: 1,
  },
  sectionHeaderBar: {
    backgroundColor: '#F0F2F5',
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4E6EB',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#050505',
    letterSpacing: -0.35,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginLeft: 0,
  },
  emptyWrap: {
    paddingTop: 48,
    alignItems: 'center',
  },
  emptyBlock: {
    paddingTop: 40,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
});
