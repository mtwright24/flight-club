import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchPairingDetailByPairingUuid,
  mergeTripWithMetadataRow,
  type PairingDetailDbHotelRow,
  type ScheduleTripMetadataRow,
} from '../scheduleApi';
import { getMockTripById } from '../mockScheduleData';
import { tradePostPrefillParams } from '../tradePostPrefillParams';
import {
  getDetailNavigationStashForResolve,
  peekStashedDetailPointer,
  peekStashedPairingSnapshotKey,
  peekStashedTripForDetail,
  shouldRejectWeakerPairingRender,
} from '../tripDetailNavCache';
import { buildPairingFirstPaintDecision, resolveRenderablePairingSnapshot } from '../resolveRenderablePairingSnapshot';
import { scorePairingCompleteness } from '../pairingDetailResolve';
import { canSealPairingSurface } from '../pairingDetailReadiness';
import { monthCalendarKey } from '../scheduleMonthCache';
import {
  pairingDetailRegisterFrozenSurface,
  readPairingDetailFromMonthCache,
  storeDetailReadyPairingInMonthCaches,
} from '../pairingDetailMonthCache';
import { pairingNavigationSessionKey, readCommittedMonthSnapshot } from '../scheduleStableSnapshots';
import { localCalendarDate } from '../../flight-tracker/flightDateLocal';
import { enrichCrewScheduleSegment } from '../../../lib/supabase/flightTracker';
import { scheduleTheme as T } from '../scheduleTheme';
import { buildTripDetailViewModel, type TripDayViewModel } from '../tripDetailViewModel';
import { formatLayoverColumnDisplay } from '../scheduleTime';
import type { CrewScheduleHotelStub, CrewScheduleLeg, CrewScheduleTrip } from '../types';
import CrewScheduleHeader from '../components/CrewScheduleHeader';
import TripCrewList from '../components/TripCrewList';
import TripDayDetailPanel from '../components/TripDayDetailPanel';
import TripDayTimelineNav from '../components/TripDayTimelineNav';
import TripSummaryCard from '../components/TripSummaryCard';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normLayoverCityKey(s: string | null | undefined): string {
  return String(s ?? '')
    .trim()
    .toUpperCase();
}

function layoverCityForActivePanel(day: TripDayViewModel, trip: CrewScheduleTrip): string | null {
  const legs = day.legs;
  for (let i = legs.length - 1; i >= 0; i--) {
    const ly = legs[i]?.layoverCityLeg?.trim();
    if (ly) return ly;
  }
  const st = trip.layoverStationByDate?.[day.dateIso]?.trim();
  if (st) return st;
  return null;
}

function layoverRestRawForActivePanel(day: TripDayViewModel, trip: CrewScheduleTrip): string | null {
  const legs = day.legs;
  for (let i = legs.length - 1; i >= 0; i--) {
    const r = legs[i]?.layoverRestDisplay?.trim();
    if (r) return r;
  }
  const raw = trip.layoverByDate?.[day.dateIso]?.trim();
  return raw || null;
}

function dbHotelRowToStub(h: PairingDetailDbHotelRow): CrewScheduleHotelStub {
  return {
    name: h.hotel_name?.trim() || undefined,
    city: h.layover_city?.trim() || undefined,
    phone: h.hotel_phone?.trim() || undefined,
  };
}

/** Match `schedule_pairing_hotels` rows to the swiped operating day; never default to [0] when multiple cities exist. */
function hotelStubForActivePanel(
  hotels: PairingDetailDbHotelRow[],
  activeLayoverCity: string | null,
  activeDateIso: string,
  tripLevelHotel: CrewScheduleHotelStub | undefined,
): CrewScheduleHotelStub | null {
  if (!hotels.length) {
    return tripLevelHotel?.name || tripLevelHotel?.city ? tripLevelHotel! : null;
  }
  if (hotels.length === 1) {
    return dbHotelRowToStub(hotels[0]!);
  }
  const ac = normLayoverCityKey(activeLayoverCity);
  const byCity = hotels.filter((h) => normLayoverCityKey(h.layover_city) === ac);
  if (!byCity.length) {
    return null;
  }
  const exactDate = byCity.filter((h) => String(h.duty_date ?? '').slice(0, 10) === activeDateIso);
  const pool = exactDate.length ? exactDate : byCity;
  const pick = [...pool].sort((a, b) => String(a.duty_date ?? '').localeCompare(String(b.duty_date ?? '')))[0];
  return pick ? dbHotelRowToStub(pick) : null;
}

function firstRouteParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length > 0) return v[0];
  return undefined;
}

/** Same trip group + pairing code; dates may widen with carryover / full-route restore. */
function pairingNavKeysSameTripAndCode(expected: string | null, got: string): boolean {
  if (!expected) return true;
  const e = expected.split('|');
  const g = got.split('|');
  if (e.length >= 4 && g.length >= 4) {
    return e[0] === g[0] && e[3] === g[3];
  }
  return expected === got;
}

function visibleRowFallbackForDetail(tripId: string) {
  const entry = getDetailNavigationStashForResolve(tripId);
  const fromOverlay = entry?.overlayTrips.find((t) => String(t.id) === String(tripId));
  return fromOverlay ?? peekStashedTripForDetail(tripId) ?? null;
}

export default function TripDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId: tripIdParam, pairingUuid: pairingUuidParam } = useLocalSearchParams<{
    tripId?: string;
    pairingUuid?: string;
  }>();
  const tripId = firstRouteParam(tripIdParam);
  const pairingUuidFromRoute = firstRouteParam(pairingUuidParam);

  const [trip, setTrip] = useState<CrewScheduleTrip | undefined>(undefined);
  const [tripMeta, setTripMeta] = useState<ScheduleTripMetadataRow | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [legStatuses, setLegStatuses] = useState<Record<string, string>>({});
  const [trackingLegId, setTrackingLegId] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [pairingHotels, setPairingHotels] = useState<PairingDetailDbHotelRow[]>([]);
  const panelPagerRef = useRef<FlatList<TripDayViewModel>>(null);
  const panelScrollAnimatedRef = useRef(false);
  const { width: panelWidth } = useWindowDimensions();
  /** Dismiss stale async detail merges when `tripId` changes before paint. */
  const activeDetailTripIdRef = useRef<string>('');

  /** Pairing navigation session (trip group + dates + code) — must match before network refresh replaces UI. */
  const detailSessionKeyRef = useRef<string | null>(null);
  /** Bumps on each `tripId` commit so late pairing fetches never apply after navigation. */
  const pairingDetailFetchGenRef = useRef(0);
  /** Persisted completeness — network hydrate must not downgrade the merged pairing. */
  const detailRenderScoreRef = useRef(0);
  /** Once a trip snapshot is shown, block async/network from replacing it (cache or first paint). */
  const detailPaintSealedRef = useRef(false);

  useEffect(() => {
    return () => {
      pairingDetailRegisterFrozenSurface(null);
    };
  }, []);

  useLayoutEffect(() => {
    pairingDetailFetchGenRef.current += 1;
    activeDetailTripIdRef.current = tripId ?? '';
    setPairingHotels([]);
    if (!tripId) {
      detailSessionKeyRef.current = null;
      detailRenderScoreRef.current = 0;
      detailPaintSealedRef.current = false;
      pairingDetailRegisterFrozenSurface(null);
      setTrip(undefined);
      setTripMeta(null);
      setLoadingTrip(false);
      return;
    }
    if (tripId.startsWith('demo-')) {
      detailSessionKeyRef.current = null;
      detailRenderScoreRef.current = 0;
      detailPaintSealedRef.current = false;
      pairingDetailRegisterFrozenSurface(null);
      setTrip(getMockTripById(tripId));
      setTripMeta(null);
      setLoadingTrip(false);
      return;
    }

    detailPaintSealedRef.current = false;
    pairingDetailRegisterFrozenSurface(null);
    detailSessionKeyRef.current = peekStashedPairingSnapshotKey(tripId) ?? null;
    detailRenderScoreRef.current = 0;
    setTripMeta(null);

    const pointer = peekStashedDetailPointer(tripId);
    const anchor = pointer?.selectedDateIso ?? null;
    const rowFallback = visibleRowFallbackForDetail(tripId);
    const monthKey =
      pointer?.selectedMonthKey ??
      (rowFallback ? monthCalendarKey(rowFallback.year, rowFallback.month) : null);
    const rowDate =
      pointer?.selectedDateIso ??
      (rowFallback?.startDate && /^\d{4}-\d{2}-\d{2}/.test(rowFallback.startDate)
        ? rowFallback.startDate.slice(0, 10)
        : null);

    if (monthKey) {
      const cached = readPairingDetailFromMonthCache(tripId, monthKey, rowDate);
      if (cached && canSealPairingSurface(cached)) {
        const navKey = pairingNavigationSessionKey(cached);
        detailSessionKeyRef.current = navKey;
        detailRenderScoreRef.current = scorePairingCompleteness(cached);
        detailPaintSealedRef.current = true;
        pairingDetailRegisterFrozenSurface(tripId);
        setTrip(cached);
        setLoadingTrip(false);
        return;
      }
    }

    const { pick: instantPick } = buildPairingFirstPaintDecision(
      tripId,
      anchor,
      rowFallback,
    );
    if (instantPick && canSealPairingSurface(instantPick.trip)) {
      const navKey = pairingNavigationSessionKey(instantPick.trip);
      detailSessionKeyRef.current = navKey;
      detailRenderScoreRef.current = scorePairingCompleteness(instantPick.trip);
      detailPaintSealedRef.current = true;
      pairingDetailRegisterFrozenSurface(tripId);
      setTrip(instantPick.trip);
      setLoadingTrip(false);
      return;
    }

    setTrip(undefined);
    setLoadingTrip(true);
  }, [tripId]);

  const display = useMemo(
    () => (trip ? mergeTripWithMetadataRow(trip, tripMeta) : undefined),
    [trip, tripMeta]
  );

  const vm = useMemo(() => (display ? buildTripDetailViewModel(display) : null), [display]);

  useEffect(() => {
    setPairingHotels([]);
    const pid = trip?.schedulePairingId?.trim();
    if (!pid || !UUID_RE.test(pid)) return;
    const sessionAtStart = detailSessionKeyRef.current;
    let cancelled = false;
    void fetchPairingDetailByPairingUuid(pid).then((b) => {
      if (cancelled || activeDetailTripIdRef.current !== tripId) return;
      if (
        sessionAtStart &&
        detailSessionKeyRef.current &&
        !pairingNavKeysSameTripAndCode(sessionAtStart, detailSessionKeyRef.current)
      ) {
        return;
      }
      if (b?.hotels?.length) {
        setPairingHotels(b.hotels);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [trip?.schedulePairingId, tripId]);

  const layoverHotelActive = useMemo(() => {
    if (!vm?.days.length || !display) {
      return {
        layoverCityLine: null as string | null,
        layoverRestLine: '—' as string,
        hotel: null as CrewScheduleHotelStub | null,
      };
    }
    const idx = Math.min(Math.max(0, selectedDayIndex), vm.days.length - 1);
    const activeDay = vm.days[idx]!;
    const layCity = layoverCityForActivePanel(activeDay, display);
    const restRaw = layoverRestRawForActivePanel(activeDay, display);
    const restLine = restRaw?.trim() ? formatLayoverColumnDisplay(restRaw) : '—';
    const hotel = hotelStubForActivePanel(pairingHotels, layCity, activeDay.dateIso, display.hotel);
    return { layoverCityLine: layCity, layoverRestLine: restLine, hotel };
  }, [vm, display, selectedDayIndex, pairingHotels]);

  useLayoutEffect(() => {
    setSelectedDayIndex(0);
    panelScrollAnimatedRef.current = false;
  }, [tripId]);

  useEffect(() => {
    if (!vm?.days.length) return;
    setSelectedDayIndex((i) => Math.max(0, Math.min(i, vm.days.length - 1)));
  }, [vm?.days.length]);

  useEffect(() => {
    if (!vm?.days.length || panelWidth <= 0) return;
    const idx = Math.min(selectedDayIndex, vm.days.length - 1);
    const animated = panelScrollAnimatedRef.current;
    panelScrollAnimatedRef.current = true;
    panelPagerRef.current?.scrollToOffset({ offset: idx * panelWidth, animated });
  }, [selectedDayIndex, vm?.days.length, panelWidth]);

  const getOperatingPanelLayout = useCallback(
    (_data: ArrayLike<TripDayViewModel> | null | undefined, index: number) => ({
      length: panelWidth,
      offset: panelWidth * index,
      index,
    }),
    [panelWidth],
  );

  const onOperatingPanelMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!vm?.days.length || panelWidth <= 0) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / panelWidth);
      if (idx < 0 || idx >= vm.days.length || idx === selectedDayIndex) return;
      panelScrollAnimatedRef.current = false;
      setSelectedDayIndex(idx);
    },
    [vm?.days.length, panelWidth, selectedDayIndex],
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!tripId || tripId.startsWith('demo-')) {
        return;
      }
      if (detailPaintSealedRef.current) {
        setLoadingTrip(false);
        return;
      }
      const fetchGenAtStart = pairingDetailFetchGenRef.current;

      const rowFallback = visibleRowFallbackForDetail(tripId);
      const resolved = await resolveRenderablePairingSnapshot(tripId, pairingUuidFromRoute ?? null, rowFallback);

      if (cancelled || activeDetailTripIdRef.current !== tripId || fetchGenAtStart !== pairingDetailFetchGenRef.current) {
        return;
      }

      if (resolved) {
        const navKey = pairingNavigationSessionKey(resolved.trip);
        if (detailSessionKeyRef.current && !pairingNavKeysSameTripAndCode(detailSessionKeyRef.current, navKey)) {
          setLoadingTrip(false);
          return;
        }
        let applied = false;
        setTrip((prev) => {
          if (detailPaintSealedRef.current && canSealPairingSurface(prev!)) {
            return prev!;
          }
          if (prev && shouldRejectWeakerPairingRender(prev, resolved.trip)) {
            if (canSealPairingSurface(prev)) {
              detailPaintSealedRef.current = true;
              pairingDetailRegisterFrozenSurface(tripId);
            }
            return prev;
          }
          detailRenderScoreRef.current = Math.max(
            detailRenderScoreRef.current,
            scorePairingCompleteness(resolved.trip),
          );
          detailSessionKeyRef.current = navKey;
          const sealNow = canSealPairingSurface(resolved.trip);
          detailPaintSealedRef.current = sealNow;
          if (sealNow) {
            pairingDetailRegisterFrozenSurface(tripId);
            const pointer = peekStashedDetailPointer(tripId);
            const mk = pointer?.selectedMonthKey ?? monthCalendarKey(resolved.trip.year, resolved.trip.month);
            const idk = readCommittedMonthSnapshot(mk)?.identityKey ?? 'enriched';
            storeDetailReadyPairingInMonthCaches(resolved.trip, idk, pointer?.selectedMonthKey ?? null);
          } else {
            pairingDetailRegisterFrozenSurface(null);
          }
          applied = true;
          return resolved.trip;
        });
        if (applied) {
          setTripMeta(resolved.meta);
        }
      } else {
        setTrip((prev) => (prev ? prev : undefined));
      }

      if (!cancelled && activeDetailTripIdRef.current === tripId && fetchGenAtStart === pairingDetailFetchGenRef.current) {
        setLoadingTrip(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [tripId, pairingUuidFromRoute]);

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

        <Text style={styles.h2}>Operating duties</Text>
        <TripDayTimelineNav
          days={vm.days}
          selectedDayIndex={selectedDayIndex}
          onSelectDay={setSelectedDayIndex}
        />

        {vm.days.length > 0 ? (
          <FlatList
            ref={panelPagerRef}
            data={vm.days}
            keyExtractor={(item) => item.panelId}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            decelerationRate="fast"
            getItemLayout={getOperatingPanelLayout}
            renderItem={({ item }) => (
              <View style={{ width: panelWidth }}>
                <TripDayDetailPanel
                  day={item}
                  legStatuses={legStatuses}
                  trackingLegId={trackingLegId}
                  onTrackLeg={(leg) => void trackLeg(leg, t)}
                />
              </View>
            )}
            onMomentumScrollEnd={onOperatingPanelMomentumEnd}
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                panelPagerRef.current?.scrollToOffset({
                  offset: index * panelWidth,
                  animated: false,
                });
              }, 0);
            }}
          />
        ) : null}

        <Text style={styles.h2}>Layover & hotel</Text>
        <View style={styles.card}>
          <View style={styles.kv}>
            <Text style={styles.k}>Layover city</Text>
            <Text style={styles.v}>{layoverHotelActive.layoverCityLine?.trim() ? layoverHotelActive.layoverCityLine : '—'}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.k}>Layover total</Text>
            <Text style={styles.v}>{layoverHotelActive.layoverRestLine}</Text>
          </View>
          {layoverHotelActive.hotel?.name ? (
            <>
              <Text style={styles.hotelName}>{layoverHotelActive.hotel.name}</Text>
              {[layoverHotelActive.hotel.city, layoverHotelActive.hotel.address].filter(Boolean).length > 0 ? (
                <Text style={styles.meta}>
                  {[layoverHotelActive.hotel.city, layoverHotelActive.hotel.address].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {layoverHotelActive.hotel.phone?.trim() ? (
                <Text style={styles.meta}>{layoverHotelActive.hotel.phone.trim()}</Text>
              ) : null}
              {layoverHotelActive.hotel.shuttleNotes ? (
                <Text style={styles.note}>Shuttle · {layoverHotelActive.hotel.shuttleNotes}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.muted}>—</Text>
          )}
        </View>

        <View style={styles.crewSection}>
          <Text style={styles.h2}>Crew</Text>
          <View style={styles.card}>
            {vm.crewMembers.length > 0 ? (
              <TripCrewList members={vm.crewMembers} showTitle={false} />
            ) : (
              <Text style={styles.muted}>—</Text>
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
