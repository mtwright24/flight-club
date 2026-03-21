import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../src/components/FlightClubHeader';
import { useAuth } from '../src/hooks/useAuth';
import { startDirectConversation } from '../src/lib/supabase/dms';
import { supabase } from '../src/lib/supabaseClient';

export default function NewMessageScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const router = useRouter();

  const handleSearch = useCallback(async (text: string) => {
    setSearch(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .or(
          `display_name.ilike.%${text}%,username.ilike.%${text}%`
        )
        .limit(20);
      if (!error && data) {
        setResults(data.filter((u) => u.id !== userId));
      } else {
        setResults([]);
      }
    } catch (e) {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [userId]);

  const handleSelect = async (targetUser: any) => {
    if (!userId) return;
    try {
      const { conversationId } = await startDirectConversation(userId, targetUser.id);
      router.push({ pathname: '/dm-thread', params: { conversationId } });
    } catch (e: any) {
      Alert.alert('Unable to start message', e?.message || 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#B5161E' }} edges={['left', 'right', 'top']}>
      <FlightClubHeader
        title="New Message"
        showLogo={false}
        bellCount={0}
        dmCount={0}
        onPressBell={() => router.push('/notifications')}
        onPressMessage={() => router.push('/messages-inbox')}
        onPressMenu={() => router.push('/menu')}
      />
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
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => handleSelect(item)}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
