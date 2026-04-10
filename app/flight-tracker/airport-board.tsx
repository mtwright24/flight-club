import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { flightTrackerDevLog, flightTrackerDiag } from '../../src/features/flight-tracker/api/flightTrackerService';
import { FlightTrackerDateField } from '../../src/features/flight-tracker/components/FlightTrackerDateField';
import { FlightTrackerSubScreenShell } from '../../src/features/flight-tracker/components/FlightTrackerSubScreenShell';
import { parseFlightTrackerDateParam } from '../../src/features/flight-tracker/flightDateLocal';
import { getAirportBoard, statusTone, type NormalizedFlight } from '../../src/lib/supabase/flightTracker';
import { colors, radius, spacing } from '../../src/styles/theme';

export default function AirportBoardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[]; date?: string | string[] }>();
  const codeParam = useMemo(() => {
    const raw = params.code;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw) && raw[0]) return raw[0];
    return '';
  }, [params.code]);
  const dateFromRoute = useMemo(() => parseFlightTrackerDateParam(params.date), [params.date]);

  const [airportCode, setAirportCode] = useState('');
  const [boardType, setBoardType] = useState<'arrivals' | 'departures'>('departures');
  const [boardDate, setBoardDate] = useState(dateFromRoute);

  useEffect(() => {
    setBoardDate(dateFromRoute);
  }, [dateFromRoute]);
  const [rows, setRows] = useState<NormalizedFlight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    const c = codeParam.trim().toUpperCase();
    if (c.length === 3 && /^[A-Z]{3}$/.test(c)) {
      setAirportCode(c);
    }
  }, [codeParam]);

  const run = useCallback(
    async (dateOverride?: string) => {
      Keyboard.dismiss();
      const code = airportCode.trim().toUpperCase();
      const serviceDate = dateOverride ?? boardDate;
      if (code.length !== 3) return;
      setLoading(true);
      setError(null);
      flightTrackerDiag('airport-board-screen', 'run start', { code, boardType, date: serviceDate });
      try {
        const result = await getAirportBoard(code, boardType, serviceDate);
        flightTrackerDiag('airport-board-screen', 'run ok', { flights: result.flights.length, source: result.source });
        setRows(result.flights);
        setHasFetched(true);
        if (result.flights.length === 0) {
          flightTrackerDevLog('airport-board-screen', 'empty_after_fetch', { boardType, source: result.source });
        }
      } catch (e: unknown) {
        setRows([]);
        const msg = e instanceof Error ? e.message : 'Unable to load board.';
        flightTrackerDiag('airport-board-screen', 'run error', { message: msg });
        flightTrackerDevLog('airport-board-screen', 'fetch_failed', { message: msg });
        setError(msg);
        setHasFetched(true);
      } finally {
        setLoading(false);
        Keyboard.dismiss();
      }
    },
    [airportCode, boardType, boardDate],
  );

  const onBoardDateChange = useCallback(
    (next: string) => {
      setBoardDate(next);
      const code = airportCode.trim().toUpperCase();
      if (code.length === 3 && hasFetched) {
        void run(next);
      }
    },
    [airportCode, hasFetched, run],
  );

  const formatTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  const boardDateLabel = useMemo(() => {
    try {
      return new Date(`${boardDate}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return boardDate;
    }
  }, [boardDate]);

  const toolbar = (
    <View style={styles.toolbar}>
      <TextInput
        style={styles.input}
        placeholder="Airport code (e.g. JFK)"
        placeholderTextColor={colors.textSecondary}
        value={airportCode}
        onChangeText={(t) => setAirportCode(t.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={3}
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={() => {
          Keyboard.dismiss();
          void run();
        }}
      />
      <View style={styles.typeRow}>
        <Pressable style={[styles.typeBtn, boardType === 'departures' && styles.typeBtnActive]} onPress={() => setBoardType('departures')}>
          <Text style={[styles.typeText, boardType === 'departures' && styles.typeTextActive]}>Departures</Text>
        </Pressable>
        <Pressable style={[styles.typeBtn, boardType === 'arrivals' && styles.typeBtnActive]} onPress={() => setBoardType('arrivals')}>
          <Text style={[styles.typeText, boardType === 'arrivals' && styles.typeTextActive]}>Arrivals</Text>
        </Pressable>
      </View>
      <Text style={styles.toolbarLabel}>Board date</Text>
      <FlightTrackerDateField compact value={boardDate} onChange={onBoardDateChange} />
      <Text style={styles.typeHint}>
        Showing {boardType} for the selected airport on {boardDateLabel} (your local calendar day).
      </Text>
      <Pressable style={styles.runBtn} onPress={() => void run()}>
        <Text style={styles.runBtnText}>Load board</Text>
      </Pressable>
    </View>
  );

  const listEmpty = () => {
    if (loading && rows.length === 0) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (error && rows.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void run()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    if (!hasFetched) {
      return (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Enter a 3-letter airport code and tap Load board.</Text>
        </View>
      );
    }
    if (rows.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No flights on this board</Text>
          <Text style={styles.emptyText}>
            The provider returned no {boardType} for this airport and date. Try the other board type or confirm the airport code.
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <FlightTrackerSubScreenShell title="Airport board">
      <View style={styles.flex}>
        <FlatList
          style={styles.flex}
          data={rows}
          keyExtractor={(item) => item.flight_key}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={toolbar}
          ListEmptyComponent={listEmpty}
          renderItem={({ item }) => {
            const tone = statusTone(item.normalized_status);
            return (
              <Pressable style={styles.card} onPress={() => router.push(`/flight-tracker/flight/${encodeURIComponent(item.flight_key)}`)}>
                <View style={styles.cardTop}>
                  <Text style={styles.code}>
                    {item.airline_code} {item.flight_number}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.statusText, { color: tone.fg }]}>{item.normalized_status.replace(/_/g, ' ')}</Text>
                  </View>
                </View>
                <Text style={styles.route}>
                  {item.origin_airport} {'->'} {item.destination_airport}
                </Text>
                <Text style={styles.meta}>
                  {boardType === 'departures' ? 'Dep' : 'Arr'}{' '}
                  {formatTime(boardType === 'departures' ? item.scheduled_departure : item.scheduled_arrival)}
                  {item.delay_minutes != null && item.delay_minutes > 0 ? ` · +${item.delay_minutes}m` : ''}
                </Text>
              </Pressable>
            );
          }}
          contentContainerStyle={styles.listContent}
        />
        {loading && rows.length > 0 ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
      </View>
    </FlightTrackerSubScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  toolbarLabel: { marginTop: 10, marginBottom: 6, fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  typeHint: { marginTop: 6, fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  typeRow: { marginTop: 8, flexDirection: 'row', gap: 8 },
  typeBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  typeBtnActive: { backgroundColor: '#FFF1F2', borderColor: colors.primary },
  typeText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  typeTextActive: { color: colors.primary },
  runBtn: {
    marginTop: 8,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  runBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  listContent: { padding: spacing.md, paddingBottom: spacing.xl, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, minHeight: 200 },
  errorText: { color: colors.error, fontWeight: '700', textAlign: 'center' },
  emptyTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 15, textAlign: 'center' },
  emptyText: { color: colors.textSecondary, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  retryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: colors.textPrimary, fontWeight: '800', fontSize: 13 },
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
  meta: { marginTop: 3, color: colors.textSecondary, fontWeight: '600', fontSize: 12 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
