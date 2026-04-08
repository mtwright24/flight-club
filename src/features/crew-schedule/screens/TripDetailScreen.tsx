import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchTripGroupEntries } from '../scheduleApi';
import { entriesToSingleTrip } from '../tripMapper';
import { getMockTripById } from '../mockScheduleData';
import { enrichCrewScheduleSegment } from '../../../lib/supabase/flightTracker';
import { scheduleTheme as T } from '../scheduleTheme';
import type { CrewScheduleTrip, ScheduleDutyStatus } from '../types';
import CrewScheduleHeader from '../components/CrewScheduleHeader';

function statusLabel(s: ScheduleDutyStatus): string {
  switch (s) {
    case 'off':
      return 'OFF';
    case 'rsv':
      return 'RSV';
    case 'pto':
      return 'PTO';
    case 'deadhead':
      return 'DH';
    case 'continuation':
      return 'Continuation';
    case 'flying':
      return 'Flying';
    case 'training':
      return 'Training';
    default:
      return 'Duty';
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function TripDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId: tripIdParam } = useLocalSearchParams<{ tripId?: string }>();
  const tripId = typeof tripIdParam === 'string' ? tripIdParam : tripIdParam?.[0];

  const [trip, setTrip] = useState<CrewScheduleTrip | undefined>(undefined);
  const [loadingTrip, setLoadingTrip] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!tripId) {
        setTrip(undefined);
        setLoadingTrip(false);
        return;
      }
      setLoadingTrip(true);
      if (tripId.startsWith('demo-')) {
        setTrip(getMockTripById(tripId));
        setLoadingTrip(false);
        return;
      }
      if (UUID_RE.test(tripId)) {
        try {
          const rows = await fetchTripGroupEntries(tripId);
          if (!cancelled) setTrip(entriesToSingleTrip(rows));
        } catch {
          if (!cancelled) setTrip(undefined);
        } finally {
          if (!cancelled) setLoadingTrip(false);
        }
        return;
      }
      setTrip(getMockTripById(tripId));
      setLoadingTrip(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const openPost = (t: CrewScheduleTrip) => {
    router.push({
      pathname: '/crew-exchange/create-post',
      params: {
        prefillPairing: t.pairingCode,
        prefillRoute: t.routeSummary,
        prefillStart: t.startDate,
        prefillEnd: t.endDate,
        prefillFrom: t.origin ?? '',
        prefillTo: t.destination ?? '',
        prefillBase: t.base ?? '',
        prefillCredit: t.creditHours != null ? String(t.creditHours) : '',
      },
    });
  };

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

  if (!trip) {
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

  const t = trip;
  const hotel = t.hotel;
  const [legStatuses, setLegStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const statusMap: Record<string, string> = {};
      for (const leg of t.legs) {
        if (!leg.flightNumber) continue;
        const ident = leg.flightNumber.trim().toUpperCase();
        const airline = ident.replace(/\d+.*/, '');
        const number = ident.replace(/^[A-Z]+/, '');
        if (!number) continue;
        try {
          const enriched = await enrichCrewScheduleSegment({
            airline_code: airline || null,
            flight_number: number,
            departure_date: t.startDate,
            origin_airport: leg.departureAirport,
            destination_airport: leg.arrivalAirport,
          });
          if (enriched.matched && enriched.normalized_status) {
            statusMap[leg.id] = enriched.delay_minutes != null
              ? `${enriched.normalized_status.replace(/_/g, ' ')} · ${enriched.delay_minutes}m delay`
              : enriched.normalized_status.replace(/_/g, ' ');
          }
        } catch {
          // noop: keep schedule detail resilient when external flight lookup fails
        }
      }
      if (mounted) setLegStatuses(statusMap);
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [t.legs, t.startDate]);

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="Trip detail" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.route}>{t.routeSummary}</Text>
          <Text style={styles.pair}>{t.pairingCode}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{statusLabel(t.status)}</Text>
            </View>
            {t.base ? (
              <View style={[styles.badge, styles.badgeMuted]}>
                <Text style={styles.badgeTextMuted}>Base {t.base}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.metaLine}>
            {t.startDate === t.endDate ? t.startDate : `${t.startDate} → ${t.endDate}`}
          </Text>
          <Text style={styles.metaLine}>
            {t.dutyDays} duty day{t.dutyDays === 1 ? '' : 's'}
            {t.creditHours != null ? ` · ${t.creditHours} CR` : ''}
          </Text>
        </View>

        <Text style={styles.h2}>Legs</Text>
        {t.legs.length === 0 ? (
          <Text style={styles.muted}>No legs for this duty line.</Text>
        ) : (
          t.legs.map((leg) => (
            <View key={leg.id} style={styles.legCard}>
              <View style={styles.legTop}>
                <Text style={styles.legPair}>
                  {leg.departureAirport} → {leg.arrivalAirport}
                </Text>
                {leg.isDeadhead ? (
                  <View style={styles.dh}>
                    <Text style={styles.dhText}>DH</Text>
                  </View>
                ) : null}
              </View>
              {leg.flightNumber ? <Text style={styles.fn}>Flt {leg.flightNumber}</Text> : null}
              <Text style={styles.legTimes}>
                Rpt {leg.reportLocal ?? '—'} · Dep {leg.departLocal ?? '—'} · Arr {leg.arriveLocal ?? '—'}
                {leg.releaseLocal ? ` · Rel ${leg.releaseLocal}` : ''}
              </Text>
              {legStatuses[leg.id] ? <Text style={styles.liveStatus}>Live: {legStatuses[leg.id]}</Text> : null}
              {leg.flightNumber ? (
                <Pressable
                  style={styles.trackBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/flight-tracker/results',
                      params: { q: leg.flightNumber },
                    })
                  }
                >
                  <Ionicons name="airplane-outline" size={14} color={T.accent} />
                  <Text style={styles.trackBtnText}>Track this leg</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}

        <Text style={styles.h2}>Layover / hotel</Text>
        {hotel ? (
          <View style={styles.legCard}>
            <Text style={styles.hotelName}>{hotel.name ?? 'Hotel'}</Text>
            <Text style={styles.metaLine}>{[hotel.city, hotel.address].filter(Boolean).join(' · ')}</Text>
            {hotel.shuttleNotes ? <Text style={styles.note}>Van / shuttle: {hotel.shuttleNotes}</Text> : null}
            <Text style={styles.placeholder}>Food nearby — add notes when supported</Text>
            <Text style={styles.placeholder}>Safety notes — add when supported</Text>
          </View>
        ) : (
          <Text style={styles.muted}>No hotel on file for this line.</Text>
        )}

        <Text style={styles.h2}>Crew</Text>
        <View style={styles.legCard}>
          <Text style={styles.muted}>Crew roster and trip participants will appear when available.</Text>
          {t.tripChatThreadId ? (
            <Text style={styles.mono}>Thread: {t.tripChatThreadId}</Text>
          ) : (
            <Text style={styles.placeholder}>Link to Trip Chat when assigned.</Text>
          )}
        </View>

        <Text style={styles.h2}>Actions</Text>
        <View style={styles.actions}>
          <ActionTile icon="swap-horizontal" label="Post trip" onPress={() => openPost(t)} />
          <ActionTile
            icon="chatbubbles-outline"
            label="Open trip chat"
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionTile, pressed && { opacity: 0.92 }]}>
      <Ionicons name={icon} size={22} color={T.accent} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  scroll: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  route: { fontSize: 20, fontWeight: '800', color: T.text },
  pair: { fontSize: 15, fontWeight: '700', color: T.textSecondary, marginTop: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  badgeMuted: { backgroundColor: T.surfaceMuted, borderColor: T.line },
  badgeText: { fontSize: 12, fontWeight: '800', color: T.accent },
  badgeTextMuted: { fontSize: 12, fontWeight: '700', color: T.text },
  metaLine: { fontSize: 14, color: T.text, marginTop: 6 },
  h2: {
    fontSize: 13,
    fontWeight: '800',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  legCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: T.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  legTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legPair: { fontSize: 16, fontWeight: '800', color: T.text },
  dh: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#E0E7FF',
  },
  dhText: { fontSize: 11, fontWeight: '800', color: '#3730A3' },
  fn: { fontSize: 13, color: T.textSecondary, marginTop: 4 },
  legTimes: { fontSize: 13, color: T.text, marginTop: 8, lineHeight: 18 },
  trackBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  trackBtnText: { fontSize: 12, fontWeight: '700', color: T.accent },
  liveStatus: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#1D4ED8' },
  hotelName: { fontSize: 16, fontWeight: '800', color: T.text },
  note: { fontSize: 13, color: T.text, marginTop: 8 },
  placeholder: { fontSize: 12, color: T.textSecondary, marginTop: 6, fontStyle: 'italic' },
  muted: { fontSize: 14, color: T.textSecondary, paddingHorizontal: 16 },
  mono: { fontSize: 12, color: T.textSecondary, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  actionTile: {
    width: '47%',
    minWidth: 140,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  actionLabel: { fontSize: 14, fontWeight: '800', color: T.text },
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
