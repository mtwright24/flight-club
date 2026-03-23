import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUnreadCounts } from '../lib/home';
import FlightClubHeader from '../src/components/FlightClubHeader';
import { useAuth } from '../src/hooks/useAuth';
import { fetchInbox, fetchMessageRequestsInbox } from '../src/lib/supabase/dms';
import { supabase } from '../src/lib/supabaseClient';

function lastMessageSnippet(lastMsg: any): string {
  if (!lastMsg) return 'No messages yet.';
  const body = typeof lastMsg.body === 'string' ? lastMsg.body.trim() : '';
  if (body) return lastMsg.body;
  const t = lastMsg.message_type;
  if (t === 'image') return 'Photo';
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
  const router = useRouter();

  const loadInbox = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [inbox, pending] = await Promise.all([
        fetchInbox(userId),
        fetchMessageRequestsInbox(userId),
      ]);
      setConversations(inbox);
      setRequests(pending);
    } catch (e) {
      setConversations([]);
      setRequests([]);
    }
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void loadInbox();
      void getUnreadCounts(userId)
        .then((counts) => setUnread(counts))
        .catch(() => setUnread({ notifications: 0, messages: 0 }));
    }, [userId, loadInbox])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadInbox();
    } finally {
      setRefreshing(false);
    }
  }, [loadInbox]);

  const renderItem = ({ item }: { item: any }) => {
    // Find the other user in the conversation
    const other = item.participants.find((p: any) => p.user_id !== userId);
    const lastMsg = item.last_message;
    const isUnread = lastMsg && lastMsg.sender_id !== userId && !lastMsg.is_read;
    return (
      <Pressable
        style={styles.row}
        onPress={() => router.push({ pathname: '/dm-thread', params: { conversationId: String(item.id) } })}
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
          <Pressable
            onPress={() => other?.user_id && router.push(`/profile/${other.user_id}`)}
          >
            <Text style={styles.name}>{other?.profile?.display_name || 'User'}</Text>
          </Pressable>
          <Text style={styles.snippet} numberOfLines={1}>{lastMessageSnippet(lastMsg)}</Text>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
        <Ionicons name="chevron-forward" size={20} color="#64748b" />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#B5161E' }} edges={['left', 'right', 'top']}>
      <FlightClubHeader
        title="Messages"
        bellCount={unread.notifications}
        dmCount={unread.messages}
        onPressBell={() => router.push('/notifications')}
        onPressMessage={() => router.push('/new-message')}
        onPressMenu={() => router.push('/menu')}
      />
      <View style={styles.container}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color="#64748b" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search messages…"
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
            onFocus={() => router.push('/new-message')}
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
            data={conversations.filter(c => {
              const other = c.participants.find((p: any) => p.user_id !== userId);
              return !search || (other?.profile?.display_name || '').toLowerCase().includes(search.toLowerCase());
            })}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            ListHeaderComponent={
              requests.length > 0 ? (
                <View style={styles.requestsBlock}>
                  <Text style={styles.requestsTitle}>Requests</Text>
                  {requests.map((item) => {
                    const other = item.participants.find((p: any) => p.user_id !== userId);
                    const lastMsg = item.last_message;
                    return (
                      <View key={item.id} style={styles.requestRow}>
                        <View style={styles.row}>
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
                              {lastMsg ? lastMessageSnippet(lastMsg) : 'Message request'}
                            </Text>
                          </View>
                          <View style={styles.requestActions}>
                            <Pressable
                              style={styles.requestAccept}
                              onPress={async () => {
                                try {
                                  await supabase
                                    .from('dm_message_requests')
                                    .update({ status: 'accepted' })
                                    .eq('conversation_id', item.id)
                                    .eq('to_user_id', userId);
                                  await handleRefresh();
                                } catch {}
                              }}
                            >
                              <Text style={styles.requestAcceptText}>Accept</Text>
                            </Pressable>
                            <Pressable
                              style={styles.requestDecline}
                              onPress={async () => {
                                try {
                                  await supabase
                                    .from('dm_message_requests')
                                    .update({ status: 'declined' })
                                    .eq('conversation_id', item.id)
                                    .eq('to_user_id', userId);
                                  await handleRefresh();
                                } catch {}
                              }}
                            >
                              <Text style={styles.requestDeclineText}>Decline</Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: 8 },
  composeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#B5161E', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, marginLeft: 8 },
  composeText: { color: '#fff', fontWeight: '700', marginLeft: 4 },
  loading: { textAlign: 'center', marginTop: 40, color: '#64748b' },
  empty: { textAlign: 'center', marginTop: 40, color: '#64748b' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  avatarWrap: { marginRight: 14 },
  avatarImg: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e2e8f0' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563EB', marginRight: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 12, marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 6 },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 0 },
  info: { flex: 1 },
  name: { fontWeight: '800', fontSize: 16, color: '#0f172a' },
  snippet: { color: '#64748b', fontSize: 13, marginTop: 2 },
  requestsBlock: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  requestsTitle: { fontSize: 14, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  requestRow: { marginBottom: 4 },
  requestActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  requestAccept: { backgroundColor: '#16a34a', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 },
  requestAcceptText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  requestDecline: { backgroundColor: '#e5e7eb', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  requestDeclineText: { color: '#0f172a', fontSize: 12, fontWeight: '600' },
});
