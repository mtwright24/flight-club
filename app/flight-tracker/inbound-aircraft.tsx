import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/hooks/useAuth';
import { buildFlightKey } from '../../src/lib/supabase/flightTracker';
import {
  flightTrackerDevLog,
  inboundAircraftFetch,
  listTrackedFlightsFromDb,
} from '../../src/features/flight-tracker/api/flightTrackerService';
import type { NormalizedFlightTrackerResult } from '../../src/features/flight-tracker/types';
import { colors, radius, spacing } from '../../src/styles/theme';

type Row = {
  id: string;
  flightKey: string | null;
  label: string;
  route: string;
  risk: string;
  detail: string;
  flight?: NormalizedFlightTrackerResult;
  unsupported?: boolean;
};

export default function InboundAircraftScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const tracked = (await listTrackedFlightsFromDb(userId)) ?? [];
      const next: Row[] = [];
      for (const t of tracked.slice(0, 20)) {
        try {
          const res = await inboundAircraftFetch({
            trackedFlightId: t.id,
            carrierCode: t.carrier_code,
            flightNumber: t.flight_number,
            flightDate: t.flight_date,
            providerFlightId: t.api_flight_id ?? undefined,
          });
          const fk =
            t.flight_key ||
            buildFlightKey({
              airlineCode: t.carrier_code,
              flightNumber: t.flight_number,
              serviceDate: t.flight_date,
              origin: t.departure_airport,
              destination: t.arrival_airport,
            });
          if (res.supported === false) {
            next.push({
              id: t.id,
              flightKey: fk,
              label: `${t.carrier_code} ${t.flight_number}`,
              route: `${t.departure_airport} → ${t.arrival_airport}`,
              risk: '—',
              detail: 'Inbound aircraft analysis is not available with the current flight data provider.',
              unsupported: true,
            });
            continue;
          }
          const inbound = res.flight.inboundSummary;
          const fkResolved = t.flight_key || res.flight.flightKey || fk;
          next.push({
            id: t.id,
            flightKey: fkResolved,
            label: `${t.carrier_code} ${t.flight_number}`,
            route: `${t.departure_airport} → ${t.arrival_airport}`,
            risk: res.riskLevel,
            detail: inbound
              ? `${inbound.displayFlightNumber ?? 'Inbound'} · ETA ${inbound.etaUtc ? new Date(inbound.etaUtc).toLocaleTimeString() : '—'} · ${inbound.delayMinutes != null ? `${inbound.delayMinutes}m late` : 'On time'}`
              : 'No inbound aircraft match for this tail at your gate yet.',
            flight: res.flight,
          });
        } catch (e: unknown) {
          flightTrackerDevLog('inbound-screen', 'row_error', {
            message: e instanceof Error ? e.message : String(e),
          });
          const fk =
            t.flight_key ||
            buildFlightKey({
              airlineCode: t.carrier_code,
              flightNumber: t.flight_number,
              serviceDate: t.flight_date,
              origin: t.departure_airport,
              destination: t.arrival_airport,
            });
          next.push({
            id: t.id,
            flightKey: fk,
            label: `${t.carrier_code} ${t.flight_number}`,
            route: `${t.departure_airport} → ${t.arrival_airport}`,
            risk: 'unknown',
            detail: 'Unable to compute inbound chain for this flight.',
          });
        }
      }
      setRows(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to load inbound aircraft data.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Inbound Aircraft</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Loading inbound intelligence…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
          <Pressable style={styles.cta} onPress={() => void load()}>
            <Text style={styles.ctaText}>Try again</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.title}>No tracked flights</Text>
          <Text style={styles.body}>Save a flight in Flight Tracker to analyze inbound aircraft and tail rotation.</Text>
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
            <Pressable
              style={styles.card}
              onPress={() => {
                const fk = item.flightKey || item.flight?.flightKey;
                if (fk) router.push(`/flight-tracker/flight/${encodeURIComponent(fk)}`);
              }}
            >
              <View style={styles.cardTop}>
                <Text style={styles.code}>{item.label}</Text>
                <View
                  style={[
                    styles.badge,
                    item.unsupported ? styles.badgeInfo : item.risk === 'high' ? styles.badgeHi : styles.badgeLo,
                  ]}
                >
                  <Text style={styles.badgeText}>{item.unsupported ? 'Info' : item.risk}</Text>
                </View>
              </View>
              <Text style={styles.route}>{item.route}</Text>
              <Text style={styles.meta}>{item.detail}</Text>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  title: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
  body: { color: colors.textSecondary, fontWeight: '600', fontSize: 13, marginTop: 6, textAlign: 'center' },
  err: { color: colors.error, fontWeight: '700', textAlign: 'center' },
  muted: { marginTop: 8, color: colors.textSecondary, fontWeight: '600', fontSize: 12 },
  cta: { marginTop: 12, borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  route: { marginTop: 3, color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  meta: { marginTop: 4, color: colors.textSecondary, fontWeight: '600', fontSize: 12 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  badgeLo: { backgroundColor: '#E2E8F0' },
  badgeHi: { backgroundColor: '#FEE2E2' },
  badgeInfo: { backgroundColor: '#E0F2FE' },
  badgeText: { fontWeight: '800', fontSize: 10, textTransform: 'uppercase' },
});
