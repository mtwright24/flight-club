import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchPairingDutiesForScheduleEntries,
  fetchTripGroupEntries,
  fetchTripMetadataForGroup,
  mergeTripWithMetadataRow,
  type ScheduleTripMetadataRow,
} from '../scheduleApi';
import { dutiesToCrewScheduleLegs } from '../jetblueFlicaImport';
import { entriesToSingleTrip } from '../tripMapper';
import { getMockTripById } from '../mockScheduleData';
import { tradePostPrefillParams } from '../tradePostPrefillParams';
import { localCalendarDate } from '../../flight-tracker/flightDateLocal';
import { enrichCrewScheduleSegment } from '../../../lib/supabase/flightTracker';
import { scheduleTheme as T } from '../scheduleTheme';
import { buildTripDetailViewModel, formatLayoverTotalMinutes } from '../tripDetailViewModel';
import type { CrewScheduleLeg, CrewScheduleTrip } from '../types';
import CrewScheduleHeader from '../components/CrewScheduleHeader';
import TripCrewList from '../components/TripCrewList';
import TripDayDetailPanel from '../components/TripDayDetailPanel';
import TripDayTimelineNav from '../components/TripDayTimelineNav';
import TripSummaryCard from '../components/TripSummaryCard';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function TripDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId: tripIdParam } = useLocalSearchParams<{ tripId?: string }>();
  const tripId = typeof tripIdParam === 'string' ? tripIdParam : tripIdParam?.[0];

  const [trip, setTrip] = useState<CrewScheduleTrip | undefined>(undefined);
  const [tripMeta, setTripMeta] = useState<ScheduleTripMetadataRow | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [legStatuses, setLegStatuses] = useState<Record<string, string>>({});
  const [trackingLegId, setTrackingLegId] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  const display = useMemo(
    () => (trip ? mergeTripWithMetadataRow(trip, tripMeta) : undefined),
    [trip, tripMeta]
  );

  const vm = useMemo(() => (display ? buildTripDetailViewModel(display) : null), [display]);

  useEffect(() => {
    setSelectedDayIndex(0);
  }, [tripId]);

  useEffect(() => {
    if (!vm?.days.length) return;
    setSelectedDayIndex((i) => Math.max(0, Math.min(i, vm.days.length - 1)));
  }, [vm?.days.length]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!tripId) {
        setTrip(undefined);
        setTripMeta(null);
        setLoadingTrip(false);
        return;
      }
      setLoadingTrip(true);
      if (tripId.startsWith('demo-')) {
        setTrip(getMockTripById(tripId));
        setTripMeta(null);
        setLoadingTrip(false);
        return;
      }
      if (UUID_RE.test(tripId)) {
        try {
          const [rows, meta] = await Promise.all([
            fetchTripGroupEntries(tripId),
            fetchTripMetadataForGroup(tripId).catch(() => null),
          ]);
          if (!cancelled) {
            const base = entriesToSingleTrip(rows);
            let next = base;
            if (base) {
              const duties = await fetchPairingDutiesForScheduleEntries(rows);
              if (duties?.length) {
                next = {
                  ...base,
                  legs: dutiesToCrewScheduleLegs(duties, base.id, base.base?.trim().toUpperCase() || 'JFK'),
                };
              }
            }
            setTrip(next);
            setTripMeta(meta);
          }
        } catch {
          if (!cancelled) {
            setTrip(undefined);
            setTripMeta(null);
          }
        } finally {
          if (!cancelled) setLoadingTrip(false);
        }
        return;
      }
      setTrip(getMockTripById(tripId));
      setTripMeta(null);
      setLoadingTrip(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => {
    setLegStatuses({});
  }, [tripId]);

  const trackLeg = useCallback(
    async (leg: CrewScheduleLeg, t: CrewScheduleTrip) => {
      if (!leg.flightNumber) return;
      setTrackingLegId(leg.id);
      const raw = leg.flightNumber.trim();
      const b6 = raw.match(/B6\s*(\d+)/i);
      const flight_number = b6 ? b6[1] : raw.replace(/\D/g, '');
      const airline_code = b6 ? 'B6' : raw.match(/^([A-Z]{2})/i)?.[1]?.toUpperCase() ?? null;
      if (!flight_number) {
        setTrackingLegId(null);
        return;
      }
      const dutyDate = leg.dutyDate && /^\d{4}-\d{2}-\d{2}$/.test(leg.dutyDate) ? leg.dutyDate : t.startDate;
      try {
        const enriched = await enrichCrewScheduleSegment({
          airline_code: airline_code || null,
          flight_number,
          departure_date: dutyDate,
          origin_airport: leg.departureAirport,
          destination_airport: leg.arrivalAirport,
          schedule_entry_id: leg.scheduleEntryId ?? null,
        });
        if (enriched.matched && enriched.normalized_status) {
          const line =
            enriched.delay_minutes != null
              ? `${enriched.normalized_status.replace(/_/g, ' ')} · ${enriched.delay_minutes}m delay`
              : enriched.normalized_status.replace(/_/g, ' ');
          setLegStatuses((s) => ({ ...s, [leg.id]: line }));
        }
      } catch {
        /* cache / provider errors */
      } finally {
        setTrackingLegId(null);
      }
      router.push({
        pathname: '/flight-tracker/results',
        params: {
          q: leg.flightNumber,
          date: /^\d{4}-\d{2}-\d{2}/.test(dutyDate) ? dutyDate.slice(0, 10) : localCalendarDate(),
        },
      });
    },
    [router]
  );

  const openPost = useCallback(
    (t: CrewScheduleTrip) => {
      router.push({
        pathname: '/crew-exchange/create-post',
        params: tradePostPrefillParams(t),
      });
    },
    [router]
  );

  if (!tripId) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Trip detail" />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Trip not found</Text>
          <Text style={styles.emptySub}>Missing trip id.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loadingTrip && !trip) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Trip detail" />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Loading…</Text>
          <Text style={styles.emptySub}>Loading trip details.</Text>
        </View>
      </View>
    );
  }

  if (!trip || !vm) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Trip detail" />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Trip not found</Text>
          <Text style={styles.emptySub}>This trip may be outside the current month or was removed.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const t = display as CrewScheduleTrip;
  const hotel = t.hotel;
  const selectedDay = vm.days[selectedDayIndex] ?? vm.days[0];
  const headerTitle = vm.pairingCode.length > 18 ? `${vm.pairingCode.slice(0, 17)}…` : vm.pairingCode;

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title={headerTitle} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <TripSummaryCard vm={vm} showStats />

        <Text style={styles.h2}>Operating days</Text>
        <TripDayTimelineNav
          days={vm.days}
          selectedDayIndex={selectedDayIndex}
          onSelectDay={setSelectedDayIndex}
        />

        {selectedDay ? (
          <TripDayDetailPanel
            day={selectedDay}
            legStatuses={legStatuses}
            trackingLegId={trackingLegId}
            onTrackLeg={(leg) => void trackLeg(leg, t)}
          />
        ) : null}

        <Text style={styles.h2}>Layover & hotel</Text>
        <View style={styles.card}>
          {t.layoverCity ? (
            <View style={styles.kv}>
              <Text style={styles.k}>Layover city</Text>
              <Text style={styles.v}>{t.layoverCity}</Text>
            </View>
          ) : null}
          <View style={styles.kv}>
            <Text style={styles.k}>Layover total</Text>
            <Text style={styles.v}>
              {t.tripLayoverTotalMinutes != null
                ? formatLayoverTotalMinutes(t.tripLayoverTotalMinutes)
                : '—'}
            </Text>
          </View>
          {hotel?.name ? (
            <>
              <Text style={styles.hotelName}>{hotel.name}</Text>
              <Text style={styles.meta}>{[hotel.city, hotel.address].filter(Boolean).join(' · ')}</Text>
              {hotel.shuttleNotes ? <Text style={styles.note}>Shuttle · {hotel.shuttleNotes}</Text> : null}
            </>
          ) : (
            <Text style={styles.muted}>No hotel on file for this pairing.</Text>
          )}
        </View>

        <View style={styles.crewSection}>
          <Text style={styles.h2}>Crew</Text>
          <View style={styles.card}>
            {vm.crewMembers.length > 0 ? (
              <TripCrewList members={vm.crewMembers} showTitle={false} />
            ) : (
              <Text style={styles.muted}>Crew appears when your schedule source includes positions and names.</Text>
            )}
            {t.tripChatThreadId ? (
              <Text style={styles.mono}>Trip chat: {t.tripChatThreadId}</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.h2}>Actions</Text>
        <View style={styles.actions}>
          <ActionTile icon="swap-horizontal" label="Post trip" onPress={() => openPost(t)} />
          <ActionTile
            icon="chatbubbles-outline"
            label="Trip chat"
            onPress={() =>
              router.push({ pathname: '/crew-schedule/trip-chat', params: { tripId: t.id } })
            }
          />
          <ActionTile
            icon="options-outline"
            label="Manage"
            onPress={() => router.push({ pathname: '/crew-schedule/manage', params: { tripId: t.id } })}
          />
          <ActionTile
            icon="alarm-outline"
            label="Set alert"
            onPress={() => router.push({ pathname: '/crew-schedule/alerts', params: { tripId: t.id } })}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function ActionTile({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.actionTileOuter}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.actionTilePressable, pressed && styles.actionTilePressed]}
      >
        <View style={styles.actionTileInner}>
          <Ionicons name={icon} size={22} color={T.accent} />
          <Text style={styles.actionLabel}>{label}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  scroll: { flex: 1 },
  h2: {
    fontSize: 12,
    fontWeight: '800',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 14,
    borderRadius: 14,
    backgroundColor: T.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  k: { fontSize: 13, color: T.textSecondary, fontWeight: '600', width: '40%' },
  v: { fontSize: 14, color: T.text, fontWeight: '800', flex: 1, textAlign: 'right' },
  hotelName: { fontSize: 17, fontWeight: '800', color: T.text, marginTop: 8 },
  meta: { fontSize: 14, color: T.text, marginTop: 6, lineHeight: 20 },
  note: { fontSize: 13, color: T.text, marginTop: 8 },
  muted: { fontSize: 14, color: T.textSecondary },
  mono: { fontSize: 11, color: T.textSecondary, marginTop: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  crewSection: { marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  actionTileOuter: {
    width: '47%',
    minWidth: 140,
    flexGrow: 1,
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.actionTileBorder,
    backgroundColor: T.surface,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 0 },
      default: {},
    }),
  },
  actionTilePressable: {
    width: '100%',
    minHeight: 52,
    flexGrow: 1,
    backgroundColor: T.surface,
  },
  actionTilePressed: { opacity: 0.96, backgroundColor: '#FFF1F2' },
  actionTileInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  actionLabel: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '800', color: T.text },
  empty: { flex: 1, padding: 24, justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  emptySub: { fontSize: 14, color: T.textSecondary, marginTop: 8, marginBottom: 20 },
  primaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: T.accent,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
});
