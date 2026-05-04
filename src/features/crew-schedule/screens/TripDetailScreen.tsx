import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';
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
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../../styles/theme';
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

/** Mockup pairing detail — header, day chips, leg accents */
const FC_PREMIUM_RED = '#C4121A';
/** Brick / off-red for track CTA (lighter than hero #C4121A; must read red on device, not near-black). */
const FC_TRACK_MUTED_RED = '#B04447';
/** Inline so tint always wins over any cached StyleSheet flattening. */
const TRACK_LEG_TITLE_COLOR: TextStyle = { color: FC_TRACK_MUTED_RED };
const FC_TIMELINE_BLUE = '#2563EB';
const FC_LEG_BLOCK_GREEN = '#15803D';
/** Layover card: deep forest green + faint lighter bubble (mockup 2) */
const FC_HOTEL_GREEN = '#0E3D2F';
const FC_HOTEL_BUBBLE = 'rgba(46, 168, 135, 0.22)';
const FC_HOTEL_INNER = 'rgba(0, 0, 0, 0.2)';
const FC_HOTEL_INNER_DEEP = 'rgba(0, 0, 0, 0.28)';
const FC_HOTEL_PHONE_NUM = '#7DD3FC';
const FC_STAT_REPORT = '#C4621A';
const FC_STAT_CREDIT = '#166534';
const FC_STAT_BLACK = '#000000';

/** Mockup weight tokens — use these instead of ad-hoc bold. */
const FONT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** iOS system scale per mockup (SF Pro Display on iOS). */
const TYPE_FACE: TextStyle = Platform.select<TextStyle>({
  ios: { fontFamily: 'SF Pro Display' },
  android: { fontFamily: 'sans-serif' },
  default: {},
});

/** Red hero title + subtitles: SF Pro Text reads closer to mockup than Display at large sizes. */
const HERO_SANS: TextStyle = Platform.select<TextStyle>({
  ios: { fontFamily: 'SF Pro Text' },
  android: { fontFamily: 'sans-serif' },
  default: {},
});

/** Tabular lining figures for times (non-stats rows). */
const MOCKUP_TABULAR: TextStyle = Platform.select<TextStyle>({
  ios: { fontVariant: ['tabular-nums'] },
  android: { fontFeatureSettings: 'tnum' },
  default: {},
});

/** Monospace stack for stats values (aviation-style times). */
const STATS_VALUE_FONT: TextStyle = Platform.select<TextStyle>({
  ios: { fontFamily: 'Menlo' },
  android: { fontFamily: 'monospace' },
  default: { fontFamily: 'monospace' },
});

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

function layoverCityOnlyForDayChip(day: TripDayViewModel, trip: CrewScheduleTrip): string {
  const c = layoverCityForActivePanel(day, trip)?.trim();
  return c && c.length > 0 ? c : '—';
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
  if (s.includes('T') || (s.length > 7 && /\d{4}-\d{2}-\d{2}/.test(s))) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    return '—';
  }
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  return s;
}

function chipDateLabel(dateIso: string): string {
  const iso = String(dateIso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Display "B6 523" / "AF 334" style; avoids rendering weird raw tokens as a title. */
function formatFlightNumberForDisplay(raw: string | null | undefined): string {
  const s = raw?.trim();
  if (!s) return '—';
  const alNum = s.match(/^([A-Za-z]{1,2})\s*0*(\d{1,5})\s*$/);
  if (alNum) return `${alNum[1]!.toUpperCase()} ${alNum[2]}`;
  const spaced = s.match(/^([A-Za-z]{1,2})(\d{2,5})$/);
  if (spaced) return `${spaced[1]!.toUpperCase()} ${spaced[2]}`;
  const digitsOnly = s.match(/^0*(\d{2,5})$/);
  if (digitsOnly) return `B6 ${digitsOnly[1]}`;
  if (s.length <= 20 && /^[\w\s\-/]+$/i.test(s)) return s;
  return '—';
}

function formatBlockStatForLegGrid(raw: string | null | undefined): string {
  const s = raw?.trim();
  if (!s) return '—';
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [a, b] = s.split(':');
    return `${String(Number(a)).padStart(2, '0')}:${b}`;
  }
  return s;
}

function formatBlockDurationCenter(block: string | null | undefined): string | null {
  const s = block?.trim();
  if (!s) return null;
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [a, b] = s.split(':');
    return `${Number(a)}h ${b.padStart(2, '0')}m`;
  }
  if (/^\d{4}$/.test(s)) {
    return `${Number(s.slice(0, 2))}h ${s.slice(2)}m`;
  }
  return s;
}

function looksLikeScheduleNoteHotel(text: string | null | undefined): boolean {
  const s = String(text ?? '').trim();
  if (!s) return false;
  if (/\d{3,4}\s*[Ll]\b/.test(s)) return true;
  if (/\(NR\b/i.test(s)) return true;
  if (/^\d[\d:]*\s*[\[(]?[A-Z]{1,4}/.test(s)) return true;
  return false;
}

/** Dot-separated remaining stations: unique cities in panel order, excluding the active city. */
function heroContextCitiesLine(citiesByPanel: string[], selectedDayIndex: number): string {
  if (!citiesByPanel.length) return '';
  const active = (citiesByPanel[Math.min(Math.max(0, selectedDayIndex), citiesByPanel.length - 1)] ?? '')
    .trim();
  const ordered: string[] = [];
  for (const c of citiesByPanel) {
    const t = String(c ?? '')
      .trim()
      .toUpperCase();
    if (!t || t === '—') continue;
    if (!ordered.includes(t)) ordered.push(t);
  }
  if (!active || active === '—') {
    return ordered.join(' • ');
  }
  const activeU = active.toUpperCase();
  const ctx = ordered.filter((c) => c !== activeU);
  return ctx.join(' • ');
}

/** Phones at or below “standard” width (not Pro Max): slightly denser leg tile, same hierarchy. */
const DETAIL_COMPACT_MAX_WIDTH = 393;

/** Horizontal gap between operating-day chips; width computed so ~4 fit in the viewport. */
const OPERATING_DAY_CHIP_GAP = 6;
const OPERATING_DAY_SCROLL_PAD_X = 12;

function PremiumFlightLegCard({
  leg,
  legStatusLine,
  trackingLegId,
  onTrackLeg,
  layoutCompact,
}: {
  leg: CrewScheduleLeg;
  legStatusLine: string | null | undefined;
  trackingLegId: string | null;
  onTrackLeg: (leg: CrewScheduleLeg) => void;
  layoutCompact: boolean;
}) {
  const [legMainHeight, setLegMainHeight] = useState(0);
  const dep = String(leg.departureAirport ?? '').trim() || '—';
  const arr = String(leg.arrivalAirport ?? '').trim() || '—';
  const fnDisplay = formatFlightNumberForDisplay(leg.flightNumber);
  const blockDuration = formatBlockDurationCenter(leg.blockTimeLocal);
  const equip = leg.equipmentCode?.trim() ? leg.equipmentCode.trim() : '—';
  const blockStat = formatBlockStatForLegGrid(leg.blockTimeLocal);
  const diffStat = leg.isDeadhead ? '—' : '+0';
  const dutyEndStat = formatTimeForLegCard(leg.releaseLocal);
  const tailStat = equip !== '—' ? equip : '—';
  const depTG = (leg.departureTerminalGate ?? '').trim();
  const arrTG = (leg.arrivalTerminalGate ?? '').trim();
  const showTerminalRow = depTG.length > 0 || arrTG.length > 0;
  const legStatusGreen = /on\s*time|✓|delayed?\s*ok/i.test(String(legStatusLine ?? ''));
  const blockValueColorStyle = leg.isDeadhead ? undefined : detailStyles.legMetaVGreen;
  const showTrack = Boolean(leg.flightNumber?.trim());
  const accentH =
    legMainHeight > 0 ? Math.max(44, Math.round(legMainHeight * 0.25)) : 52;

  const c = layoutCompact;

  const legMain = (
    <View
      style={detailStyles.legCardMainMeasure}
      onLayout={(e) => setLegMainHeight(e.nativeEvent.layout.height)}
    >
      <View style={[detailStyles.legTopStrip, c && { gap: 5 }]}>
        <View style={[detailStyles.legTopLeft, c && { gap: 5 }]}>
          <Text style={[detailStyles.legFlightNum, c && { fontSize: 11 }]}>{fnDisplay}</Text>
          {leg.isDeadhead ? (
            <View style={[detailStyles.dhPill, c && detailStyles.legPillCompact]}>
              <Text style={[detailStyles.dhPillText, c && { fontSize: 10 }]}>DH</Text>
            </View>
          ) : (
            <View style={[detailStyles.workingPill, c && detailStyles.legPillCompact]}>
              <Text style={[detailStyles.workingPillText, c && { fontSize: 9 }]}>Working</Text>
            </View>
          )}
        </View>
        {legStatusLine ? (
          <View style={detailStyles.legStatusRightCluster}>
            <Text
              style={[detailStyles.legStatusRight, legStatusGreen ? detailStyles.legStatusOnTime : detailStyles.legStatusPay]}
              numberOfLines={1}
            >
              {legStatusLine}
            </Text>
            {legStatusGreen ? <Ionicons name="checkmark-circle" size={c ? 13 : 14} color="#15803D" /> : null}
          </View>
        ) : (
          <View style={detailStyles.legStatusRightSpacer} />
        )}
      </View>

      <View style={detailStyles.legHeaderDivider} />

      <View style={detailStyles.legAirportRow}>
        <View style={detailStyles.legAirportCol}>
          <Text
            style={[detailStyles.legAirportCode, c && { fontSize: 18, letterSpacing: -0.18 }]}
            numberOfLines={1}
            adjustsFontSizeToFit={c}
            minimumFontScale={c ? 0.82 : 1}
          >
            {dep}
          </Text>
          <Text style={[detailStyles.legTime, c && { fontSize: 13, marginTop: 2 }]}>
            {formatTimeForLegCard(leg.departLocal)}
          </Text>
          {showTerminalRow ? (
            <Text style={[detailStyles.legTerminalGate, { textAlign: 'left' }]} numberOfLines={1}>
              {depTG || ' '}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            detailStyles.legPlaneColumn,
            !blockDuration && detailStyles.legPlaneColumnTight,
            c ? detailStyles.legPlaneColumnCompact : null,
          ]}
        >
          {blockDuration ? (
            <Text style={[detailStyles.legDurationCenter, c && { fontSize: 10, marginBottom: 4, lineHeight: 13 }]}>
              {blockDuration}
            </Text>
          ) : null}
          <View style={detailStyles.legPlaneRail}>
            <View style={detailStyles.legTimelineDot} />
            <View style={detailStyles.legPlaneLine} />
            <Ionicons name="airplane" size={c ? 12 : 13} color={FC_TIMELINE_BLUE} style={{ marginHorizontal: c ? 3 : 4 }} />
            <View style={detailStyles.legPlaneLine} />
            <View style={detailStyles.legTimelineDot} />
          </View>
          <Text style={[detailStyles.legNonStop, c && { fontSize: 9, marginTop: 3, lineHeight: 12 }]}>Non-stop</Text>
        </View>
        <View style={[detailStyles.legAirportCol, { alignItems: 'flex-end' }]}>
          <Text
            style={[detailStyles.legAirportCode, c && { fontSize: 18, letterSpacing: -0.18 }]}
            numberOfLines={1}
            adjustsFontSizeToFit={c}
            minimumFontScale={c ? 0.82 : 1}
          >
            {arr}
          </Text>
          <Text style={[detailStyles.legTime, c && { fontSize: 13, marginTop: 2 }]}>
            {formatTimeForLegCard(leg.arriveLocal)}
          </Text>
          {showTerminalRow ? (
            <Text style={[detailStyles.legTerminalGate, { textAlign: 'right' }]} numberOfLines={1}>
              {arrTG || ' '}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={[detailStyles.legMetaRow, c && { marginTop: 10, paddingTop: 10 }]}>
        <View style={detailStyles.legMetaCell}>
          <Text style={[detailStyles.legMetaK, c && { fontSize: 9 }]}>BLOCK</Text>
          <Text
            style={[
              detailStyles.legMetaV,
              blockValueColorStyle,
              c && { fontSize: 11, marginTop: 3 },
            ]}
          >
            {blockStat}
          </Text>
        </View>
        <View style={[detailStyles.legMetaCell, detailStyles.legMetaCellDivider]}>
          <Text style={[detailStyles.legMetaK, c && { fontSize: 9 }]}>DIFF</Text>
          <Text style={[detailStyles.legMetaV, c && { fontSize: 11, marginTop: 3 }]}>{diffStat}</Text>
        </View>
        <View style={[detailStyles.legMetaCell, detailStyles.legMetaCellDivider]}>
          <Text style={[detailStyles.legMetaK, c && { fontSize: 9 }]}>D-END</Text>
          <Text style={[detailStyles.legMetaV, c && { fontSize: 11, marginTop: 3 }]}>{dutyEndStat}</Text>
        </View>
        <View style={[detailStyles.legMetaCell, detailStyles.legMetaCellDivider]}>
          <Text style={[detailStyles.legMetaK, c && { fontSize: 9 }]}>TAIL</Text>
          <Text style={[detailStyles.legMetaV, c && { fontSize: 11, marginTop: 3 }]}>{tailStat}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={detailStyles.legCard}>
      <View style={detailStyles.legCardUpperRow}>
        <View style={detailStyles.legCardAccentRail}>
          <View style={[detailStyles.legCardAccent, { height: accentH }]} />
        </View>
        <View
          style={[
            detailStyles.legCardBody,
            c && { paddingHorizontal: 11, paddingVertical: 11 },
          ]}
        >
          {legMain}
        </View>
      </View>
      {showTrack ? (
        <Pressable
          style={[detailStyles.trackLegInCard, c && detailStyles.trackLegInCardCompact]}
          onPress={() => onTrackLeg(leg)}
          disabled={trackingLegId === leg.id}
        >
          {trackingLegId === leg.id ? (
            <View style={detailStyles.trackLegLoadingRow}>
              <ActivityIndicator size="small" color={FC_TRACK_MUTED_RED} />
              <Text style={[detailStyles.trackLegTitle, TRACK_LEG_TITLE_COLOR, { flex: 1 }]}>
                Opening flight tracker…
              </Text>
            </View>
          ) : (
            <>
              <View style={detailStyles.trackLegIconCluster}>
                <Ionicons name="pin" size={c ? 16 : 17} color={FC_TRACK_MUTED_RED} />
                <Ionicons name="airplane" size={c ? 14 : 15} color={FC_TIMELINE_BLUE} />
              </View>
              <View style={detailStyles.trackLegCopy}>
                <Text style={[detailStyles.trackLegTitle, TRACK_LEG_TITLE_COLOR, c && { fontSize: 13 }]}>
                  Track This Leg Live
                </Text>
                <Text style={detailStyles.trackLegSub}>Real-time · Gate alerts · Delay status</Text>
              </View>
              <Ionicons name="chevron-forward" size={c ? 16 : 17} color={FC_TRACK_MUTED_RED} />
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

function DayProgressWithThumb({
  dayCount,
  selectedIndex,
}: {
  dayCount: number;
  selectedIndex: number;
}) {
  if (dayCount <= 0) return null;
  const segWidthPct = 100 / dayCount;
  const centerPct = (selectedIndex + 0.5) * segWidthPct;
  return (
    <View style={detailStyles.progressWrap}>
      <View style={detailStyles.progressTrackBg}>
        <View
          style={[
            detailStyles.progressTrackFill,
            { width: `${Math.min(100, (selectedIndex + 1) * segWidthPct)}%` },
          ]}
        />
        <View style={[detailStyles.progressThumb, { left: `${centerPct}%` }]} />
      </View>
    </View>
  );
}

function OperatingDayLegsPage({
  day,
  legStatuses,
  trackingLegId,
  onTrackLeg,
  panelWidth,
  layoutCompact,
}: {
  day: TripDayViewModel;
  legStatuses: Record<string, string>;
  trackingLegId: string | null;
  onTrackLeg: (leg: CrewScheduleLeg) => void;
  panelWidth: number;
  layoutCompact: boolean;
}) {
  return (
    <View
      style={{
        width: panelWidth,
        paddingHorizontal: layoutCompact ? 14 : 16,
        paddingTop: layoutCompact ? 6 : 8,
      }}
    >
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
            layoutCompact={layoutCompact}
          />
        ))
      )}
    </View>
  );
}

export default function TripDetailScreen() {
  const router = useRouter();
  const navigation = useNavigation();
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
  const detailLayoutCompact = panelWidth > 0 && panelWidth <= DETAIL_COMPACT_MAX_WIDTH;
  const operatingDayChipWidth = useMemo(() => {
    const scrollPad = OPERATING_DAY_SCROLL_PAD_X * 2;
    if (panelWidth <= scrollPad + 32) return 76;
    return Math.max(
      76,
      Math.floor((panelWidth - scrollPad - 3 * OPERATING_DAY_CHIP_GAP) / 4),
    );
  }, [panelWidth]);
  const operatingDaySnapInterval = operatingDayChipWidth + OPERATING_DAY_CHIP_GAP;
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

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      const hideHeader = { headerShown: false as const, title: '' };
      navigation.setOptions(hideHeader);
      let p = navigation as {
        setOptions?: (o: { headerShown: boolean; title: string }) => void;
        getParent?: () => unknown;
      };
      let depth = 0;
      while (p && depth < 5) {
        p.setOptions?.(hideHeader);
        p = p.getParent?.() as typeof p;
        depth += 1;
      }
      return () => setStatusBarStyle('dark');
    }, [navigation]),
  );

  useLayoutEffect(() => {
    const hideHeader = { headerShown: false as const, title: '' };
    navigation.setOptions(hideHeader);
  }, [navigation]);

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
  const contextCitiesLine = useMemo(
    () => heroContextCitiesLine(citiesByPanel, selectedDayIndex),
    [citiesByPanel, selectedDayIndex],
  );

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
        contentContainerStyle={{ paddingBottom: insets.bottom + 22 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' as const } : {})}
      >
        <View style={[detailStyles.heroSafe, { paddingTop: insets.top + 6 }]}>
          <View style={detailStyles.heroContent}>
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
                  <Ionicons name="airplane" size={13} color="#fff" style={{ marginRight: 5 }} />
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
        </View>

        <View style={detailStyles.statsCardWrap}>
          <View style={detailStyles.statsCard}>
            <View style={detailStyles.statsCol}>
              <Text style={detailStyles.statsLabel}>REPORT</Text>
              <Text
                style={[detailStyles.statsValue, { color: FC_STAT_REPORT }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {reportForSelectedDay}
              </Text>
            </View>
            <View style={detailStyles.statsDivider} />
            <View style={detailStyles.statsCol}>
              <Text style={detailStyles.statsLabel}>BLOCK</Text>
              <Text
                style={[detailStyles.statsValue, { color: FC_STAT_BLACK }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {blockVal}
              </Text>
            </View>
            <View style={detailStyles.statsDivider} />
            <View style={detailStyles.statsCol}>
              <Text style={detailStyles.statsLabel}>CREDIT</Text>
              <Text
                style={[detailStyles.statsValue, { color: FC_STAT_CREDIT }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {creditVal}
              </Text>
            </View>
            <View style={detailStyles.statsDivider} />
            <View style={detailStyles.statsCol}>
              <Text style={detailStyles.statsLabel}>TAFB</Text>
              <Text
                style={[detailStyles.statsValue, { color: FC_STAT_BLACK }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {tafbVal}
              </Text>
            </View>
          </View>
        </View>

        <Text style={detailStyles.sectionLabel}>Operating days</Text>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          decelerationRate="fast"
          snapToInterval={operatingDaySnapInterval}
          snapToAlignment="start"
          disableIntervalMomentum
          contentContainerStyle={[
            detailStyles.dayChipScroll,
            { gap: OPERATING_DAY_CHIP_GAP, paddingHorizontal: OPERATING_DAY_SCROLL_PAD_X },
          ]}
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
                style={[
                  detailStyles.dayChip,
                  { width: operatingDayChipWidth },
                  sel ? detailStyles.dayChipSelected : undefined,
                ]}
              >
                <Text style={[detailStyles.dayChipTitle, sel && detailStyles.dayChipTitleSel]}>
                  DAY {d.dayIndex}
                </Text>
                <Text style={[detailStyles.dayChipDate, sel && detailStyles.dayChipDateSel]}>
                  {chipDateLabel(d.dateIso)}
                </Text>
                <Text
                  style={[detailStyles.dayChipLayover, sel && detailStyles.dayChipLayoverSel]}
                  numberOfLines={1}
                >
                  {layoverCityOnlyForDayChip(d, t)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <DayProgressWithThumb dayCount={vm.days.length} selectedIndex={selectedDayIndex} />

        {vm.days[Math.min(selectedDayIndex, vm.days.length - 1)] ? (
          <View
            style={[
              detailStyles.selectedDayBar,
              detailLayoutCompact && detailStyles.selectedDayBarCompact,
            ]}
          >
            <View style={detailStyles.selectedDayBarLeft}>
              <View style={detailStyles.dayIndexPill}>
                <Text style={detailStyles.dayIndexPillText}>
                  {`DAY ${vm.days[Math.min(selectedDayIndex, vm.days.length - 1)]!.dayIndex}`}
                </Text>
              </View>
              <Text
                style={[
                  detailStyles.selectedDayBarDate,
                  detailLayoutCompact && detailStyles.selectedDayBarDateCompact,
                ]}
              >
                {(() => {
                  const d = vm.days[Math.min(selectedDayIndex, vm.days.length - 1)]!;
                  const iso = d.dateIso.slice(0, 10);
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return d.dateShort;
                  const dt = new Date(`${iso}T12:00:00`);
                  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                })()}
              </Text>
            </View>
            <Text
              style={[
                detailStyles.selectedDayBarRpt,
                detailLayoutCompact && detailStyles.selectedDayBarRptCompact,
              ]}
            >
              {reportForSelectedDay !== '—' ? `Rpt ${reportForSelectedDay}` : ''}
            </Text>
          </View>
        ) : null}
        {vm.days.length > 0 ? (
          <FlatList
            style={{ marginBottom: 6 }}
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
                layoutCompact={detailLayoutCompact}
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
          <View style={detailStyles.hotelBubble} pointerEvents="none" />
          <Text style={detailStyles.hotelKicker}>LAYOVER CITY</Text>
          <Text style={detailStyles.hotelCardTitle}>
            {layoverHotelActive.layoverCityLine?.trim()
              ? layoverHotelActive.layoverCityLine.trim()
              : layoverHotelActive.hotel?.city?.trim() || 'Layover'}
          </Text>
          {layoverHotelActive.hotel?.city?.trim() &&
          layoverHotelActive.layoverCityLine?.trim() &&
          layoverHotelActive.hotel.city.trim().toUpperCase() !==
            layoverHotelActive.layoverCityLine.trim().toUpperCase() ? (
            <Text style={detailStyles.hotelSubtitle}>
              {layoverHotelActive.layoverCityLine.trim()} · {layoverHotelActive.hotel.city.trim()}
            </Text>
          ) : null}
          {(() => {
            const restText =
              layoverHotelActive.layoverRestLine === '—'
                ? 'Not available'
                : layoverHotelActive.layoverRestLine || '—';
            const rawName = layoverHotelActive.hotel?.name?.trim();
            const hotelVal = !rawName
              ? 'Not listed'
              : looksLikeScheduleNoteHotel(rawName)
                ? formatLayoverColumnDisplay(rawName)
                : rawName;
            const infoVal =
              rawName && !looksLikeScheduleNoteHotel(rawName) && layoverHotelActive.hotel?.phone?.trim()
                ? layoverHotelActive.hotel.phone.trim()
                : '—';
            const previewLine =
              hotelVal !== 'Not listed' ? hotelVal : '—';
            const previewSub = !rawName
              ? ''
              : looksLikeScheduleNoteHotel(rawName)
                ? 'Schedule note'
                : 'Hotel on file';
            return (
              <>
                <View style={detailStyles.hotelMidRow}>
                  <View style={detailStyles.hotelRestCol}>
                    <Text style={detailStyles.hotelRestBig} numberOfLines={2}>
                      {restText}
                    </Text>
                    <Text style={detailStyles.hotelRestHoursLabel}>REST HOURS</Text>
                  </View>
                  <View style={detailStyles.hotelPreviewCard}>
                    <Ionicons name="partly-sunny-outline" size={18} color="rgba(255,255,255,0.92)" />
                    <Text style={detailStyles.hotelPreviewTitle} numberOfLines={2}>
                      {previewLine}
                    </Text>
                    {previewSub ? <Text style={detailStyles.hotelPreviewSub}>{previewSub}</Text> : null}
                  </View>
                </View>
                <View style={detailStyles.hotelHotelPanel}>
                  <Ionicons name="bed-outline" size={20} color="rgba(255,255,255,0.92)" />
                  <View style={detailStyles.hotelHotelPanelText}>
                    <Text style={detailStyles.hotelHotelName} numberOfLines={2}>
                      {hotelVal}
                    </Text>
                    <Text style={detailStyles.hotelHotelMeta} numberOfLines={2}>
                      {layoverHotelActive.hotel?.city?.trim()
                        ? `${layoverHotelActive.hotel.city.trim()} · Hotel on file`
                        : layoverHotelActive.layoverCityLine?.trim()
                          ? `${layoverHotelActive.layoverCityLine.trim()} · Hotel on file`
                          : 'Hotel on file'}
                    </Text>
                    {infoVal !== '—' ? (
                      <View style={detailStyles.hotelPhoneRow}>
                        <Ionicons name="call-outline" size={14} color="#4ADE80" />
                        <Text style={detailStyles.hotelPhoneText}>{infoVal}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </>
            );
          })()}
        </View>

        <Text style={detailStyles.sectionLabel}>Crew</Text>
        <View style={detailStyles.crewWrap}>
          {t.base?.trim() ? (
            <Text style={detailStyles.crewBaseLine}>Base · {t.base.trim()}</Text>
          ) : null}
          {vm.crewMembers.length > 0 ? (
            <View style={detailStyles.crewGrid}>
              {vm.crewMembers.map((c, i) => (
                <DetailCrewCard key={crewKey(c, i)} member={c} />
              ))}
            </View>
          ) : (
            <Text style={detailStyles.muted}>—</Text>
          )}
        </View>

        <Text style={detailStyles.sectionLabel}>Actions</Text>
        <View style={detailStyles.actionsCol}>
          <Pressable
            style={({ pressed }) => [detailStyles.ctaPrimary, pressed && detailStyles.ctaPrimaryPressed]}
            onPress={() => openPost(t)}
          >
            <View style={detailStyles.ctaPrimaryTextCol}>
              <Text style={detailStyles.ctaPrimaryTitle}>Post to Tradeboard</Text>
              <Text style={detailStyles.ctaPrimarySub}>Drop · Swap · Pickup</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
          </Pressable>
          <View style={detailStyles.secondaryRow}>
            <SecondaryAction
              icon="chatbubbles-outline"
              label="Trip Chat"
              subtitle="Message crew"
              onPress={() => router.push({ pathname: '/crew-schedule/trip-chat', params: { tripId: t.id } })}
            />
            <SecondaryAction
              icon="notifications-outline"
              label="Set Alert"
              subtitle="Delays · Gate"
              onPress={() => router.push({ pathname: '/crew-schedule/alerts', params: { tripId: t.id } })}
            />
            <SecondaryAction
              icon="compass-outline"
              label="Commute"
              subtitle="To base"
              onPress={() =>
                Alert.alert('Commute', 'Commute assist for this trip is not available yet.', [{ text: 'OK' }])
              }
            />
          </View>
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
      <Text style={detailStyles.crewName} numberOfLines={2}>
        {member.name?.trim() || '—'}
      </Text>
      {member.employeeId?.trim() ? (
        <Text style={detailStyles.crewEmp}>#{member.employeeId.trim()}</Text>
      ) : null}
    </View>
  );
}

function SecondaryAction({
  icon,
  label,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [detailStyles.secondaryBtn, pressed && detailStyles.secondaryBtnPressed]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={FC_PREMIUM_RED} />
      <Text style={detailStyles.secondaryBtnText}>{label}</Text>
      {subtitle ? <Text style={detailStyles.secondaryBtnSub}>{subtitle}</Text> : null}
    </Pressable>
  );
}

const detailStyles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  scroll: { flex: 1 },
  heroSafe: {
    backgroundColor: FC_PREMIUM_RED,
    overflow: 'hidden',
  },
  heroContent: {
    position: 'relative',
    zIndex: 2,
    paddingHorizontal: spacing.lg,
    paddingBottom: 26,
  },
  heroMeta: {
    ...STATS_VALUE_FONT,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: FONT.medium,
    letterSpacing: 0,
  },
  heroCity: {
    ...HERO_SANS,
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: FONT.bold,
    marginTop: 8,
    letterSpacing: -0.28,
  },
  heroContext: {
    ...HERO_SANS,
    color: 'rgba(255,255,255,0.95)',
    fontSize: 16,
    fontWeight: FONT.medium,
    marginTop: 6,
    letterSpacing: 0,
  },
  heroDates: {
    ...HERO_SANS,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: FONT.medium,
    marginTop: 8,
    letterSpacing: -0.2,
  },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 18,
  },
  pillDh: { backgroundColor: 'rgba(0,0,0,0.22)' },
  pillText: {
    ...HERO_SANS,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: FONT.medium,
    letterSpacing: 0.1,
  },
  statsCardWrap: {
    marginTop: -18,
    paddingHorizontal: 16,
    zIndex: 2,
    marginBottom: 6,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 4,
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
  statsCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  statsDivider: {
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignSelf: 'stretch',
    marginVertical: 0,
  },
  statsLabel: {
    ...Platform.select<TextStyle>({
      ios: { fontFamily: 'System' },
      android: { fontFamily: 'sans-serif' },
      default: {},
    }),
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.05,
    textTransform: 'uppercase',
    color: '#8B93A3',
    marginBottom: 5,
    textAlign: 'center',
  },
  statsValue: {
    ...STATS_VALUE_FONT,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.45,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: '100%',
  },
  sectionLabel: {
    ...TYPE_FACE,
    fontSize: 11,
    fontWeight: FONT.medium,
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  dayChipScroll: { paddingBottom: 3 },
  dayChip: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'flex-start',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.04,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 0 },
      default: {},
    }),
  },
  dayChipSelected: {
    backgroundColor: FC_PREMIUM_RED,
    borderColor: FC_PREMIUM_RED,
    shadowOpacity: 0,
    elevation: 0,
  },
  dayChipTitle: {
    ...TYPE_FACE,
    fontSize: 9,
    fontWeight: FONT.semibold,
    color: '#64748B',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  dayChipTitleSel: { color: 'rgba(255,255,255,0.95)' },
  dayChipDate: {
    ...TYPE_FACE,
    fontSize: 11,
    fontWeight: FONT.semibold,
    color: '#0F172A',
    marginTop: 4,
    textAlign: 'left',
    alignSelf: 'stretch',
    letterSpacing: -0.25,
    ...MOCKUP_TABULAR,
  },
  dayChipDateSel: { color: '#FFFFFF' },
  dayChipLayover: {
    ...TYPE_FACE,
    fontSize: 10,
    fontWeight: FONT.medium,
    color: '#64748B',
    marginTop: 3,
    textAlign: 'left',
    alignSelf: 'stretch',
    letterSpacing: 0.1,
  },
  dayChipLayoverSel: { color: 'rgba(255,255,255,0.88)' },
  progressWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 4,
  },
  progressTrackBg: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    overflow: 'visible',
    position: 'relative',
  },
  progressTrackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: FC_PREMIUM_RED,
  },
  progressThumb: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: FC_PREMIUM_RED,
    top: -3.5,
    marginLeft: -5,
  },
  selectedDayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 6,
    gap: 8,
  },
  selectedDayBarCompact: {
    marginTop: 4,
    marginBottom: 6,
    paddingHorizontal: 14,
    gap: 6,
  },
  selectedDayBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  dayIndexPill: {
    backgroundColor: FC_PREMIUM_RED,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dayIndexPillText: {
    ...TYPE_FACE,
    fontSize: 10,
    fontWeight: FONT.semibold,
    color: '#FFFFFF',
    letterSpacing: 0.35,
  },
  selectedDayBarDate: {
    ...TYPE_FACE,
    fontSize: 13,
    fontWeight: FONT.medium,
    color: '#0F172A',
    flex: 1,
    minWidth: 0,
    marginRight: 6,
    letterSpacing: -0.25,
    ...MOCKUP_TABULAR,
  },
  selectedDayBarDateCompact: {
    fontSize: 12,
    marginRight: 4,
  },
  selectedDayBarRpt: {
    ...TYPE_FACE,
    fontSize: 12,
    fontWeight: FONT.medium,
    color: '#64748B',
    flexShrink: 0,
    marginLeft: 4,
    ...MOCKUP_TABULAR,
  },
  selectedDayBarRptCompact: {
    fontSize: 11,
  },
  emptyLegs: { ...TYPE_FACE, fontSize: 14, fontWeight: FONT.regular, color: T.textSecondary, paddingVertical: 12 },
  legCard: {
    flexDirection: 'column',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
    overflow: 'hidden',
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
  legCardUpperRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  legCardAccentRail: {
    width: 2,
    alignItems: 'flex-start',
  },
  legCardAccent: {
    width: 2,
    backgroundColor: FC_PREMIUM_RED,
    borderTopLeftRadius: 15,
  },
  legCardMainMeasure: { alignSelf: 'stretch' },
  legCardBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: 0,
  },
  legTopStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 0,
  },
  legHeaderDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15,23,42,0.06)',
    marginTop: 6,
    marginBottom: 8,
    alignSelf: 'stretch',
  },
  legTopLeft: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, flex: 1, minWidth: 0 },
  legFlightNum: {
    ...TYPE_FACE,
    fontSize: 12,
    fontWeight: FONT.medium,
    color: FC_PREMIUM_RED,
    letterSpacing: -0.2,
    ...MOCKUP_TABULAR,
  },
  workingPill: {
    backgroundColor: '#FFE4E6',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196,18,26,0.18)',
  },
  workingPillText: {
    ...TYPE_FACE,
    fontSize: 10,
    fontWeight: FONT.medium,
    color: FC_PREMIUM_RED,
    ...MOCKUP_TABULAR,
  },
  legPillCompact: {
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  dhPill: { backgroundColor: '#EDE9FE', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  dhPillText: {
    ...TYPE_FACE,
    fontSize: 10,
    fontWeight: FONT.medium,
    color: '#5B21B6',
    ...MOCKUP_TABULAR,
  },
  legStatusRightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    maxWidth: '48%',
    gap: 2,
  },
  legStatusRight: {
    ...TYPE_FACE,
    fontSize: 11,
    fontWeight: FONT.medium,
    textAlign: 'right',
    flexShrink: 1,
  },
  legStatusOnTime: { color: '#15803D' },
  legStatusPay: { color: '#6B21A8' },
  legStatusRightSpacer: { width: 8 },
  legAirportRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  legAirportCol: { flex: 1, minWidth: 0 },
  legAirportCode: {
    ...TYPE_FACE,
    fontSize: 20,
    fontWeight: FONT.semibold,
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  legTime: {
    ...STATS_VALUE_FONT,
    fontSize: 15,
    fontWeight: FONT.regular,
    color: FC_STAT_BLACK,
    marginTop: 2,
    letterSpacing: -0.08,
    ...MOCKUP_TABULAR,
  },
  legTerminalGate: {
    ...TYPE_FACE,
    fontSize: 9,
    fontWeight: FONT.regular,
    color: '#94A3B8',
    marginTop: 2,
    letterSpacing: 0.15,
  },
  legPlaneColumn: {
    alignItems: 'center',
    flexShrink: 0,
    flexGrow: 0,
    width: 132,
    paddingHorizontal: 4,
    marginTop: 1,
  },
  legPlaneColumnCompact: {
    width: 116,
    paddingHorizontal: 2,
  },
  legPlaneColumnTight: { paddingTop: 0 },
  legDurationCenter: {
    ...STATS_VALUE_FONT,
    fontSize: 11,
    fontWeight: FONT.regular,
    color: '#94A3B8',
    marginBottom: 5,
    lineHeight: 14,
    letterSpacing: -0.12,
  },
  legPlaneRail: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  legTimelineDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: FC_PREMIUM_RED,
  },
  legPlaneLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(15,23,42,0.12)', minWidth: 28 },
  legNonStop: {
    ...TYPE_FACE,
    fontSize: 9,
    fontWeight: FONT.regular,
    color: '#94A3B8',
    marginTop: 5,
    lineHeight: 12,
  },
  legMetaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,23,42,0.08)',
  },
  legMetaCell: { flex: 1, minWidth: 0, paddingHorizontal: 3, justifyContent: 'flex-start', alignItems: 'center' },
  legMetaCellDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  legMetaK: {
    ...TYPE_FACE,
    fontSize: 9,
    fontWeight: FONT.medium,
    color: '#94A3B8',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  legMetaV: {
    ...STATS_VALUE_FONT,
    fontSize: 12,
    fontWeight: FONT.medium,
    color: FC_STAT_BLACK,
    marginTop: 3,
    textAlign: 'center',
    letterSpacing: -0.15,
  },
  legMetaVGreen: { color: FC_LEG_BLOCK_GREEN },
  trackLegInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,23,42,0.07)',
    backgroundColor: '#FFFFFF',
  },
  trackLegInCardCompact: {
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 11,
  },
  trackLegIconCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trackLegCopy: { flex: 1, minWidth: 0 },
  trackLegTitle: {
    fontSize: 14,
    fontWeight: FONT.semibold,
    letterSpacing: -0.28,
    color: FC_TRACK_MUTED_RED,
    ...(Platform.OS === 'ios'
      ? ({ fontFamily: 'SF Pro Text' } as TextStyle)
      : ({ fontFamily: 'sans-serif' } as TextStyle)),
  },
  trackLegSub: {
    ...TYPE_FACE,
    fontSize: 10,
    fontWeight: FONT.regular,
    color: '#94A3B8',
    marginTop: 2,
    letterSpacing: -0.05,
  },
  trackLegLoadingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hotelCard: {
    marginHorizontal: 16,
    backgroundColor: FC_HOTEL_GREEN,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  hotelBubble: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: FC_HOTEL_BUBBLE,
    right: -44,
    top: 4,
  },
  hotelKicker: {
    ...TYPE_FACE,
    fontSize: 9,
    fontWeight: FONT.medium,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.45,
    marginBottom: 4,
  },
  hotelCardTitle: {
    ...TYPE_FACE,
    fontSize: 18,
    fontWeight: FONT.semibold,
    color: '#fff',
    marginBottom: 3,
    letterSpacing: -0.35,
  },
  hotelSubtitle: {
    ...TYPE_FACE,
    fontSize: 11,
    fontWeight: FONT.regular,
    color: 'rgba(255,255,255,0.82)',
    marginBottom: 10,
    lineHeight: 15,
  },
  hotelMidRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  hotelRestCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-start',
    paddingTop: 2,
    paddingBottom: 2,
  },
  hotelRestBig: {
    ...TYPE_FACE,
    fontSize: 15,
    fontWeight: FONT.semibold,
    color: '#FFFFFF',
    lineHeight: 18,
    letterSpacing: -0.25,
    ...MOCKUP_TABULAR,
  },
  hotelRestHoursLabel: {
    ...TYPE_FACE,
    marginTop: 3,
    fontSize: 9,
    fontWeight: FONT.medium,
    color: 'rgba(255,255,255,0.62)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  hotelPreviewCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: FC_HOTEL_INNER,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  hotelPreviewTitle: {
    ...TYPE_FACE,
    fontSize: 12,
    fontWeight: FONT.semibold,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 16,
    letterSpacing: -0.25,
  },
  hotelPreviewSub: {
    ...TYPE_FACE,
    fontSize: 10,
    fontWeight: FONT.medium,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
  hotelHotelPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: FC_HOTEL_INNER_DEEP,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 11,
  },
  hotelHotelPanelText: { flex: 1, minWidth: 0 },
  hotelHotelName: {
    ...TYPE_FACE,
    fontSize: 14,
    fontWeight: FONT.semibold,
    color: '#FFFFFF',
    lineHeight: 18,
  },
  hotelHotelMeta: {
    ...TYPE_FACE,
    marginTop: 3,
    fontSize: 11,
    fontWeight: FONT.regular,
    color: 'rgba(255,255,255,0.58)',
    lineHeight: 15,
  },
  hotelPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  hotelPhoneText: {
    ...TYPE_FACE,
    fontSize: 13,
    fontWeight: FONT.semibold,
    color: FC_HOTEL_PHONE_NUM,
    letterSpacing: -0.25,
    ...MOCKUP_TABULAR,
  },
  crewWrap: { paddingHorizontal: 16, marginBottom: 6 },
  crewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  crewBaseLine: {
    ...TYPE_FACE,
    fontSize: 11,
    fontWeight: FONT.medium,
    color: T.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  crewCard: {
    width: '48%',
    maxWidth: '48%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  crewPos: {
    ...TYPE_FACE,
    fontSize: 13,
    fontWeight: FONT.bold,
    color: FC_PREMIUM_RED,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  crewName: {
    ...TYPE_FACE,
    fontSize: 15,
    fontWeight: FONT.semibold,
    color: T.text,
    letterSpacing: -0.2,
  },
  crewEmp: {
    ...TYPE_FACE,
    fontSize: 13,
    fontWeight: FONT.regular,
    color: T.textSecondary,
    opacity: 0.6,
    marginTop: 3,
    ...MOCKUP_TABULAR,
  },
  muted: { ...TYPE_FACE, fontSize: 14, fontWeight: FONT.regular, color: T.textSecondary },
  actionsCol: { paddingHorizontal: 16, gap: 10, paddingBottom: 6 },
  ctaPrimary: {
    backgroundColor: FC_PREMIUM_RED,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...Platform.select({
      android: { elevation: 2 },
      default: {},
    }),
  },
  ctaPrimaryPressed: { opacity: 0.92 },
  ctaPrimaryTextCol: { flex: 1, minWidth: 0 },
  ctaPrimaryTitle: {
    ...TYPE_FACE,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: FONT.bold,
    letterSpacing: -0.3,
  },
  ctaPrimarySub: {
    ...TYPE_FACE,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: FONT.medium,
    marginTop: 3,
    letterSpacing: 0.15,
  },
  secondaryRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  secondaryBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.03,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
      },
      default: {},
    }),
  },
  secondaryBtnPressed: { backgroundColor: '#E8EEF4' },
  secondaryBtnText: {
    ...TYPE_FACE,
    fontSize: 13,
    fontWeight: FONT.semibold,
    color: T.text,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  secondaryBtnSub: {
    ...TYPE_FACE,
    fontSize: 12,
    fontWeight: FONT.regular,
    color: T.textSecondary,
    opacity: 0.6,
    textAlign: 'center',
  },
  empty: { flex: 1, padding: 24, justifyContent: 'center' },
  emptyTitle: { ...TYPE_FACE, fontSize: 16, fontWeight: FONT.bold, color: T.text, letterSpacing: -0.3 },
  emptySub: {
    ...TYPE_FACE,
    fontSize: 14,
    fontWeight: FONT.regular,
    color: T.textSecondary,
    marginTop: 8,
    marginBottom: 20,
  },
  primaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: T.accent,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  primaryBtnText: { ...TYPE_FACE, color: '#fff', fontWeight: FONT.bold, fontSize: 15 },
});
