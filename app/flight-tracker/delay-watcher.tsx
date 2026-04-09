import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/hooks/useAuth';
import { listWatchedFlights, type TrackedFlightItem } from '../../src/lib/supabase/flightTracker';
import { colors, radius, spacing } from '../../src/styles/theme';

export default function DelayWatcherScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [rows, setRows] = useState<TrackedFlightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    listWatchedFlights(userId)
      .then(setRows)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Unable to load delay watch list.');
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const risks = useMemo(() => {
    return rows.filter((r) => {
      const d = r.flight?.delay_minutes;
      const st = r.flight?.normalized_status;
      return (d != null && d >= 10) || st === 'delayed' || st === 'cancelled';
    });
  }, [rows]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Delay Watcher</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No saved flights</Text>
          <Text style={styles.emptyBody}>Save flights in Flight Tracker to monitor delays and cancellations.</Text>
          <Pressable style={styles.cta} onPress={() => router.push('/flight-tracker/search')}>
            <Text style={styles.ctaText}>Track a flight</Text>
          </Pressable>
        </View>
      ) : risks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No current delay risks</Text>
          <Text style={styles.emptyBody}>No current delay risks on your saved flights.</Text>
        </View>
      ) : (
        <FlatList
          data={risks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/flight-tracker/flight/${encodeURIComponent(item.flight_key)}`)}
            >
              <Text style={styles.code}>
                {item.flight?.airline_code} {item.flight?.flight_number}
              </Text>
              <Text style={styles.route}>
                {item.flight?.origin_airport} {'->'} {item.flight?.destination_airport}
              </Text>
              <Text style={styles.meta}>
                {item.flight?.delay_minutes != null && item.flight.delay_minutes > 0
                  ? `${item.flight.delay_minutes} minute delay · `
                  : ''}
                Status {item.flight?.normalized_status?.replace(/_/g, ' ') ?? '—'}
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
  header: {
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { color: colors.error, fontWeight: '700', paddingHorizontal: spacing.lg, textAlign: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  emptyTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
  emptyBody: { color: colors.textSecondary, fontWeight: '600', fontSize: 13, marginTop: 6, textAlign: 'center' },
  cta: { marginTop: 10, borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 10,
  },
  code: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  route: { marginTop: 3, color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  meta: { marginTop: 4, color: colors.textSecondary, fontWeight: '600', fontSize: 12 },
});
