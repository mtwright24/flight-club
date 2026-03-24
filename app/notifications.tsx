import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  notificationPathToHref,
  Notification,
  resolveNotificationRoute,
} from '../lib/notifications';
import { useAuth } from '../src/hooks/useAuth';
import { supabase } from '../src/lib/supabaseClient';
import { colors, spacing } from '../src/styles/theme';

export default function NotificationsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<'all' | 'social' | 'messages' | 'housing' | 'crew' | 'system'>('all');

  const reloadFirstPage = async () => {
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
  };

  useEffect(() => {
    reloadFirstPage();
  }, [session?.user?.id]);

  // Optional: live updates via Supabase realtime when new notifications are inserted
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
        (payload: any) => {
          const n = payload.new as Notification;
          setNotifications((prev) => {
            // Avoid duplicates if we already loaded this page
            if (prev.find((x) => x.id === n.id)) return prev;
            return [n, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
      setNotifications(prev => [...prev, ...data]);
      setHasMore(data.length === 30);
      setPage(nextPage);
    } catch (e) {
      console.warn('[Notifications] onEndReached load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePress = async (notification: Notification) => {
    if (!notification.is_read) {
      await markNotificationsRead([notification.id]);
      setNotifications((prev) =>
        prev.map((x) => (x.id === notification.id ? { ...x, is_read: true } : x)),
      );
    }
    router.push(notificationPathToHref(resolveNotificationRoute(notification)));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    reloadFirstPage();
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <Pressable
      onPress={() => handlePress(item)}
      style={({ pressed }) => [
        styles.item,
        !item.is_read && styles.unread,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Image
        source={{ uri: item.actor?.avatar_url || 'https://i.pravatar.cc/100?u=' + (item.actor_id || 'anon') }}
        style={styles.avatar}
      />
      <View style={styles.textBlock}>
        <Text style={styles.message} numberOfLines={2}>
          {item.title || renderNotificationText(item)}
        </Text>
        {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
        <Text style={styles.time}>{formatTimeAgo(item.created_at)}</Text>
      </View>
      {item.data?.thumbnail ? (
        <Image source={{ uri: item.data.thumbnail }} style={styles.thumb} />
      ) : null}
      {!item.is_read && <View style={styles.dot} />}
    </Pressable>
  );

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === 'all') return true;
      const t = n.type;
      switch (filter) {
        case 'social':
          return [
            'follow',
            'follow_request',
            'follow_accept',
            'post_like',
            'like_post',
            'post_comment',
            'comment_post',
            'comment_reply',
            'mention_post',
            'mention_comment',
            'mention',
          ].includes(t);
        case 'messages':
          return ['message', 'message_request', 'dm_share_post', 'dm_share_media'].includes(t);
        case 'housing':
          return ['housing_reply', 'listing_reply', 'housing_message', 'saved_search_match', 'standby_match'].includes(t);
        case 'crew':
          return ['crew_room_reply', 'crew_room_mention', 'crew_room_invite', 'crew_invite', 'room_post'].includes(t);
        case 'system':
          return t === 'system_announcement';
        default:
          return true;
      }
    });
  }, [notifications, filter]);

  const sections = useMemo(() => {
    const newer = filtered.filter((n) => !n.is_read);
    const earlier = filtered.filter((n) => n.is_read);
    const out: { title: string; data: Notification[] }[] = [];
    if (newer.length) out.push({ title: 'New', data: newer });
    if (earlier.length) out.push({ title: 'Earlier', data: earlier });
    if (!out.length) out.push({ title: 'New', data: [] });
    return out;
  }, [filtered]);

  const renderSectionHeader = ({ section }: { section: { title: string; data: Notification[] } }) => {
    if (!section.data.length) return null;
    return (
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeaderText}>{section.title}</Text>
      </View>
    );
  };

  return (
	<SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.headerRed }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.cardBg} />
        </Pressable>
        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          ellipsizeMode="tail"
          {...(Platform.OS === 'ios'
            ? { adjustsFontSizeToMinimumFontScale: true, minimumFontScale: 0.82 }
            : {})}
        >
          Notifications
        </Text>
        <Pressable onPress={handleMarkAllRead} style={styles.headerBtn}>
          <Text style={styles.markAll} numberOfLines={1}>
            Mark all read
          </Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, backgroundColor: colors.screenBg }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          {['all','social','messages','housing','crew','system'].map((key) => (
            <Pressable
              key={key}
              onPress={() => setFilter(key as any)}
              style={[styles.chip, filter === key && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>
                {key === 'all' ? 'All' :
                 key === 'social' ? 'Social' :
                 key === 'messages' ? 'Messages' :
                 key === 'housing' ? 'Housing' :
                 key === 'crew' ? 'Crew Rooms' :
                 'System'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={{ marginTop: 40 }} />
            ) : (
              <Text style={{ textAlign: 'center', marginTop: 40, color: colors.textSecondary }}>
                No notifications yet.
              </Text>
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

function renderNotificationText(n: Notification) {
  switch (n.type) {
    case 'like_post':
      return `${n.actor?.display_name || 'Someone'} liked your post`;
    case 'comment_post':
      return `${n.actor?.display_name || 'Someone'} commented on your post`;
    case 'crew_room_reply':
      return `${n.actor?.display_name || 'Someone'} replied in your crew room`;
    case 'follow':
      return `${n.actor?.display_name || 'Someone'} followed you`;
    case 'crew_invite':
      return `${n.actor?.display_name || 'Someone'} invited you to a crew room`;
    case 'room_post':
      return `${n.actor?.display_name || 'Someone'} posted in your crew room`;
    case 'crew_room_mention':
      return `${n.actor?.display_name || 'Someone'} mentioned you in a crew room`;
    case 'crew_room_invite':
      return `${n.actor?.display_name || 'Someone'} invited you to join a crew room`;
    case 'mention':
      return `${n.actor?.display_name || 'Someone'} mentioned you`;
    default:
      return n.title || 'Notification';
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.headerRed,
    minHeight: 60,
    paddingVertical: 6,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    justifyContent: 'space-between',
  },
  headerBtn: { padding: 8, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 6,
    textAlign: 'center',
    color: colors.cardBg,
    fontSize: 18,
    fontWeight: '800',
  },
  markAll: { color: colors.cardBg, fontWeight: '700', fontSize: 13, flexShrink: 1, textAlign: 'right' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unread: { backgroundColor: '#FFF6F6' },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 14, backgroundColor: '#eee' },
  textBlock: { flex: 1 },
  message: { fontWeight: '700', color: colors.textPrimary, fontSize: 15 },
  body: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  time: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  thumb: { width: 44, height: 44, borderRadius: 8, marginLeft: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.dangerRed, marginLeft: 10 },
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.screenBg,
  },
  filterContent: {
    alignItems: 'center',
  },
  chip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    backgroundColor: colors.cardBg,
  },
  chipActive: {
    backgroundColor: '#FEE2E2',
    borderColor: colors.headerRed,
  },
  chipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.headerRed,
  },
  sectionHeaderRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
});

function formatTimeAgo(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `${diffWeek}w`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear}y`;
}
