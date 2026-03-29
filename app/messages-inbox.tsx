import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addArchivedConversationId,
  addDeletedConversationId,
  getMergedHiddenConversationIds,
} from '../lib/dmInboxLocal';
import { notifyDmUnreadBadgeRefresh } from '../lib/dmUnreadBadgeStore';
import { getUnreadCounts } from '../lib/home';
import FlightClubHeader from '../src/components/FlightClubHeader';
import { useAuth } from '../src/hooks/useAuth';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../src/styles/refreshControl';
import {
  fetchInbox,
  fetchMessageRequestsInbox,
  markDmConversationReadForViewer,
  markDmConversationUnreadForViewer,
} from '../src/lib/supabase/dms';

function lastMessageSnippet(lastMsg: any): string {
  if (!lastMsg) return 'No messages yet.';
  const body = typeof lastMsg.body === 'string' ? lastMsg.body.trim() : '';
  if (body) return lastMsg.body;
  const t = lastMsg.message_type;
  if (t === 'image' || t === 'photo') return 'Photo';
  if (t === 'video') return 'Video';
  if (t === 'post_share') return 'Shared a post';
  return 'Message';
}

export default function MessagesInboxScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState({ notifications: 0, messages: 0 });
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreItem, setMoreItem] = useState<any | null>(null);
  const router = useRouter();
  const swipeMap = useRef<Map<string, Swipeable | null>>(new Map());

  const loadInbox = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let inbox: any[] = [];
    let pending: any[] = [];
    try {
      try {
        inbox = await fetchInbox(userId);
      } catch (e) {
        console.warn('[DM] loadInbox fetchInbox failed:', e);
      }
      try {
        pending = await fetchMessageRequestsInbox(userId);
      } catch (e) {
        console.warn('[DM] loadInbox fetchMessageRequestsInbox failed:', e);
      }
      const hidden = await getMergedHiddenConversationIds(userId);
      setConversations(inbox.filter((c) => !hidden.has(c.id)));
      setRequests(pending);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setLoading(false);
        return;
      }
      void loadInbox();
      void getUnreadCounts(userId)
        .then((counts) => setUnread(counts))
        .catch(() => setUnread({ notifications: 0, messages: 0 }));
      notifyDmUnreadBadgeRefresh();
    }, [userId, loadInbox])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadInbox();
      if (userId) {
        void getUnreadCounts(userId)
          .then((c) => setUnread(c))
          .catch(() => setUnread({ notifications: 0, messages: 0 }));
        notifyDmUnreadBadgeRefresh();
      }
    } finally {
      setRefreshing(false);
    }
  }, [loadInbox, userId]);

  const openMore = useCallback((item: any) => {
    swipeMap.current.get(item.id)?.close();
    setMoreItem(item);
    setMoreOpen(true);
  }, []);

  const patchConversationLastRead = useCallback((conversationId: string, isRead: boolean) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== conversationId || !c.last_message) return c;
        if (c.last_message.sender_id === userId) return c;
        return { ...c, last_message: { ...c.last_message, is_read: isRead } };
      })
    );
  }, [userId]);

  const handleMarkRead = useCallback(
    async (item: any) => {
      if (!userId) return;
      swipeMap.current.get(item.id)?.close();
      const { error } = await markDmConversationReadForViewer(String(item.id), userId);
      if (error) {
        Alert.alert('Could not mark read', error);
        return;
      }
      patchConversationLastRead(String(item.id), true);
      void getUnreadCounts(userId).then(setUnread).catch(() => {});
      notifyDmUnreadBadgeRefresh();
    },
    [userId, patchConversationLastRead]
  );

  const handleMarkUnread = useCallback(
    async (item: any) => {
      if (!userId) return;
      swipeMap.current.get(item.id)?.close();
      const { error } = await markDmConversationUnreadForViewer(String(item.id), userId);
      if (error) {
        Alert.alert('Could not mark unread', error);
        return;
      }
      patchConversationLastRead(String(item.id), false);
      void getUnreadCounts(userId).then(setUnread).catch(() => {});
      notifyDmUnreadBadgeRefresh();
    },
    [userId, patchConversationLastRead]
  );

  const handleArchiveLocal = useCallback(
    async (item: any) => {
      if (!userId) return;
      swipeMap.current.get(item.id)?.close();
      await addArchivedConversationId(userId, String(item.id));
      setConversations((prev) => prev.filter((c) => c.id !== item.id));
      setMoreOpen(false);
      setMoreItem(null);
    },
    [userId]
  );

  const handleDeleteLocal = useCallback(
    (item: any) => {
      if (!userId) return;
      Alert.alert(
        'Remove from inbox?',
        'This removes the conversation from your inbox on this device only. It does not delete messages on the server or notify the other person.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              swipeMap.current.get(item.id)?.close();
              await addDeletedConversationId(userId, String(item.id));
              setConversations((prev) => prev.filter((c) => c.id !== item.id));
              setMoreOpen(false);
              setMoreItem(null);
            },
          },
        ]
      );
    },
    [userId]
  );

  const renderItem = ({ item }: { item: any }) => {
    const other = item.participants.find((p: any) => p.user_id !== userId);
    const lastMsg = item.last_message;
    const isUnread = lastMsg && lastMsg.sender_id !== userId && !lastMsg.is_read;

    const rowInner = (
      <Pressable
        style={styles.row}
        onPress={() => router.push({ pathname: '/dm-thread', params: { conversationId: String(item.id) } })}
        onLongPress={() => openMore(item)}
        delayLongPress={380}
      >
        <Pressable
          style={styles.avatarWrap}
          onPress={() => other?.user_id && router.push(`/profile/${other.user_id}`)}
        >
          {other?.profile?.avatar_url ? (
            <Image source={{ uri: other.profile.avatar_url }} style={styles.avatarImg} />
          ) : (
            <Ionicons name="person-circle" size={44} color="#cbd5e1" />
          )}
        </Pressable>
        <View style={styles.info}>
          <Text style={styles.name}>{other?.profile?.display_name || 'User'}</Text>
          <Text style={styles.snippet} numberOfLines={1}>
            {lastMessageSnippet(lastMsg)}
          </Text>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
        <Ionicons name="chevron-forward" size={20} color="#64748b" />
      </Pressable>
    );

    const renderRightActions = () => (
      <View style={styles.swipeActions}>
        <Pressable
          style={[styles.swipeBtn, styles.swipeReadBtn]}
          onPress={() => (isUnread ? handleMarkRead(item) : handleMarkUnread(item))}
        >
          <Text style={styles.swipeBtnText}>{isUnread ? 'Read' : 'Unread'}</Text>
        </Pressable>
        <Pressable style={[styles.swipeBtn, styles.swipeArchiveBtn]} onPress={() => void handleArchiveLocal(item)}>
          <Text style={styles.swipeBtnText}>Archive</Text>
        </Pressable>
        <Pressable style={[styles.swipeBtn, styles.swipeMoreBtn]} onPress={() => openMore(item)}>
          <Text style={styles.swipeBtnText}>More</Text>
        </Pressable>
      </View>
    );

    return (
      <Swipeable
        ref={(r) => {
          swipeMap.current.set(item.id, r);
        }}
        renderRightActions={renderRightActions}
        overshootRight={false}
      >
        {rowInner}
      </Swipeable>
    );
  };

  const moreOther = moreItem?.participants?.find((p: any) => p.user_id !== userId);
  const moreLast = moreItem?.last_message;
  const moreIsUnread = moreLast && moreLast.sender_id !== userId && !moreLast.is_read;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['left', 'right', 'bottom']}>
      <FlightClubHeader
        title="Messages"
        bellCount={unread.notifications}
        dmCount={unread.messages}
        onPressBell={() => router.push('/notifications')}
        onPressMessage={() => {
          void loadInbox();
          if (userId) {
            void getUnreadCounts(userId)
              .then((c) => setUnread(c))
              .catch(() => setUnread({ notifications: 0, messages: 0 }));
            notifyDmUnreadBadgeRefresh();
          }
        }}
        onPressMenu={() => router.push('/menu')}
      />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="#64748b" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Filter inbox…"
              placeholderTextColor="#94a3b8"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable style={styles.composeBtn} onPress={() => router.push('/new-message')}>
              <Ionicons name="create-outline" size={20} color="#fff" />
            </Pressable>
          </View>
          {loading ? (
            <Text style={styles.loading}>Loading…</Text>
          ) : conversations.length === 0 && requests.length === 0 ? (
            <Text style={styles.empty}>No conversations yet.</Text>
          ) : (
            <FlatList
              data={conversations.filter((c) => {
                const other = c.participants.find((p: any) => p.user_id !== userId);
                const name = (other?.profile?.display_name || '').toLowerCase();
                const q = search.toLowerCase();
                return !search || name.includes(q);
              })}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 24 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  colors={REFRESH_CONTROL_COLORS}
                  tintColor={REFRESH_TINT}
                />
              }
              ListHeaderComponent={
                requests.length > 0 ? (
                  <View style={styles.requestsBlock}>
                    <Text style={styles.requestsTitle}>Requests</Text>
                    {requests.map((item) => {
                      const other = item.participants.find((p: any) => p.user_id !== userId);
                      const lastMsg = item.last_message;
                      const openThread = () => {
                        const params: Record<string, string> = { conversationId: String(item.id) };
                        if (item.request_id) params.requestId = String(item.request_id);
                        router.push({ pathname: '/dm-thread', params });
                      };
                      return (
                        <View key={item.id} style={styles.requestRow}>
                          <Pressable
                            style={styles.requestRowMain}
                            onPress={openThread}
                            accessibilityRole="button"
                            accessibilityLabel="Open message request"
                          >
                            <View style={styles.avatarWrap}>
                              {other?.profile?.avatar_url ? (
                                <Image source={{ uri: other.profile.avatar_url }} style={styles.avatarImg} />
                              ) : (
                                <Ionicons name="person-circle" size={44} color="#cbd5e1" />
                              )}
                            </View>
                            <View style={styles.info}>
                              <Text style={styles.name}>{other?.profile?.display_name || 'User'}</Text>
                              <Text style={styles.snippet} numberOfLines={1}>
                                {lastMsg ? lastMessageSnippet(lastMsg) : 'Message request'}
                              </Text>
                            </View>
                          </Pressable>
                          <Pressable style={styles.requestIndicator} onPress={openThread} accessibilityRole="button">
                            <View style={styles.requestIndicatorDot} />
                            <Text style={styles.requestIndicatorText}>Request</Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </GestureHandlerRootView>

      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setMoreOpen(false)} accessibilityLabel="Close menu" />
          <View style={styles.sheetPanel}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Conversation</Text>
            <Text style={styles.sheetSubtitle} numberOfLines={1}>
              {moreOther?.profile?.display_name || 'Direct message'}
            </Text>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                if (!moreItem || !userId) return;
                void (moreIsUnread ? handleMarkRead(moreItem) : handleMarkUnread(moreItem));
                setMoreOpen(false);
                setMoreItem(null);
              }}
            >
              <Ionicons name={moreIsUnread ? 'mail-open-outline' : 'mail-unread-outline'} size={22} color="#0f172a" />
              <Text style={styles.sheetRowText}>{moreIsUnread ? 'Mark as read' : 'Mark as unread'}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                Alert.alert(
                  'Mute',
                  'Muting a conversation needs server-side inbox settings. This is not available yet.',
                  [{ text: 'OK' }]
                );
              }}
            >
              <Ionicons name="volume-mute-outline" size={22} color="#0f172a" />
              <Text style={styles.sheetRowText}>Mute conversation</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                if (!moreItem) return;
                void handleArchiveLocal(moreItem);
              }}
            >
              <Ionicons name="archive-outline" size={22} color="#0f172a" />
              <Text style={styles.sheetRowText}>Archive (this device)</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={() => moreItem && handleDeleteLocal(moreItem)}>
              <Ionicons name="trash-outline" size={22} color="#b91c1c" />
              <Text style={[styles.sheetRowText, { color: '#b91c1c' }]}>Delete from inbox…</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                Alert.alert('Block user', 'Blocking is not available in the app yet.', [{ text: 'OK' }]);
              }}
            >
              <Ionicons name="ban-outline" size={22} color="#b91c1c" />
              <Text style={[styles.sheetRowText, { color: '#b91c1c' }]}>Block user</Text>
            </Pressable>
            <Pressable
              style={[styles.sheetRow, styles.sheetCancel]}
              onPress={() => {
                setMoreOpen(false);
                setMoreItem(null);
              }}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: 8 },
  composeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#B5161E',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginLeft: 8,
  },
  loading: { textAlign: 'center', marginTop: 40, color: '#64748b' },
  empty: { textAlign: 'center', marginTop: 40, color: '#64748b' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  swipeActions: { flexDirection: 'row', alignItems: 'stretch' },
  swipeBtn: { justifyContent: 'center', alignItems: 'center', width: 76, paddingVertical: 12 },
  swipeReadBtn: { backgroundColor: '#2563eb' },
  swipeArchiveBtn: { backgroundColor: '#64748b' },
  swipeMoreBtn: { backgroundColor: '#B5161E' },
  swipeBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  requestRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    paddingVertical: 14,
    paddingLeft: 20,
  },
  avatarWrap: { marginRight: 14 },
  avatarImg: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e2e8f0' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563EB', marginRight: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 0 },
  info: { flex: 1 },
  name: { fontWeight: '800', fontSize: 16, color: '#0f172a' },
  snippet: { color: '#64748b', fontSize: 13, marginTop: 2 },
  requestsBlock: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  requestsTitle: { fontSize: 14, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  requestRow: {
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  requestIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    paddingVertical: 8,
  },
  requestIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
    marginRight: 8,
  },
  requestIndicatorText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheetPanel: {
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 28,
    paddingHorizontal: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginTop: 10,
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: '#B5161E', textAlign: 'center' },
  sheetSubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 12 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  sheetRowText: { fontSize: 16, fontWeight: '600', color: '#0f172a', flex: 1 },
  sheetCancel: { borderBottomWidth: 0, marginTop: 4, justifyContent: 'center' },
  sheetCancelText: { fontSize: 16, fontWeight: '800', color: '#64748b', textAlign: 'center', flex: 1 },
});
