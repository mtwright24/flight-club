import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NotificationRow from '../../../../components/notifications/NotificationRow';
import { isScheduleScopedNotification } from '../../../../lib/scheduleNotificationsFilter';
import {
  enrichNotificationsWithActors,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  Notification,
  notificationTargetHref,
} from '../../../../lib/notifications';
import { notifyNotificationsBadgeRefresh } from '../../../../lib/notificationsBadgeStore';
import { notificationIsRead } from '../../../../lib/notificationInboxUi';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabaseClient';
import { colors, spacing } from '../../../styles/theme';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../../styles/refreshControl';
import { scheduleTheme as T } from '../scheduleTheme';

type ReadScope = 'all' | 'unread';
type NotifSection = { title: string; data: Notification[] };

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

/**
 * Schedule tab: same interaction model as `/notifications`, filtered to schedule-relevant rows only.
 */
export default function ScheduleAlertsTabScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [readScope, setReadScope] = useState<ReadScope>('all');
  const [followingIds] = useState<Set<string>>(() => new Set());

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
      const scheduleOnly = data.filter(isScheduleScopedNotification);
      setNotifications(scheduleOnly);
      setHasMore(data.length === 30);
      setPage(1);
    } catch (e) {
      console.warn('[ScheduleAlerts] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void reloadFirstPage();
  }, [reloadFirstPage]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel('schedule-alerts-feed')
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
          if (!isScheduleScopedNotification(n)) return;
          void enrichNotificationsWithActors([n]).then(([row]) => {
            setNotifications((prev) => {
              if (prev.find((x) => x.id === row.id)) return prev;
              return [row, ...prev];
            });
            notifyNotificationsBadgeRefresh();
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

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
      const scheduleOnly = data.filter(isScheduleScopedNotification);
      setNotifications((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const n of scheduleOnly) {
          if (!ids.has(n.id)) merged.push(n);
        }
        return merged;
      });
      setHasMore(data.length === 30);
      setPage(nextPage);
    } catch (e) {
      console.warn('[ScheduleAlerts] page load failed:', e);
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
        } catch {
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
      } catch {
        Alert.alert('Unable to open', 'This update could not be opened.');
      }
    },
    [router]
  );

  const handleMarkAllRead = useCallback(async () => {
    const snapshot = notifications;
    setNotifications((list) => list.map((x) => ({ ...x, is_read: true, read: true })));
    notifyNotificationsBadgeRefresh();
    try {
      await markAllNotificationsRead();
      notifyNotificationsBadgeRefresh();
    } catch (e) {
      setNotifications(snapshot);
      Alert.alert('Could not mark all read', 'Check your connection and try again.');
      notifyNotificationsBadgeRefresh();
    }
  }, [notifications]);

  const filtered = useMemo(() => {
    let list = notifications.filter(isScheduleScopedNotification);
    if (readScope === 'unread') {
      list = list.filter((n) => !notificationIsRead(n));
    }
    return list;
  }, [notifications, readScope]);

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
        onFollowBack={async () => {}}
        followBackLoadingId={null}
      />
    ),
    [followingIds, handlePress]
  );

  const listEmpty =
    !loading && filtered.length === 0 ? (
      <View style={styles.emptyBlock}>
        <Text style={styles.emptyTitle}>No schedule alerts yet</Text>
        <Text style={styles.emptySubtitle}>
          Trip reminders, pairing updates, and trade activity tied to your line will appear here — same as Notifications,
          filtered for schedule.
        </Text>
        <Pressable style={styles.linkBtn} onPress={() => router.push('/notifications')}>
          <Text style={styles.linkBtnText}>Open all notifications</Text>
        </Pressable>
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={styles.subBar}>
        <Text style={styles.subBarText}>Schedule alerts mirror your notification inbox — schedule-related only.</Text>
      </View>
      <View style={styles.filterRow}>
        <Pressable onPress={() => setReadScope('all')} hitSlop={8} style={styles.seg}>
          <Text style={[styles.segLabel, readScope === 'all' && styles.segActive]}>All</Text>
          {readScope === 'all' ? <View style={styles.underline} /> : <View style={styles.underlinePh} />}
        </Pressable>
        <Pressable onPress={() => setReadScope('unread')} hitSlop={8} style={styles.seg}>
          <Text style={[styles.segLabel, readScope === 'unread' && styles.segActive]}>Unread</Text>
          {readScope === 'unread' ? <View style={styles.underline} /> : <View style={styles.underlinePh} />}
        </Pressable>
        <Pressable onPress={() => void handleMarkAllRead()} style={styles.markAll}>
          <Text style={styles.markAllText}>Mark all read</Text>
        </Pressable>
      </View>
      {loading && !notifications.length ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.headerRed} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) =>
            section.data.length ? (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
            ) : null
          }
          SectionSeparatorComponent={() => <View style={styles.sep} />}
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
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={loading && notifications.length > 0 ? <ActivityIndicator style={{ margin: 16 }} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  subBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: T.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },
  subBarText: { fontSize: 12, color: T.textSecondary, lineHeight: 16 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  seg: { marginRight: 22, paddingBottom: 2, minWidth: 44, alignItems: 'center' },
  segLabel: { fontSize: 15, fontWeight: '500', color: '#6B7280', paddingBottom: 4 },
  segActive: { fontWeight: '800', color: '#111827' },
  underline: { height: 2, minWidth: 36, backgroundColor: colors.headerRed, borderRadius: 1 },
  underlinePh: { height: 2, minWidth: 36, opacity: 0 },
  markAll: { marginLeft: 'auto', paddingVertical: 4 },
  markAllText: { fontSize: 14, fontWeight: '600', color: '#111827' },
  sectionHeader: {
    backgroundColor: '#F0F2F5',
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4E6EB',
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#050505' },
  sep: { height: 1, backgroundColor: '#E5E5E5' },
  listContent: { paddingBottom: 28, flexGrow: 1 },
  loadingWrap: { paddingTop: 48, alignItems: 'center' },
  emptyBlock: { paddingTop: 40, paddingHorizontal: spacing.lg, alignItems: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  linkBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 14 },
  linkBtnText: { color: T.accent, fontWeight: '800', fontSize: 15 },
});
