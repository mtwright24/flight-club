import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlightTrackerSubScreenShell } from '../../src/features/flight-tracker/components/FlightTrackerSubScreenShell';
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to load delay watch list.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const risks = useMemo(() => {
    return rows.filter((r) => {
      const d = r.flight?.delay_minutes;
      const st = r.flight?.normalized_status;
      return (d != null && d >= 10) || st === 'delayed' || st === 'cancelled';
    });
  }, [rows]);

  return (
    <FlightTrackerSubScreenShell title="Delay Watcher">
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
          <Pressable style={styles.cta} onPress={() => void load()}>
            <Text style={styles.ctaText}>Retry</Text>
          </Pressable>
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
    </FlightTrackerSubScreenShell>
  );
}

const styles = StyleSheet.create({
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
