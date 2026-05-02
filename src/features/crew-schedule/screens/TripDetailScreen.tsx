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
  fetchCrewScheduleTripByPairingUuid,
  fetchPairingDutiesForScheduleEntries,
  fetchPairingDetailByPairingUuid,
  fetchTripGroupEntries,
  fetchTripMetadataForGroup,
  mergeTripWithMetadataRow,
  resolveSchedulePairingDbIdByOverlap,
  type PairingDetailDbHotelRow,
  type ScheduleTripMetadataRow,
} from '../scheduleApi';
import { dutiesToCrewScheduleLegs } from '../jetblueFlicaImport';
import { entriesToSingleTrip } from '../tripMapper';
import { getMockTripById } from '../mockScheduleData';
import { tradePostPrefillParams } from '../tradePostPrefillParams';
import { peekStashedPairingSnapshotKey, peekStashedTripForDetail } from '../tripDetailNavCache';
import { pairingNavigationSessionKey } from '../scheduleStableSnapshots';
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

  useLayoutEffect(() => {
    activeDetailTripIdRef.current = tripId ?? '';
    setPairingHotels([]);
    if (!tripId) {
      detailSessionKeyRef.current = null;
      setTrip(undefined);
      setTripMeta(null);
      setLoadingTrip(false);
      return;
    }
    if (tripId.startsWith('demo-')) {
      detailSessionKeyRef.current = null;
      setTrip(getMockTripById(tripId));
      setTripMeta(null);
      setLoadingTrip(false);
      return;
    }
    const peeked = peekStashedTripForDetail(tripId);
    detailSessionKeyRef.current =
      peekStashedPairingSnapshotKey(tripId) ?? (peeked ? pairingNavigationSessionKey(peeked) : null);
    if (peeked) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[PAIRING_DETAIL_INITIAL_SNAPSHOT_USED]', {
          tripId,
          sessionKey: detailSessionKeyRef.current,
        });
      }
      setTrip(peeked);
      setTripMeta(null);
      setLoadingTrip(false);
    } else {
      setTrip(undefined);
      setTripMeta(null);
      setLoadingTrip(true);
    }
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
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[PAIRING_DETAIL_REFRESH_START]', { kind: 'hotels', tripId, pairingUuid: pid });
    }
    void fetchPairingDetailByPairingUuid(pid).then((b) => {
      if (cancelled || activeDetailTripIdRef.current !== tripId) return;
      if (sessionAtStart && detailSessionKeyRef.current !== sessionAtStart) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[PAIRING_DETAIL_REFRESH_REJECTED]', { kind: 'hotels', reason: 'session_key_changed' });
        }
        return;
      }
      if (b?.hotels?.length) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[PAIRING_DETAIL_REFRESH_COMMIT]', { kind: 'hotels', count: b.hotels.length });
        }
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
      if (UUID_RE.test(tripId)) {
        const stashed = peekStashedTripForDetail(tripId);
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[PAIRING_DETAIL_REFRESH_START]', { tripId, hadPeek: Boolean(stashed) });
        }
        try {
          let pairingDbId: string | undefined =
            (pairingUuidFromRoute && UUID_RE.test(pairingUuidFromRoute) ? pairingUuidFromRoute : undefined) ??
            (stashed?.schedulePairingId && UUID_RE.test(stashed.schedulePairingId)
              ? stashed.schedulePairingId
              : undefined);

          if (!pairingDbId && stashed) {
            pairingDbId =
              (await resolveSchedulePairingDbIdByOverlap({
                pairingCode: stashed.pairingCode,
                rangeStart: stashed.startDate,
                rangeEnd: stashed.endDate,
              })) ?? undefined;
          }

          if (cancelled || activeDetailTripIdRef.current !== tripId) return;

          if (!pairingDbId && !stashed && UUID_RE.test(tripId)) {
            pairingDbId = tripId;
          }

          const [fromNormalized, meta] = await Promise.all([
            pairingDbId ? fetchCrewScheduleTripByPairingUuid(pairingDbId) : Promise.resolve(null),
            fetchTripMetadataForGroup(tripId).catch(() => null),
          ]);
          if (cancelled || activeDetailTripIdRef.current !== tripId) return;
          if (fromNormalized) {
            const schedulePairingId = fromNormalized.schedulePairingId ?? pairingDbId ?? fromNormalized.id;
            const mergedForKey: CrewScheduleTrip = {
              ...fromNormalized,
              id: tripId,
              schedulePairingId,
            };
            const navKey = pairingNavigationSessionKey(mergedForKey);
            if (detailSessionKeyRef.current && navKey !== detailSessionKeyRef.current) {
              if (typeof __DEV__ !== 'undefined' && __DEV__) {
                console.log('[PAIRING_DETAIL_REFRESH_REJECTED]', {
                  tripId,
                  reason: 'navigation_session_mismatch',
                  expected: detailSessionKeyRef.current,
                  got: navKey,
                });
              }
              return;
            }
            if (
              typeof __DEV__ !== 'undefined' &&
              __DEV__ &&
              String(fromNormalized.pairingCode).trim().toUpperCase() === 'J1015' &&
              String(fromNormalized.startDate).slice(0, 7) <= '2026-05' &&
              String(fromNormalized.endDate).slice(0, 7) >= '2026-05'
            ) {
              console.log('[pairing-detail ui] TripDetailScreen fetchCrewScheduleTripByPairingUuid OK J1015', {
                tripGroupId: tripId,
                schedulePairingId,
                pairingBlockHours: fromNormalized.pairingBlockHours ?? null,
                crewLen: fromNormalized.crewMembers?.length ?? 0,
                hotelName: fromNormalized.hotel?.name ?? null,
                legsLen: fromNormalized.legs.length,
                firstLegRelease: fromNormalized.legs[0]?.releaseLocal ?? null,
              });
            }
            setTrip(mergedForKey);
            setTripMeta(meta);
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.log('[PAIRING_DETAIL_REFRESH_COMMIT]', { tripId, navKey });
            }
          } else if (!fromNormalized && stashed) {
            if (
              typeof __DEV__ !== 'undefined' &&
              __DEV__ &&
              UUID_RE.test(tripId) &&
              String(stashed.pairingCode).trim().toUpperCase() === 'J1015' &&
              String(stashed.startDate).slice(0, 7) <= '2026-05' &&
              String(stashed.endDate).slice(0, 7) >= '2026-05'
            ) {
              console.warn(
                '[pairing-detail ui] TripDetailScreen kept stashed trip — fetchCrewScheduleTripByPairingUuid was null (no DB bundle merge)',
                { tripId, pairingDbId: pairingDbId ?? null, stashedLegs: stashed.legs.length },
              );
            }
          }
          if (!fromNormalized && !stashed) {
            const [rows, metaLegacy] = await Promise.all([
              fetchTripGroupEntries(tripId),
              fetchTripMetadataForGroup(tripId).catch(() => null),
            ]);
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
            if (cancelled || activeDetailTripIdRef.current !== tripId) return;
            if (next) {
              const navKey = pairingNavigationSessionKey(next);
              if (detailSessionKeyRef.current && navKey !== detailSessionKeyRef.current) {
                if (typeof __DEV__ !== 'undefined' && __DEV__) {
                  console.log('[PAIRING_DETAIL_REFRESH_REJECTED]', {
                    tripId,
                    reason: 'legacy_session_mismatch',
                    expected: detailSessionKeyRef.current,
                    got: navKey,
                  });
                }
                return;
              }
              if (typeof __DEV__ !== 'undefined' && __DEV__) {
                console.log('[PAIRING_DETAIL_REFRESH_COMMIT]', { tripId, path: 'legacy_entries', navKey });
              }
            }
            setTrip(next);
            setTripMeta(metaLegacy);
          }
        } catch {
          if (!stashed && activeDetailTripIdRef.current === tripId) {
            setTrip(undefined);
            setTripMeta(null);
          } else if (typeof __DEV__ !== 'undefined' && __DEV__ && stashed) {
            console.log('[PREVENTED_BLANK_RENDER]', { screen: 'trip_detail', tripId, note: 'kept_stashed_or_peeked' });
          }
        } finally {
          if (!cancelled && activeDetailTripIdRef.current === tripId) setLoadingTrip(false);
        }
        return;
      }
      if (cancelled || activeDetailTripIdRef.current !== tripId) return;
      setTrip(getMockTripById(tripId));
      setTripMeta(null);
      setLoadingTrip(false);
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

  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    if (!vm || !display) return;
    if (String(display.pairingCode).trim().toUpperCase() !== 'J1015') return;
    const ds = String(display.startDate).slice(0, 7);
    const de = String(display.endDate).slice(0, 7);
    if (ds > '2026-05' || de < '2026-05') return;
    console.log('[pairing-detail ui] TripDetailScreen final vm J1015', {
      block: vm.statTiles.find((x) => x.id === 'block')?.value ?? null,
      credit: vm.statTiles.find((x) => x.id === 'credit')?.value ?? null,
      tafb: vm.statTiles.find((x) => x.id === 'tafb')?.value ?? null,
      layover: vm.statTiles.find((x) => x.id === 'layover')?.value ?? null,
      routeSummary: vm.routeSummary,
      crewCount: vm.crewMembers.length,
      layoverHotelPreview: vm.layoverHotelPreview,
      dayPanels: vm.days.length,
      firstDayLegs:
        vm.days[0]?.legs.map((l) => ({
          releaseLocal: l.releaseLocal ?? null,
          block: l.blockTimeLocal ?? null,
          equip: l.equipmentCode ?? null,
        })) ?? [],
    });
  }, [vm, display]);

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
