import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/hooks/useAuth';
import {
  saveFlightSearchHistory,
  searchFlights,
  statusTone,
  watchFlight,
  type NormalizedFlight,
} from '../../src/lib/supabase/flightTracker';
import { colors, radius, spacing } from '../../src/styles/theme';

export default function FlightTrackerResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const qParam = params.q;
  const query = useMemo(() => {
    if (typeof qParam === 'string') return qParam.trim();
    if (Array.isArray(qParam) && qParam[0]) return String(qParam[0]).trim();
    return '';
  }, [qParam]);
  const { session } = useAuth();
  const userId = session?.user?.id || null;

  const [rows, setRows] = useState<NormalizedFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyFlight, setBusyFlight] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!query) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await searchFlights(query);
      setRows(res.flights);
      if (userId) {
        const inferredType = /^[A-Z]{3}$/.test(query) ? 'airport' : /(?:\sTO\s|[-/])/.test(query) ? 'route' : 'flight';
        await saveFlightSearchHistory(userId, query, inferredType as 'flight' | 'route' | 'airport', res.flights[0]?.flight_key || null).catch(() => {});
      }
    } catch (e: any) {
      setError(e?.message || 'Flight Tracker search failed.');
    } finally {
      setLoading(false);
    }
  }, [query, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleWatch = async (flight: NormalizedFlight) => {
    if (!userId) return;
    setBusyFlight(flight.flight_key);
    try {
      await watchFlight(userId, {
        flight_key: flight.flight_key,
        airline_code: flight.airline_code,
        flight_number: flight.flight_number,
        origin_airport: flight.origin_airport,
        destination_airport: flight.destination_airport,
        service_date: flight.service_date,
      });
    } finally {
      setBusyFlight(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Search Results</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.subheader}>
        <Text style={styles.subheaderLabel}>Query</Text>
        <Text style={styles.subheaderValue}>{query || '—'}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No matching flights</Text>
          <Text style={styles.emptyBody}>Search by flight number, route, or airport code.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.flight_key}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          renderItem={({ item }) => {
            const tone = statusTone(item.normalized_status);
            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push(`/flight-tracker/flight/${encodeURIComponent(item.flight_key)}`)}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.flightCode}>{item.airline_code} {item.flight_number}</Text>
                  <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.statusPillText, { color: tone.fg }]}>{item.normalized_status.replace(/_/g, ' ')}</Text>
                  </View>
                </View>
                <Text style={styles.routeLine}>{item.origin_airport} {'->'} {item.destination_airport}</Text>
                <Text style={styles.metaLine}>
                  {item.scheduled_departure ? new Date(item.scheduled_departure).toLocaleString() : 'No departure time'} · {item.aircraft_type || 'Aircraft TBD'}
                </Text>
                <Text style={styles.metaLine}>
                  {item.estimated_arrival ? `ETA ${new Date(item.estimated_arrival).toLocaleTimeString()}` : 'ETA unavailable'}{item.delay_minutes != null ? ` · ${item.delay_minutes}m delay` : ''}
                </Text>
                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => void handleWatch(item)}
                    style={styles.watchBtn}
                    disabled={busyFlight === item.flight_key}
                  >
                    <Text style={styles.watchBtnText}>{busyFlight === item.flight_key ? 'Saving...' : 'Save / Watch'}</Text>
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  subheader: { paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#F8FAFC' },
  subheaderLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  subheaderValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '800', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  errorText: { color: colors.error, fontWeight: '700', textAlign: 'center' },
  retry: { marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { color: colors.textPrimary, fontWeight: '700' },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  emptyBody: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: '#fff', padding: 12, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flightCode: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontWeight: '700', fontSize: 11, textTransform: 'capitalize' },
  routeLine: { marginTop: 3, color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  metaLine: { marginTop: 4, color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  cardActions: { marginTop: 8, flexDirection: 'row', justifyContent: 'flex-end' },
  watchBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F8FAFC' },
  watchBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: '800' },
});
