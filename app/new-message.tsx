import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../src/components/FlightClubHeader';
import { useAuth } from '../src/hooks/useAuth';
import { usePullToRefresh } from '../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../src/styles/refreshControl';
import { searchPeople } from '../lib/search';
import { sendMessage, startDirectConversation } from '../src/lib/supabase/dms';

export default function NewMessageScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<
    { id: string; display_name: string; username: string | null; avatar_url: string | null }[]
  >([]);
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);
  const searchRef = useRef('');
  searchRef.current = search;
  const router = useRouter();
  const navigation = useNavigation();
  const sharePostParam = useLocalSearchParams<{ sharePostId?: string | string[] }>().sharePostId;
  const sharePostId = useMemo(() => {
    if (typeof sharePostParam === 'string') return sharePostParam.trim();
    if (Array.isArray(sharePostParam) && sharePostParam[0]) return String(sharePostParam[0]).trim();
    return '';
  }, [sharePostParam]);

  const handleSearch = useCallback(async (text: string) => {
    setSearch(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const found = await searchPeople(text, 40);
      const people = found
        .filter((r) => r.type === 'person' && r.id && r.id !== userId)
        .map((r) => {
          const handleFromSubtitle =
            r.subtitle && r.subtitle.startsWith('@')
              ? r.subtitle.slice(1).split(/\s/)[0] ?? null
              : null;
          return {
            id: r.id,
            display_name: r.title || 'Crew member',
            username: handleFromSubtitle,
            avatar_url: r.avatarUrl ?? null,
          };
        });
      setResults(people);
    } catch (e) {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [userId]);

  const { refreshing: newMsgRefreshing, onRefresh: onNewMsgRefresh } = usePullToRefresh(async () => {
    const q = searchRef.current.trim();
    if (q) await handleSearch(q);
  });

  const openThread = (convId: string) => {
    router.push({ pathname: '/dm-thread', params: { conversationId: convId } });
  };

  const handleSelect = async (targetUser: { id: string }) => {
    if (!userId || openingUserId) return;
    const tid = targetUser?.id as string | undefined;
    if (!tid) return;
    setOpeningUserId(tid);
    try {
      const { conversationId } = await startDirectConversation(userId, tid);
      const convId = String(conversationId);

      if (sharePostId) {
        try {
          await sendMessage(convId, userId, '', { messageType: 'post_share', postId: sharePostId });
        } catch (shareErr) {
          console.warn('[DM] share post to thread failed:', shareErr);
          Alert.alert(
            'Could not attach post',
            'The conversation was opened but the shared post could not be sent. You can try sharing again from the post.',
          );
        }
      }
      openThread(convId);
    } catch (e: any) {
      Alert.alert('Unable to start message', e?.message || 'Please try again.');
    } finally {
      setOpeningUserId(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['left', 'right', 'bottom']}>
      <FlightClubHeader
        title="New Message"
        showLogo={false}
        bellCount={0}
        dmCount={0}
        onPressBell={() => router.push('/notifications')}
        onPressMessage={() =>
          navigation.canGoBack() ? navigation.goBack() : router.replace('/messages-inbox')
        }
        onPressMenu={() => router.push('/menu')}
      />
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color="#64748b" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search crew…"
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        {searching ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={results}
            keyExtractor={(item) => item.id}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={newMsgRefreshing}
                onRefresh={onNewMsgRefresh}
                colors={REFRESH_CONTROL_COLORS}
                tintColor={REFRESH_TINT}
              />
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.row, openingUserId === item.id && { opacity: 0.5 }]}
                disabled={!!openingUserId}
                onPress={() => handleSelect(item)}
              >
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <Ionicons name="person-circle" size={40} color="#cbd5e1" style={{ marginRight: 14 }} />
                )}
                <View>
                  <Text style={styles.name}>{item.display_name || 'Crew Member'}</Text>
                  {item.username ? (
                    <Text style={styles.username}>@{item.username}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              search.trim() ? <Text style={styles.empty}>No crew found.</Text> : <Text style={styles.empty}>Start typing to search.</Text>
            }
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 12, marginBottom: 8 },
  header: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 12, marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 6 },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 14, backgroundColor: '#e2e8f0' },
  name: { fontWeight: '800', fontSize: 16, color: '#0f172a' },
  username: { fontSize: 13, color: '#64748b', marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 40, color: '#64748b' },
});
