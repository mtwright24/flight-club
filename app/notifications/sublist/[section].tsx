import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NotificationRow from '../../../components/notifications/NotificationRow';
import { followUser, getFollowedUserIds } from '../../../lib/feed';
import {
  fetchNotificationsForTopBlockSection,
  markNotificationsRead,
  markTopBlockSectionNotificationsRead,
  Notification,
  notificationTargetHref,
  parseNotificationData,
} from '../../../lib/notifications';
import {
  isTopBlockSection,
  topBlockSectionEmptyMessage,
  topBlockSectionTitle,
  type TopBlockSection,
} from '../../../lib/notificationTopBlocks';
import { formatNotificationTimeShort, notificationIsRead } from '../../../lib/notificationInboxUi';
import { notifyNotificationsBadgeRefresh } from '../../../lib/notificationsBadgeStore';
import { useAuth } from '../../../src/hooks/useAuth';
import {
  acceptDmMessageRequest,
  declineDmMessageRequest,
  fetchMessageRequestsInbox,
} from '../../../src/lib/supabase/dms';
import { colors, radius, spacing } from '../../../src/styles/theme';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../../src/styles/refreshControl';

function lastMessageSnippet(lastMsg: { body?: string; message_type?: string } | null | undefined): string {
  if (!lastMsg) return 'Message request';
  const body = typeof lastMsg.body === 'string' ? lastMsg.body.trim() : '';
  if (body) return lastMsg.body as string;
  const t = lastMsg.message_type;
  if (t === 'image' || t === 'photo') return 'Photo';
  if (t === 'video') return 'Video';
  if (t === 'post_share') return 'Shared a post';
  return 'Message';
}

type RequestInboxRow = Awaited<ReturnType<typeof fetchMessageRequestsInbox>>[number];

export default function NotificationSublistScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const raw = useLocalSearchParams<{ section?: string | string[] }>().section;
  const sectionParam = Array.isArray(raw) ? raw[0] : raw;
  const valid = isTopBlockSection(sectionParam);
  const section = (sectionParam || '') as TopBlockSection;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<RequestInboxRow[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(() => new Set());
  const [followBackLoadingId, setFollowBackLoadingId] = useState<string | null>(null);
  const [requestActionBusy, setRequestActionBusy] = useState<string | null>(null);
  const [acceptAllBusy, setAcceptAllBusy] = useState(false);

  useEffect(() => {
    if (!valid) router.replace('/notifications');
  }, [valid, router]);

  useEffect(() => {
    if (!userId) {
      setFollowingIds(new Set());
      return;
    }
    void (async () => {
      try {
        const ids = await getFollowedUserIds(userId);
        setFollowingIds(new Set(ids));
      } catch {
        setFollowingIds(new Set());
      }
    })();
  }, [userId]);

  const load = useCallback(
    async (isPullRefresh = false) => {
      if (!userId || !valid) {
        setLoading(false);
        return;
      }
      if (!isPullRefresh) setLoading(true);
      try {
        if (section === 'message-requests') {
          const rows = await fetchMessageRequestsInbox(userId);
          setRequests(rows);
          setNotifications([]);
        } else {
          const rows = await fetchNotificationsForTopBlockSection(section);
          setNotifications(rows);
          setRequests([]);
        }
      } catch (e) {
        console.warn('[NotificationSublist] load failed:', e);
      } finally {
        if (!isPullRefresh) setLoading(false);
      }
    },
    [userId, valid, section]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const handleMarkSectionRead = async () => {
    if (section === 'message-requests') return;
    try {
      await markTopBlockSectionNotificationsRead(section);
      notifyNotificationsBadgeRefresh();
      await load(false);
    } catch (e) {
      console.warn('[NotificationSublist] mark section read failed:', e);
      Alert.alert('Could not update', 'Try again in a moment.');
    }
  };

  const openDmRequest = useCallback(
    (row: RequestInboxRow) => {
      const params: Record<string, string> = { conversationId: String(row.id) };
      if (row.request_id) params.requestId = String(row.request_id);
      router.push({ pathname: '/dm-thread', params });
    },
    [router]
  );

  const handleAcceptRequest = useCallback(
    async (row: RequestInboxRow) => {
      if (!userId) return;
      const key = row.request_id || row.id;
      setRequestActionBusy(key);
      try {
        const { error } = await acceptDmMessageRequest(row.id, userId, row.request_id);
        if (error) {
          Alert.alert('Could not accept', error);
          return;
        }
        notifyNotificationsBadgeRefresh();
        await load(true);
      } finally {
        setRequestActionBusy(null);
      }
    },
    [userId, load]
  );

  const handleDeclineRequest = useCallback(
    async (row: RequestInboxRow) => {
      if (!userId) return;
      const key = row.request_id || row.id;
      setRequestActionBusy(key);
      try {
        const { error } = await declineDmMessageRequest(row.id, userId, row.request_id);
        if (error) {
          Alert.alert('Could not delete', error);
          return;
        }
        notifyNotificationsBadgeRefresh();
        await load(true);
      } finally {
        setRequestActionBusy(null);
      }
    },
    [userId, load]
  );

  const handleAcceptAllRequests = useCallback(async () => {
    if (!userId || !requests.length) return;
    setAcceptAllBusy(true);
    try {
      for (const r of requests) {
        const { error } = await acceptDmMessageRequest(r.id, userId, r.request_id);
        if (error) {
          Alert.alert('Could not accept all', error);
          await load(true);
          return;
        }
      }
      notifyNotificationsBadgeRefresh();
      await load(true);
    } finally {
      setAcceptAllBusy(false);
    }
  }, [userId, requests, load]);

  const handleNotificationOpen = useCallback(
    async (notification: Notification) => {
      const alreadyRead = notificationIsRead(notification);
      if (!alreadyRead) {
        try {
          await markNotificationsRead([notification.id]);
        } catch (e) {
          console.warn('[NotificationSublist] mark read failed:', e);
          Alert.alert('Could not update', 'Try again in a moment.');
          return;
        }
        setNotifications((prev) =>
          prev.map((x) => (x.id === notification.id ? { ...x, is_read: true, read: true } : x))
        );
        notifyNotificationsBadgeRefresh();
      }

      const d = parseNotificationData(notification);
      const rid =
        typeof d.request_id === 'string'
          ? d.request_id.trim()
          : typeof d.dm_request_id === 'string'
            ? d.dm_request_id.trim()
            : '';
      const convoId =
        notification.entity_type === 'conversation' && notification.entity_id
          ? String(notification.entity_id).trim()
          : '';

      if ((notification.type === 'message_request' || notification.type === 'message') && convoId && rid) {
        try {
          router.push({
            pathname: '/dm-thread',
            params: { conversationId: convoId, requestId: rid },
          });
          return;
        } catch (e) {
          console.warn('[NotificationSublist] navigate dm failed:', e);
        }
      }

      const href = notificationTargetHref(notification);
      try {
        router.push(href);
      } catch (e) {
        console.warn('[NotificationSublist] navigate failed:', e);
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

  if (!valid) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerIconBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.cardBg} />
          </Pressable>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.headerRightSpacer} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.headerRed} />
        </View>
      </SafeAreaView>
    );
  }

  const title = topBlockSectionTitle(section);
  const emptyText = topBlockSectionEmptyMessage(section);

  const messageRequestsListHeader =
    section === 'message-requests' ? (
      <View style={styles.mrIntro}>
        <Text style={styles.mrIntroTitle}>Message Requests</Text>
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            If you accept a message request, they will be able to see your Activity Status and know when
            you&apos;ve seen their message.
          </Text>
        </View>
      </View>
    ) : null;

  const renderRequestRow = ({ item }: { item: RequestInboxRow }) => {
    const other = item.participants.find((p: { user_id: string }) => p.user_id !== userId);
    const name = other?.profile?.display_name || 'User';
    const avatarUrl = other?.profile?.avatar_url;
    const time = formatNotificationTimeShort(item.last_message?.created_at || item.updated_at || item.created_at);
    const busyKey = item.request_id || item.id;
    const busy = requestActionBusy === busyKey;

    return (
      <View style={styles.requestRowWrap}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => openDmRequest(item)}
          accessibilityRole="button"
          accessibilityLabel={`Open message request from ${name}`}
        >
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Ionicons name="person-circle" size={44} color="#cbd5e1" />
            )}
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {lastMessageSnippet(item.last_message)}
            </Text>
          </View>
          <View style={styles.rowMeta}>
            <Text style={styles.rowTime}>{time}</Text>
            <View style={styles.unreadDot} />
          </View>
        </Pressable>
        <View style={styles.rowActions}>
          <Pressable
            style={[styles.acceptBtn, (busy || acceptAllBusy) && styles.actionDisabled]}
            disabled={busy || acceptAllBusy}
            onPress={() => void handleAcceptRequest(item)}
          >
            <Text style={styles.acceptBtnText}>Accept</Text>
          </Pressable>
          <Pressable
            style={[styles.deleteBtn, (busy || acceptAllBusy) && styles.actionDisabled]}
            disabled={busy || acceptAllBusy}
            onPress={() => void handleDeclineRequest(item)}
          >
            <Text style={styles.deleteBtnText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderNotificationRow = ({ item }: { item: Notification }) => (
    <NotificationRow
      item={item}
      followingIds={followingIds}
      onOpen={handleNotificationOpen}
      onFollowBack={handleFollowBack}
      followBackLoadingId={followBackLoadingId}
    />
  );

  const showMarkSection =
    section === 'crew-invites' || section === 'trade-matches' || section === 'housing-alerts';

  const listEmpty =
    !loading &&
    (section === 'message-requests' ? requests.length === 0 : notifications.length === 0);

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
            ? { adjustsFontSizeToMinimumFontScale: true, minimumFontScale: 0.8 }
            : {})}
        >
          {title}
        </Text>
        {section === 'message-requests' ? (
          <Pressable onPress={() => router.push('/messages-inbox')} style={styles.headerManageBtn} hitSlop={8}>
            <Text style={styles.headerManageText}>Manage</Text>
          </Pressable>
        ) : showMarkSection ? (
          <Pressable onPress={handleMarkSectionRead} style={styles.headerMarkReadBtn} hitSlop={8}>
            <Text style={styles.headerMarkReadText}>Mark all read</Text>
          </Pressable>
        ) : (
          <View style={styles.headerRightSpacer} />
        )}
      </View>

      <View style={styles.body}>
        {loading && section === 'message-requests' && !requests.length ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.headerRed} />
          </View>
        ) : loading && section !== 'message-requests' && !notifications.length ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.headerRed} />
          </View>
        ) : section === 'message-requests' ? (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            renderItem={renderRequestRow}
            ListHeaderComponent={messageRequestsListHeader}
            ListFooterComponent={
              requests.length > 0 ? (
                <Pressable
                  style={[styles.acceptAllBtn, acceptAllBusy && styles.actionDisabled]}
                  disabled={acceptAllBusy}
                  onPress={() => void handleAcceptAllRequests()}
                >
                  <Text style={styles.acceptAllBtnText}>ACCEPT ALL</Text>
                </Pressable>
              ) : null
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={REFRESH_CONTROL_COLORS}
                tintColor={REFRESH_TINT}
              />
            }
            contentContainerStyle={listEmpty ? styles.listEmptyGrow : styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separatorFull} />}
            ListEmptyComponent={
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyText}>{emptyText}</Text>
              </View>
            }
          />
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item, i) => (item.id ? String(item.id) : `n-${i}`)}
            renderItem={renderNotificationRow}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={REFRESH_CONTROL_COLORS}
                tintColor={REFRESH_TINT}
              />
            }
            contentContainerStyle={listEmpty ? styles.listEmptyGrow : styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyText}>{emptyText}</Text>
              </View>
            }
          />
        )}
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
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    paddingHorizontal: 4,
  },
  headerRightSpacer: {
    width: 44,
    height: 44,
  },
  headerManageBtn: {
    minWidth: 64,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  headerManageText: {
    color: colors.cardBg,
    fontSize: 15,
    fontWeight: '600',
  },
  headerMarkReadBtn: {
    maxWidth: 96,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  headerMarkReadText: {
    color: colors.cardBg,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    lineHeight: 15,
  },
  body: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  listContent: {
    paddingBottom: 32,
  },
  listEmptyGrow: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  mrIntro: {
    paddingHorizontal: spacing.md,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  mrIntroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  infoBanner: {
    backgroundColor: '#EEF2F6',
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  infoBannerText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  requestRowWrap: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: spacing.md,
    backgroundColor: '#FFFFFF',
  },
  rowPressed: {
    opacity: 0.92,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: 4,
  },
  acceptBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: colors.accentBlue,
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteBtn: {
    marginLeft: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: '#FEE2E2',
  },
  deleteBtnText: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '700',
  },
  actionDisabled: {
    opacity: 0.55,
  },
  acceptAllBtn: {
    marginHorizontal: spacing.md,
    marginTop: 16,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
  },
  acceptAllBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    marginRight: 12,
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  rowSubtitle: {
    marginTop: 3,
    fontSize: 14,
    color: '#6B7280',
  },
  rowMeta: {
    alignItems: 'flex-end',
  },
  rowTime: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.headerRed,
    marginTop: 6,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5E5',
    marginLeft: spacing.md + 44 + 12,
  },
  separatorFull: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5E5',
  },
  emptyBlock: {
    paddingTop: 48,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
