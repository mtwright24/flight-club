import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../../styles/theme';
import { useNotificationsBadge } from '../../../hooks/useNotificationsBadge';
import { useDmUnreadBadge } from '../../../hooks/useDmUnreadBadge';
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
import {
  buildTripDetailViewModel,
  formatDisplayDateRangeLabelWithDow,
  getDisplaySpanAndDutyDayCount,
  type TripDayViewModel,
} from '../tripDetailViewModel';
import { formatLayoverColumnDisplay } from '../scheduleTime';
import type { CrewScheduleHotelStub, CrewScheduleLeg, CrewScheduleTrip, ScheduleCrewMember } from '../types';
import CrewScheduleHeader from '../components/CrewScheduleHeader';

const FC_PREMIUM_RED = '#C8102E';
const FC_HOTEL_GREEN = '#0B3D2E';
const FC_HOTEL_GREEN_PANEL = 'rgba(255,255,255,0.08)';
const FC_STAT_REPORT = '#EA580C';
const FC_STAT_CREDIT = '#15803D';
const FC_STAT_MUTED = '#334155';

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

function routeSnippetForDay(day: TripDayViewModel): string {
  const legs = day.legs;
  if (!legs.length) return '—';
  const parts: string[] = [];
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i]!;
    if (i === 0) parts.push(String(l.departureAirport ?? '').trim() || '—');
    parts.push(String(l.arrivalAirport ?? '').trim() || '—');
  }
  return parts.join('→');
}

function primaryCityForPanel(
  day: TripDayViewModel,
  trip: CrewScheduleTrip,
  panelIndex: number,
  totalPanels: number,
): string {
  const lay = layoverCityForActivePanel(day, trip)?.trim();
  if (lay) return lay;
  const legs = day.legs;
  if (legs.length) {
    const last = legs[legs.length - 1]!;
    const arr = String(last.arrivalAirport ?? '').trim();
    if (arr) {
      const base = trip.base?.trim().toUpperCase() ?? '';
      const isLastPanel = totalPanels > 0 && panelIndex === totalPanels - 1;
      if (isLastPanel && base && arr.toUpperCase() === base) return trip.base!.trim();
      return arr;
    }
  }
  return '—';
}

function statTileValue(tiles: { id: string; value: string }[], id: string): string {
  return tiles.find((x) => x.id === id)?.value ?? '—';
}

function formatTimeForLegCard(raw: string | null | undefined): string {
  const s = raw?.trim();
  if (!s) return '—';
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  return s;
}

function DetailHeroHeaderRow(props: { onBack: () => void }) {
  const router = useRouter();
  const unread = useNotificationsBadge();
  const { count: dmUnread } = useDmUnreadBadge();
  const { onBack } = props;

  return (
    <View style={detailStyles.heroHeaderRow}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [detailStyles.heroIconBtn, pressed && detailStyles.heroIconBtnPressed]}
        accessibilityLabel="Back to schedule"
        hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
      >
        <Text style={detailStyles.heroBackLabel}>‹ Schedule</Text>
      </Pressable>
      <View style={detailStyles.heroHeaderRight}>
        <Pressable
          onPress={() => router.push('/search')}
          style={({ pressed }) => [detailStyles.heroIconBtn, pressed && detailStyles.heroIconBtnPressed]}
          accessibilityLabel="Search"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="search-outline" size={24} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => router.push('/notifications')}
          style={({ pressed }) => [detailStyles.heroIconBtn, pressed && detailStyles.heroIconBtnPressed]}
          accessibilityLabel="Notifications"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="notifications-outline" size={24} color="#fff" />
          {unread > 0 ? (
            <View style={detailStyles.heroBadge}>
              <Text style={detailStyles.heroBadgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => router.push('/messages-inbox')}
          style={({ pressed }) => [detailStyles.heroIconBtn, pressed && detailStyles.heroIconBtnPressed]}
          accessibilityLabel="Messages"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={24} color="#fff" />
          {dmUnread > 0 ? (
            <View style={detailStyles.heroBadge}>
              <Text style={detailStyles.heroBadgeText}>{dmUnread > 99 ? '99+' : dmUnread}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => router.push('/menu')}
          style={({ pressed }) => [detailStyles.heroIconBtn, pressed && detailStyles.heroIconBtnPressed]}
          accessibilityLabel="Menu"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="menu" size={24} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function PremiumFlightLegCard({
  leg,
  legStatusLine,
  trackingLegId,
  onTrackLeg,
}: {
  leg: CrewScheduleLeg;
  legStatusLine: string | null | undefined;
  trackingLegId: string | null;
  onTrackLeg: (leg: CrewScheduleLeg) => void;
}) {
  const dep = String(leg.departureAirport ?? '').trim() || '—';
  const arr = String(leg.arrivalAirport ?? '').trim() || '—';
  const fn = leg.flightNumber?.trim();
  const block = leg.blockTimeLocal?.trim();

  return (
    <View style={detailStyles.legCard}>
      <View style={detailStyles.legCardTop}>
        <View style={detailStyles.legCardTitleRow}>
          <Text style={detailStyles.legFlightNum}>{fn ? fn : '—'}</Text>
          {leg.isDeadhead ? (
            <View style={detailStyles.dhPill}>
              <Text style={detailStyles.dhPillText}>DH</Text>
            </View>
          ) : null}
        </View>
        {legStatusLine ? <Text style={detailStyles.legStatus}>{legStatusLine}</Text> : null}
      </View>

      <View style={detailStyles.legAirportRow}>
        <View style={detailStyles.legAirportCol}>
          <Text style={detailStyles.legAirportCode}>{dep}</Text>
          <Text style={detailStyles.legTime}>{formatTimeForLegCard(leg.departLocal)}</Text>
        </View>
        <View style={detailStyles.legPlaneRail}>
          <View style={detailStyles.legPlaneLine} />
          <Ionicons name="airplane" size={18} color={FC_PREMIUM_RED} style={{ marginHorizontal: 6 }} />
          <View style={detailStyles.legPlaneLine} />
        </View>
        <View style={[detailStyles.legAirportCol, { alignItems: 'flex-end' }]}>
          <Text style={detailStyles.legAirportCode}>{arr}</Text>
          <Text style={detailStyles.legTime}>{formatTimeForLegCard(leg.arriveLocal)}</Text>
        </View>
      </View>

      {(block || leg.releaseLocal || leg.equipmentCode) && (
        <View style={detailStyles.legMetaGrid}>
          {block ? (
            <View style={detailStyles.legMetaItem}>
              <Text style={detailStyles.legMetaK}>Block</Text>
              <Text style={detailStyles.legMetaV}>{block}</Text>
            </View>
          ) : null}
          {leg.releaseLocal?.trim() ? (
            <View style={detailStyles.legMetaItem}>
              <Text style={detailStyles.legMetaK}>D-END</Text>
              <Text style={detailStyles.legMetaV}>{formatTimeForLegCard(leg.releaseLocal)}</Text>
            </View>
          ) : null}
          {leg.equipmentCode?.trim() ? (
            <View style={detailStyles.legMetaItem}>
              <Text style={detailStyles.legMetaK}>Equipment</Text>
              <Text style={detailStyles.legMetaV}>{leg.equipmentCode.trim()}</Text>
            </View>
          ) : null}
        </View>
      )}

      {fn ? (
        <Pressable
          style={detailStyles.trackLegRow}
          onPress={() => onTrackLeg(leg)}
          disabled={trackingLegId === leg.id}
        >
          {trackingLegId === leg.id ? (
            <ActivityIndicator size="small" color={FC_PREMIUM_RED} />
          ) : (
            <Ionicons name="navigate-circle-outline" size={20} color={FC_PREMIUM_RED} />
          )}
          <Text style={detailStyles.trackLegText}>
            {trackingLegId === leg.id ? 'Opening flight tracker…' : 'Track this leg live'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={FC_PREMIUM_RED} />
        </Pressable>
      ) : null}
    </View>
  );
}

function OperatingDayLegsPage({
  day,
  legStatuses,
  trackingLegId,
  onTrackLeg,
  panelWidth,
}: {
  day: TripDayViewModel;
  legStatuses: Record<string, string>;
  trackingLegId: string | null;
  onTrackLeg: (leg: CrewScheduleLeg) => void;
  panelWidth: number;
}) {
  return (
    <View style={{ width: panelWidth, paddingHorizontal: 16 }}>
      {day.legs.length === 0 ? (
        <Text style={detailStyles.emptyLegs}>No flight legs on file for this day.</Text>
      ) : (
        day.legs.map((leg) => (
          <PremiumFlightLegCard
            key={leg.id}
            leg={leg}
            legStatusLine={legStatuses[leg.id]}
            trackingLegId={trackingLegId}
            onTrackLeg={onTrackLeg}
          />
        ))
      )}
    </View>
  );
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

    const { pick: instantPick } = buildPairingFirstPaintDecision(tripId, anchor, rowFallback);
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

  const citiesByPanel = useMemo(() => {
    if (!vm?.days.length || !display) return [];
    const n = vm.days.length;
    return vm.days.map((d, i) => primaryCityForPanel(d, display, i, n));
  }, [vm?.days, display]);

  const activeCity = citiesByPanel[selectedDayIndex] ?? '—';
  const contextCitiesLine = useMemo(() => {
    if (!citiesByPanel.length) return '';
    return citiesByPanel
      .filter((_, i) => i !== selectedDayIndex)
      .map((c) => c.trim())
      .filter(Boolean)
      .join(' • ');
  }, [citiesByPanel, selectedDayIndex]);

  const displaySpan = useMemo(
    () => (display ? getDisplaySpanAndDutyDayCount(display) : null),
    [display],
  );
  const dateRangeHero = useMemo(
    () =>
      displaySpan
        ? formatDisplayDateRangeLabelWithDow(displaySpan.displayStartDate, displaySpan.displayEndDate)
        : '—',
    [displaySpan],
  );

  const dutyDayCount = displaySpan?.dutyDayCount ?? 0;
  const metadataLine =
    dutyDayCount > 0
      ? `${vm?.pairingCode ?? '—'} • ${dutyDayCount}-Day Pairing`
      : `${vm?.pairingCode ?? '—'} • Pairing`;

  const selectedDayHasDh = useMemo(() => {
    if (!vm?.days.length) return false;
    const idx = Math.min(Math.max(0, selectedDayIndex), vm.days.length - 1);
    return (vm.days[idx]?.legs ?? []).some((l) => l.isDeadhead);
  }, [vm?.days, selectedDayIndex]);

  const reportForSelectedDay = useMemo(() => {
    if (!vm?.days.length) return '—';
    const idx = Math.min(Math.max(0, selectedDayIndex), vm.days.length - 1);
    const rep = vm.days[idx]!.legs.find((l) => l.reportLocal?.trim())?.reportLocal?.trim();
    return rep ? formatTimeForLegCard(rep) : '—';
  }, [vm?.days, selectedDayIndex]);

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

  const legsForSelectedCount = vm?.days.length
    ? vm.days[Math.min(selectedDayIndex, vm.days.length - 1)]?.legs.length ?? 0
    : 0;

  useEffect(() => {
    if (!__DEV__ || !vm) return;
    console.log('[PAIRING_DETAIL_REDESIGN_RENDER]', {
      pairingCode: vm.pairingCode,
      selectedDayIndex,
      activeCity,
      legsForDay: legsForSelectedCount,
      hasHotel: !!(layoverHotelActive.hotel?.name?.trim() || layoverHotelActive.hotel?.city?.trim()),
      crewCount: vm.crewMembers.length,
    });
  }, [
    vm?.pairingCode,
    selectedDayIndex,
    activeCity,
    legsForSelectedCount,
    layoverHotelActive.hotel?.name,
    layoverHotelActive.hotel?.city,
    vm?.crewMembers.length,
  ]);

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
    [router],
  );

  const openPost = useCallback(
    (tr: CrewScheduleTrip) => {
      router.push({
        pathname: '/crew-exchange/create-post',
        params: tradePostPrefillParams(tr),
      });
    },
    [router],
  );

  const goBackSchedule = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  if (!tripId) {
    return (
      <View style={detailStyles.shell}>
        <CrewScheduleHeader title="Trip detail" />
        <View style={detailStyles.empty}>
          <Text style={detailStyles.emptyTitle}>Trip not found</Text>
          <Text style={detailStyles.emptySub}>Missing trip id.</Text>
          <Pressable style={detailStyles.primaryBtn} onPress={() => router.back()}>
            <Text style={detailStyles.primaryBtnText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loadingTrip && !trip) {
    return (
      <View style={detailStyles.shell}>
        <CrewScheduleHeader title="Trip detail" />
        <View style={detailStyles.empty}>
          <Text style={detailStyles.emptyTitle}>Loading…</Text>
          <Text style={detailStyles.emptySub}>Loading trip details.</Text>
        </View>
      </View>
    );
  }

  if (!trip || !vm || !display) {
    return (
      <View style={detailStyles.shell}>
        <CrewScheduleHeader title="Trip detail" />
        <View style={detailStyles.empty}>
          <Text style={detailStyles.emptyTitle}>Trip not found</Text>
          <Text style={detailStyles.emptySub}>This trip may be outside the current month or was removed.</Text>
          <Pressable style={detailStyles.primaryBtn} onPress={() => router.back()}>
            <Text style={detailStyles.primaryBtnText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const t = display as CrewScheduleTrip;
  const blockVal = statTileValue(vm.statTiles, 'block');
  const creditVal = statTileValue(vm.statTiles, 'credit');
  const tafbVal = statTileValue(vm.statTiles, 'tafb');

  return (
    <View style={detailStyles.shell}>
      <ScrollView
        style={detailStyles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SafeAreaView edges={['top', 'left', 'right']} style={detailStyles.heroSafe}>
          <View style={detailStyles.heroBlock}>
            <DetailHeroHeaderRow onBack={goBackSchedule} />
            <Text style={detailStyles.heroMeta}>{metadataLine}</Text>
            <Text style={detailStyles.heroCity}>{activeCity}</Text>
            {contextCitiesLine.length > 0 ? (
              <Text style={detailStyles.heroContext} numberOfLines={2}>
                {contextCitiesLine}
              </Text>
            ) : null}
            <Text style={detailStyles.heroDates}>{dateRangeHero}</Text>
            <View style={detailStyles.heroPills}>
              {t.status === 'flying' ? (
                <View style={detailStyles.pill}>
                  <Text style={detailStyles.pillText}>Flying</Text>
                </View>
              ) : null}
              {selectedDayHasDh ? (
                <View style={[detailStyles.pill, detailStyles.pillDh]}>
                  <Text style={detailStyles.pillText}>DH</Text>
                </View>
              ) : null}
            </View>
          </View>
        </SafeAreaView>

        <View style={detailStyles.statsCardWrap}>
          <View style={detailStyles.statsCard}>
            <View style={detailStyles.statsCol}>
              <Text style={detailStyles.statsLabel}>REPORT</Text>
              <Text style={[detailStyles.statsValue, { color: FC_STAT_REPORT }]}>{reportForSelectedDay}</Text>
            </View>
            <View style={detailStyles.statsDivider} />
            <View style={detailStyles.statsCol}>
              <Text style={detailStyles.statsLabel}>BLOCK</Text>
              <Text style={[detailStyles.statsValue, { color: FC_STAT_MUTED }]}>{blockVal}</Text>
            </View>
            <View style={detailStyles.statsDivider} />
            <View style={detailStyles.statsCol}>
              <Text style={detailStyles.statsLabel}>CREDIT</Text>
              <Text style={[detailStyles.statsValue, { color: FC_STAT_CREDIT }]}>{creditVal}</Text>
            </View>
            <View style={detailStyles.statsDivider} />
            <View style={detailStyles.statsCol}>
              <Text style={detailStyles.statsLabel}>TAFB</Text>
              <Text style={[detailStyles.statsValue, { color: FC_STAT_MUTED }]}>{tafbVal}</Text>
            </View>
          </View>
        </View>

        <Text style={detailStyles.sectionLabel}>Operating days</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={detailStyles.dayChipScroll}
          keyboardShouldPersistTaps="handled"
        >
          {vm.days.map((d, i) => {
            const sel = i === selectedDayIndex;
            return (
              <Pressable
                key={d.panelId}
                onPress={() => {
                  panelScrollAnimatedRef.current = false;
                  setSelectedDayIndex(i);
                }}
                style={[detailStyles.dayChip, sel ? detailStyles.dayChipSelected : undefined]}
              >
                <Text style={[detailStyles.dayChipTitle, sel && detailStyles.dayChipTitleSel]}>
                  DAY {d.dayIndex}
                </Text>
                <Text style={[detailStyles.dayChipDate, sel && detailStyles.dayChipDateSel]}>
                  {d.dayLabel} {d.dateShort}
                </Text>
                <Text style={[detailStyles.dayChipRoute, sel && detailStyles.dayChipRouteSel]} numberOfLines={1}>
                  {routeSnippetForDay(d)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={detailStyles.progressSegments}>
          {vm.days.map((d, i) => (
            <View
              key={`prog-${d.panelId}`}
              style={[detailStyles.progressSegment, i === selectedDayIndex ? detailStyles.progressSegmentOn : undefined]}
            />
          ))}
        </View>

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
              <OperatingDayLegsPage
                day={item}
                legStatuses={legStatuses}
                trackingLegId={trackingLegId}
                onTrackLeg={(leg) => void trackLeg(leg, t)}
                panelWidth={panelWidth}
              />
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

        <Text style={detailStyles.sectionLabel}>Layover & hotel</Text>
        <View style={detailStyles.hotelCard}>
          <Text style={detailStyles.hotelCardTitle}>
            {layoverHotelActive.layoverCityLine?.trim() ? layoverHotelActive.layoverCityLine.trim() : '—'}
          </Text>
          <View style={detailStyles.hotelPanel}>
            <Text style={detailStyles.hotelPanelK}>Rest / layover</Text>
            <Text style={detailStyles.hotelPanelV}>{layoverHotelActive.layoverRestLine}</Text>
          </View>
          {layoverHotelActive.hotel?.name ? (
            <View style={detailStyles.hotelPanel}>
              <Text style={detailStyles.hotelPanelK}>Hotel</Text>
              <Text style={detailStyles.hotelPanelV}>{layoverHotelActive.hotel.name}</Text>
              {layoverHotelActive.hotel.phone?.trim() ? (
                <Text style={detailStyles.hotelPhone}>{layoverHotelActive.hotel.phone.trim()}</Text>
              ) : null}
            </View>
          ) : (
            <Text style={detailStyles.hotelMuted}>No hotel on file for this layover.</Text>
          )}
        </View>

        <Text style={detailStyles.sectionLabel}>Crew</Text>
        <View style={detailStyles.crewWrap}>
          {t.base?.trim() ? (
            <Text style={detailStyles.crewBaseLine}>Base · {t.base.trim()}</Text>
          ) : null}
          {vm.crewMembers.length > 0 ? (
            vm.crewMembers.map((c, i) => (
              <DetailCrewCard key={crewKey(c, i)} member={c} />
            ))
          ) : (
            <Text style={detailStyles.muted}></Text>
          )}
        </View>

        <Text style={detailStyles.sectionLabel}>Actions</Text>
        <View style={detailStyles.actionsCol}>
          <Pressable
            style={({ pressed }) => [detailStyles.ctaPrimary, pressed && detailStyles.ctaPrimaryPressed]}
            onPress={() => openPost(t)}
          >
            <Text style={detailStyles.ctaPrimaryText}>Post to Tradeboard</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>
          <View style={detailStyles.secondaryRow}>
            <SecondaryAction
              icon="chatbubbles-outline"
              label="Trip Chat"
              onPress={() => router.push({ pathname: '/crew-schedule/trip-chat', params: { tripId: t.id } })}
            />
            <SecondaryAction
              icon="alarm-outline"
              label="Set Alert"
              onPress={() => router.push({ pathname: '/crew-schedule/alerts', params: { tripId: t.id } })}
            />
          </View>
          <SecondaryAction
            icon="car-outline"
            label="Commute"
            onPress={() =>
              Alert.alert('Commute', 'Commute assist for this trip is not available yet.', [{ text: 'OK' }])
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}

function crewKey(c: ScheduleCrewMember, i: number) {
  return `${c.name}-${c.employeeId ?? ''}-${c.position}-${i}`;
}

function DetailCrewCard({ member }: { member: ScheduleCrewMember }) {
  return (
    <View style={detailStyles.crewCard}>
      <Text style={detailStyles.crewPos}>{member.position?.trim() || '—'}</Text>
      <View style={detailStyles.crewMid}>
        <Text style={detailStyles.crewName} numberOfLines={2}>
          {member.name?.trim() || '—'}
        </Text>
        {member.employeeId?.trim() ? (
          <Text style={detailStyles.crewEmp}>#{member.employeeId.trim()}</Text>
        ) : null}
      </View>
    </View>
  );
}

function SecondaryAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [detailStyles.secondaryBtn, pressed && detailStyles.secondaryBtnPressed]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={FC_PREMIUM_RED} />
      <Text style={detailStyles.secondaryBtnText}>{label}</Text>
    </Pressable>
  );
}

const detailStyles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  scroll: { flex: 1 },
  heroSafe: {
    backgroundColor: FC_PREMIUM_RED,
  },
  heroBlock: {
    backgroundColor: FC_PREMIUM_RED,
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
    paddingBottom: 36,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    minHeight: 44,
  },
  heroBackLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  heroHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroIconBtn: {
    minWidth: 40,
    minHeight: 40,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroIconBtnPressed: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 22 },
  heroBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.dangerRed,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    zIndex: 2,
  },
  heroBadgeText: {
    color: colors.cardBg,
    fontSize: 9,
    fontWeight: '800',
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  heroCity: {
    color: '#fff',
    fontSize: 44,
    fontWeight: '900',
    marginTop: 10,
    letterSpacing: -0.5,
  },
  heroContext: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  heroDates: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 14,
  },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pillDh: { backgroundColor: 'rgba(255,255,255,0.28)' },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  statsCardWrap: {
    marginTop: -22,
    paddingHorizontal: 16,
    zIndex: 2,
    marginBottom: 8,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'stretch',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.12,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  statsCol: { flex: 1, alignItems: 'center', minWidth: 0, paddingHorizontal: 2 },
  statsDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: T.line,
    marginVertical: 4,
  },
  statsLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: T.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  statsValue: { fontSize: 14, fontWeight: '900' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },
  dayChipScroll: { paddingHorizontal: 12, gap: 10, paddingBottom: 4 },
  dayChip: {
    width: 128,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    backgroundColor: '#fff',
  },
  dayChipSelected: {
    backgroundColor: FC_PREMIUM_RED,
    borderColor: FC_PREMIUM_RED,
  },
  dayChipTitle: { fontSize: 11, fontWeight: '800', color: T.textSecondary, letterSpacing: 0.6 },
  dayChipTitleSel: { color: 'rgba(255,255,255,0.9)' },
  dayChipDate: { fontSize: 13, fontWeight: '800', color: T.text, marginTop: 6 },
  dayChipDateSel: { color: '#fff' },
  dayChipRoute: { fontSize: 12, fontWeight: '700', color: T.textSecondary, marginTop: 4 },
  dayChipRouteSel: { color: 'rgba(255,255,255,0.92)' },
  progressSegments: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 4,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  progressSegmentOn: {
    backgroundColor: FC_PREMIUM_RED,
  },
  emptyLegs: { fontSize: 14, color: T.textSecondary, paddingVertical: 12 },
  legCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  legCardTop: { marginBottom: 8 },
  legCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  legFlightNum: { fontSize: 16, fontWeight: '900', color: T.text },
  dhPill: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dhPillText: { fontSize: 11, fontWeight: '800', color: '#3730A3' },
  legStatus: { fontSize: 12, fontWeight: '700', color: '#1D4ED8', marginTop: 4 },
  legAirportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  legAirportCol: { flex: 1, minWidth: 0 },
  legAirportCode: { fontSize: 26, fontWeight: '900', color: T.text, letterSpacing: -0.5 },
  legTime: { fontSize: 14, fontWeight: '700', color: T.textSecondary, marginTop: 4 },
  legPlaneRail: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, paddingHorizontal: 4 },
  legPlaneLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: T.line, minWidth: 12 },
  legMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.line,
  },
  legMetaItem: { minWidth: '28%' },
  legMetaK: { fontSize: 10, fontWeight: '800', color: T.textSecondary, textTransform: 'uppercase' },
  legMetaV: { fontSize: 13, fontWeight: '800', color: T.text, marginTop: 2 },
  trackLegRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFF5F5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(200,16,46,0.25)',
  },
  trackLegText: { flex: 1, fontSize: 14, fontWeight: '800', color: FC_PREMIUM_RED },
  hotelCard: {
    marginHorizontal: 16,
    backgroundColor: FC_HOTEL_GREEN,
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  hotelCardTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 12 },
  hotelPanel: {
    backgroundColor: FC_HOTEL_GREEN_PANEL,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  hotelPanelK: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },
  hotelPanelV: { fontSize: 15, fontWeight: '800', color: '#fff', marginTop: 6 },
  hotelPhone: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.95)', marginTop: 8 },
  hotelMuted: { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontStyle: 'italic' },
  crewWrap: { paddingHorizontal: 16, marginBottom: 8 },
  crewBaseLine: { fontSize: 12, fontWeight: '700', color: T.textSecondary, marginBottom: 10 },
  crewCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 12,
  },
  crewPos: {
    fontSize: 12,
    fontWeight: '900',
    color: FC_PREMIUM_RED,
    minWidth: 36,
  },
  crewMid: { flex: 1, minWidth: 0 },
  crewName: { fontSize: 14, fontWeight: '800', color: T.text },
  crewEmp: { fontSize: 12, fontWeight: '700', color: T.textSecondary, marginTop: 4 },
  muted: { fontSize: 14, color: T.textSecondary },
  actionsCol: { paddingHorizontal: 16, gap: 12, paddingBottom: 8 },
  ctaPrimary: {
    backgroundColor: FC_PREMIUM_RED,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctaPrimaryPressed: { opacity: 0.92 },
  ctaPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(200,16,46,0.35)',
  },
  secondaryBtnPressed: { backgroundColor: '#FFF5F5' },
  secondaryBtnText: { fontSize: 14, fontWeight: '800', color: T.text },
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
