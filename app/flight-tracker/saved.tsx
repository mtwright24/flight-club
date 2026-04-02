import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/hooks/useAuth';
import {
  freshnessLabel,
  listWatchedFlights,
  statusTone,
  subscribeTrackedFlights,
  unwatchFlight,
  updateWatchAlerts,
  type TrackedFlightItem,
} from '../../src/lib/supabase/flightTracker';
import { colors, radius, spacing } from '../../src/styles/theme';

export default function SavedFlightsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [rows, setRows] = useState<TrackedFlightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listWatchedFlights(userId);
      setRows(data);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'Unable to load saved flights.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeTrackedFlights(userId, () => {
      void load();
    });
    return () => unsub();
  }, [load, userId]);

  const toggleDelayAlert = async (item: TrackedFlightItem) => {
    if (!userId) return;
    await updateWatchAlerts(userId, item.flight_key, { alert_on_delay: !item.alerts.alert_on_delay });
    await load();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>My Saved Flights</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Saved flights unavailable</Text>
          <Text style={styles.emptyBody}>{error}</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No saved flights yet</Text>
          <Text style={styles.emptyBody}>Track a flight and save it to your watchlist.</Text>
          <Pressable style={styles.cta} onPress={() => router.push('/flight-tracker/search')}>
            <Text style={styles.ctaText}>Track a Flight</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          renderItem={({ item }) => {
            const f = item.flight;
            if (!f) return null;
            const tone = statusTone(f.normalized_status);
            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push(`/flight-tracker/flight/${encodeURIComponent(item.flight_key)}`)}
              >
                <View style={styles.topRow}>
                  <Text style={styles.code}>{f.airline_code} {f.flight_number}</Text>
                  <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.statusText, { color: tone.fg }]}>{f.normalized_status.replace(/_/g, ' ')}</Text>
                  </View>
                </View>
                <Text style={styles.route}>{f.origin_airport} {'->'} {f.destination_airport}</Text>
                <Text style={styles.meta}>{freshnessLabel(f.updated_at)}</Text>
                <View style={styles.actions}>
                  <Pressable style={styles.actionBtn} onPress={() => void toggleDelayAlert(item)}>
                    <Text style={styles.actionText}>
                      {item.alerts.alert_on_delay ? 'Delay alerts on' : 'Delay alerts off'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.actionBtn} onPress={() => userId && unwatchFlight(userId, item.flight_key).then(load)}>
                    <Text style={styles.actionText}>Unsave</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  emptyTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
  emptyBody: { marginTop: 6, color: colors.textSecondary, fontWeight: '600', fontSize: 13, textAlign: 'center' },
  cta: { marginTop: 10, borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: '#fff', padding: 12, marginBottom: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
  route: { marginTop: 3, color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  meta: { marginTop: 3, color: colors.textSecondary, fontWeight: '600', fontSize: 12 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  actions: { marginTop: 8, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#F8FAFC' },
  actionText: { color: colors.textPrimary, fontWeight: '700', fontSize: 12 },
});
