import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, NativeModules, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { FlightTrackerSubScreenShell } from '../../../src/features/flight-tracker/components/FlightTrackerSubScreenShell';
import { useAuth } from '../../../src/hooks/useAuth';
import {
  buildTrackedFlightShareText,
  freshnessLabel,
  getLiveFlightDetail,
  statusTone,
  unwatchFlight,
  watchFlight,
  type NormalizedFlight,
} from '../../../src/lib/supabase/flightTracker';
import { colors, radius, spacing } from '../../../src/styles/theme';

export default function FlightTrackerDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ flightKey?: string | string[] }>();
  const flightKeyParam = params.flightKey;
  const flightKey = useMemo(() => {
    if (typeof flightKeyParam === 'string') return decodeURIComponent(flightKeyParam);
    if (Array.isArray(flightKeyParam) && flightKeyParam[0]) return decodeURIComponent(String(flightKeyParam[0]));
    return '';
  }, [flightKeyParam]);
  const { session } = useAuth();
  const userId = session?.user?.id || null;

  const [flight, setFlight] = useState<NormalizedFlight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchBusy, setWatchBusy] = useState(false);

  const load = useCallback(async (forceRefresh = false) => {
    if (!flightKey) {
      setLoading(false);
      return;
    }
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await getLiveFlightDetail(flightKey, forceRefresh);
      setFlight(data);
    } catch (e: any) {
      setError(e?.message || 'Unable to fetch flight details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [flightKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      void load(true);
    }, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const tone = statusTone(flight?.normalized_status || 'unknown');

  const points = useMemo(() => {
    if (!flight?.route_data || !Array.isArray((flight.route_data as any).track)) return [];
    const rows = ((flight.route_data as any).track as any[]).map((p) => ({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
    })).filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
    return rows.slice(0, 250);
  }, [flight?.route_data]);

  const mapModule = useMemo(() => {
    const nm = NativeModules as Record<string, unknown>;
    const hasNative = Boolean(nm.RNMapsAirModule ?? nm.RNMapsManager ?? nm.AIRMap);
    if (!hasNative) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('react-native-maps');
    } catch {
      return null;
    }
  }, []);
  const MapViewComponent = mapModule?.default;
  const MarkerComponent = mapModule?.Marker;
  const PolylineComponent = mapModule?.Polyline;

  const hasPosition = Number.isFinite(flight?.latitude) && Number.isFinite(flight?.longitude);

  const toggleWatch = async () => {
    if (!userId || !flight) return;
    setWatchBusy(true);
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
      setWatchBusy(false);
    }
  };

  const removeWatch = async () => {
    if (!userId || !flight) return;
    setWatchBusy(true);
    try {
      await unwatchFlight(userId, flight.flight_key);
    } finally {
      setWatchBusy(false);
    }
  };

  const onShare = async () => {
    if (!flight) return;
    await Share.share({ message: buildTrackedFlightShareText(flight) });
  };

  return (
    <FlightTrackerSubScreenShell
      title="Live Flight Detail"
      headerRight={
        <Pressable onPress={() => void load(true)} hitSlop={8} accessibilityLabel="Refresh flight">
          <Ionicons name="refresh" size={22} color={colors.cardBg} />
        </Pressable>
      }
    >
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load(true)}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : !flight ? (
        <View style={styles.center}><Text style={styles.errorText}>Flight not found.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View>
                <Text style={styles.code}>{flight.airline_code} {flight.flight_number}</Text>
                <Text style={styles.route}>{flight.origin_airport} {'->'} {flight.destination_airport}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                <Text style={[styles.statusText, { color: tone.fg }]}>
                  {flight.normalized_status.replace(/_/g, ' ')}
                </Text>
              </View>
            </View>
            <Text style={styles.meta}>Service date: {flight.service_date}</Text>
            <Text style={styles.meta}>{flight.aircraft_type || 'Aircraft TBD'}{flight.registration ? ` · ${flight.registration}` : ''}</Text>
            <Text style={styles.meta}>{freshnessLabel(flight.updated_at)}</Text>
            {refreshing ? <Text style={styles.refreshing}>Refreshing live data...</Text> : null}
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Live stats</Text>
            <Text style={styles.statLine}>Altitude: {flight.altitude != null ? `${flight.altitude} ft` : '—'}</Text>
            <Text style={styles.statLine}>Speed: {flight.speed != null ? `${flight.speed} kts` : '—'}</Text>
            <Text style={styles.statLine}>Heading: {flight.heading != null ? `${flight.heading}°` : '—'}</Text>
            <Text style={styles.statLine}>Gate/Terminal: {flight.gate || 'TBD'} / {flight.terminal || 'TBD'}</Text>
            <Text style={styles.statLine}>
              Departure: {flight.actual_departure ? `Actual ${new Date(flight.actual_departure).toLocaleString()}` : flight.estimated_departure ? `Est ${new Date(flight.estimated_departure).toLocaleString()}` : 'Scheduled TBD'}
            </Text>
            <Text style={styles.statLine}>
              Arrival: {flight.actual_arrival ? `Actual ${new Date(flight.actual_arrival).toLocaleString()}` : flight.estimated_arrival ? `Est ${new Date(flight.estimated_arrival).toLocaleString()}` : 'Scheduled TBD'}
            </Text>
            <Text style={styles.statLine}>Delay: {flight.delay_minutes != null ? `${flight.delay_minutes} minutes` : '—'}</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Map</Text>
            {hasPosition && MapViewComponent && MarkerComponent ? (
              <MapViewComponent
                style={styles.map}
                initialRegion={{
                  latitude: flight.latitude || 0,
                  longitude: flight.longitude || 0,
                  latitudeDelta: 8,
                  longitudeDelta: 8,
                }}
              >
                <MarkerComponent
                  coordinate={{ latitude: flight.latitude || 0, longitude: flight.longitude || 0 }}
                  title={`${flight.airline_code} ${flight.flight_number}`}
                  description={`${flight.origin_airport} -> ${flight.destination_airport}`}
                />
                {points.length >= 2 && PolylineComponent ? (
                  <PolylineComponent
                    coordinates={points}
                    strokeColor="#1D4ED8"
                    strokeWidth={3}
                  />
                ) : null}
              </MapViewComponent>
            ) : (
              <View style={styles.mapEmpty}>
                <Text style={styles.mapEmptyText}>
                  {!hasPosition
                    ? 'Live aircraft coordinates are not available for this flight yet.'
                    : 'Map view is unavailable in this build. Flight stats are still live.'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.actionBtn} onPress={() => void toggleWatch()} disabled={watchBusy}>
              <Text style={styles.actionBtnText}>{watchBusy ? 'Saving...' : 'Save / Watch'}</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => void removeWatch()} disabled={watchBusy}>
              <Text style={styles.actionBtnText}>Unsave</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => void onShare()}>
              <Text style={styles.actionBtnText}>Share flight</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => router.push('/flight-tracker/delay-watcher')}>
              <Text style={styles.actionBtnText}>Open Delay Watcher</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </FlightTrackerSubScreenShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  summaryCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: '#fff', padding: 12 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  route: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 2 },
  meta: { marginTop: 4, color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontWeight: '800', fontSize: 12, textTransform: 'capitalize' },
  refreshing: { marginTop: 6, color: colors.primary, fontSize: 12, fontWeight: '700' },
  block: { marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: '#fff', padding: 12 },
  blockTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 14, marginBottom: 6 },
  statLine: { color: colors.textSecondary, fontWeight: '600', fontSize: 12, marginTop: 4 },
  map: { width: '100%', height: 210, borderRadius: radius.md },
  mapEmpty: { height: 120, borderRadius: radius.md, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  mapEmptyText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  actionBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  actionBtnText: { color: colors.textPrimary, fontWeight: '700', fontSize: 12 },
  errorText: { color: colors.error, fontWeight: '700', textAlign: 'center' },
  retryBtn: { marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { color: colors.textPrimary, fontWeight: '700' },
});
