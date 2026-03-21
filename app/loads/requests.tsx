

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listLoadRequests, LoadRequest } from '../../src/lib/supabase/loads';
import LoadsSegmentedControl from '../../src/components/loads/LoadsSegmentedControl';
import { useRouter } from 'expo-router';

function RequestCard({ request }: { request: LoadRequest }) {
  const router = useRouter();
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/loads/request/${request.id}`)}>
      <View style={styles.cardRow}>
        <Ionicons name="airplane" size={28} color="#DC3545" style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{request.airline_code} {request.from_airport} → {request.to_airport}</Text>
          <Text style={styles.cardSub}>{request.travel_date}</Text>
        </View>
        <Text style={styles.cardStatus}>{request.status.toUpperCase()}</Text>
      </View>
    </Pressable>
  );
}

export default function LoadsRequestsScreen() {
  const [tab, setTab] = useState<'open' | 'answered'>('open');
  const [requests, setRequests] = useState<LoadRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    setRequests([]);
    listLoadRequests({ status: tab })
      .then(res => {
        if (mounted) setRequests(res.data || []);
      })
      .catch(e => setError(e.message || 'Error loading requests'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [tab]);

  return (
    <View style={styles.container}>
      <LoadsSegmentedControl
        tabs={['Open', 'Answered']}
        selectedIndex={tab === 'open' ? 0 : 1}
        onTabPress={i => setTab(i === 0 ? 'open' : 'answered')}
      />
      {loading && <ActivityIndicator style={{ marginTop: 32 }} size="large" color="#DC3545" />}
      {!loading && error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : !loading && requests.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="list-outline" size={48} color="#ddd" />
          <Text style={styles.emptyText}>No {tab === 'open' ? 'open' : 'answered'} requests found.</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <RequestCard request={item} />}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 8 },
  errorText: { color: '#DC3545', fontWeight: '700', fontSize: 16, textAlign: 'center', marginTop: 24 },
  emptyState: { alignItems: 'center', marginTop: 32 },
  emptyText: { color: '#888', fontSize: 16, marginTop: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontWeight: '700', fontSize: 16, color: '#222' },
  cardSub: { color: '#888', fontSize: 14, marginTop: 2 },
  cardStatus: { color: '#DC3545', fontWeight: '700', fontSize: 13, marginLeft: 12 },
});
