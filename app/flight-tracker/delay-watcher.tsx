import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/hooks/useAuth';
import { listWatchedFlights, type TrackedFlightItem } from '../../src/lib/supabase/flightTracker';
import { colors, radius, spacing } from '../../src/styles/theme';

export default function DelayWatcherScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [rows, setRows] = useState<TrackedFlightItem[]>([]);

  useEffect(() => {
    if (!userId) return;
    listWatchedFlights(userId).then(setRows).catch(() => setRows([]));
  }, [userId]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Delay Watcher</Text>
        <View style={{ width: 24 }} />
      </View>

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No flights in delay watcher</Text>
          <Text style={styles.emptyBody}>Save flights in Flight Tracker to get delay/cancel updates.</Text>
          <Pressable style={styles.cta} onPress={() => router.push('/flight-tracker/search')}>
            <Text style={styles.ctaText}>Track a flight</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/flight-tracker/flight/${encodeURIComponent(item.flight_key)}`)}>
              <Text style={styles.code}>{item.flight?.airline_code} {item.flight?.flight_number}</Text>
              <Text style={styles.route}>
                {item.flight?.origin_airport} {'->'} {item.flight?.destination_airport}
              </Text>
              <Text style={styles.meta}>
                Delay alerts: {item.alerts.alert_on_delay ? 'On' : 'Off'} · Cancel alerts: {item.alerts.alert_on_cancel ? 'On' : 'Off'}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: { backgroundColor: colors.headerRed, paddingHorizontal: spacing.md, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  emptyTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
  emptyBody: { color: colors.textSecondary, fontWeight: '600', fontSize: 13, marginTop: 6, textAlign: 'center' },
  cta: { marginTop: 10, borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: '#fff', padding: 12, marginBottom: 10 },
  code: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  route: { marginTop: 3, color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  meta: { marginTop: 4, color: colors.textSecondary, fontWeight: '600', fontSize: 12 },
});
