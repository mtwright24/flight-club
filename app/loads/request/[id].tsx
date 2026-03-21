import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getLoadRequest, listLoadAnswers, postLoadAnswer } from '../../../src/lib/supabase/loads';

export default function LoadRequestDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [request, setRequest] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getLoadRequest(id as string)
      .then(res => setRequest(res.data))
      .catch(e => setError(e.message || 'Error loading request'));
    listLoadAnswers(id as string)
      .then(res => setAnswers(res.data || []))
      .catch(() => {});
    setLoading(false);
  }, [id]);

  if (loading) return <ActivityIndicator style={{ marginTop: 32 }} size="large" color="#DC3545" />;
  if (error) return <Text style={styles.errorText}>{error}</Text>;
  if (!request) return <Text style={styles.errorText}>Request not found.</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>{request.airline_code} {request.from_airport} → {request.to_airport}</Text>
        <Text style={styles.sub}>{request.travel_date}</Text>
        <Text style={styles.status}>{request.status?.toUpperCase()}</Text>
      </View>
      <Text style={styles.answersTitle}>Answers</Text>
      {answers.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble-ellipses-outline" size={40} color="#ddd" />
          <Text style={styles.emptyText}>No answers yet.</Text>
        </View>
      ) : (
        <FlatList
          data={answers}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.answerCard}>
              <Text style={styles.answerLevel}>{item.load_level}</Text>
              <Text style={styles.answerNotes}>{item.notes}</Text>
              <Text style={styles.answerTime}>{item.as_of}</Text>
            </View>
          )}
        />
      )}
      <Pressable style={styles.ctaButton} onPress={() => {}}>
        <Text style={styles.ctaButtonText}>Answer Request</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  headerCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, borderWidth: 1, borderColor: '#eee' },
  title: { fontWeight: '700', fontSize: 18, color: '#222' },
  sub: { color: '#888', fontSize: 15, marginTop: 2 },
  status: { color: '#DC3545', fontWeight: '700', fontSize: 13, marginTop: 8 },
  answersTitle: { fontWeight: '700', fontSize: 16, marginBottom: 10 },
  emptyState: { alignItems: 'center', marginTop: 32 },
  emptyText: { color: '#888', fontSize: 16, marginTop: 12 },
  answerCard: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14, marginBottom: 10 },
  answerLevel: { fontWeight: '700', fontSize: 15, color: '#DC3545' },
  answerNotes: { color: '#222', fontSize: 14, marginTop: 2 },
  answerTime: { color: '#888', fontSize: 12, marginTop: 4 },
  ctaButton: { backgroundColor: '#DC3545', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  ctaButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  errorText: { color: '#DC3545', fontWeight: '700', fontSize: 16, textAlign: 'center', marginTop: 24 },
});
