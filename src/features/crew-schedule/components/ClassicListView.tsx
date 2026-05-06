import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CrewScheduleTrip, ScheduleMonthMetrics } from '../types';
import {
  buildClassicRowsFromDuties,
  fetchScheduleDutiesAndPairingsForMonth,
  type ClassicScheduleRow,
} from '../buildClassicRows';
import { mergeLayoverOntoLegDates } from '../scheduleTime';
import { scheduleTheme as T } from '../scheduleTheme';
import { SCHEDULE_MOCK_HEADER_RED } from '../scheduleMockPalette';
import { isFlicaNonFlyingActivityId } from '../../../services/flicaScheduleHtmlParser';
import { monthCalendarKey } from '../scheduleMonthCache';
import {
  canSaveScheduleMonthUISnapshot,
  isScheduleMonthUISnapshotCoherent,
  readScheduleMonthUISnapshot,
  writeScheduleMonthUISnapshot,
} from '../scheduleSnapshotCache';
import TripQuickPreviewSheet from './TripQuickPreviewSheet';
import { stashTripForDetailNavigation } from '../tripDetailNavCache';
import {
  PAIRING_DETAIL_STAT_DIGIT_TRACKING,
  PAIRING_DETAIL_STAT_DIGIT_TYPE,
} from '../scheduleTileNumerals';

const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
/**
 * Carry-in prefix: trips that began before day 1 of the viewed month (e.g. late March at top of April).
 * We still block **future-calendar-month** ISO rows (mis-keyed imports / overlap) so May+ never blends above April.
 */

type RowKind =
  | 'trip'
  | 'continuation'
  | 'off'
  | 'pto'
  | 'ptv'
  | 'reserve'
  | 'unavailable'
  | 'special'
  | 'deadhead'
  | 'empty';

type DayRow = {
  id: string;
  dateIso: string;
  kind: RowKind;
  trip: CrewScheduleTrip | null;
  dayCode: string;
  dayNum: number;
  isWeekend: boolean;
  pairingText: string;
  reportText: string;
  cityText: string;
  dEndText: string;
  layoverText: string;
  wxText: string;
  statusText: string;
  reportMinutes: number | null;
  releaseMinutes: number | null;
  isToday: boolean;
  groupedWithPrev: boolean;
  groupedWithNext: boolean;
};

/** Classic grid proportional weights — sum used to split row width; WX kept small so weather glyph never owns a wide strip. */
const GRID_W_DATE = 44;
const GRID_W_PAIRING = 48;
const GRID_W_REPORT = 54;
const GRID_W_ROUTE = 48;
const GRID_W_DETAIL = 54;
const GRID_W_LAYOVER = 54;
const GRID_W_WX = 22;

/** Full-width horizontal rules between classic rows (mock: faint light grey). */
const CLASSIC_ROW_DIVIDER = '#E2E8F0';
const ROW_DIVIDER_WIDTH = StyleSheet.hairlineWidth;

function parseLocalNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

/** Calendar date in local timezone — avoids UTC shift (e.g. May 1–2 appearing above April) from `toISOString()`. */
function dateToIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Last ISO day yyyy-mm-dd inclusive for [year, month1–12]; never spills into next month. */
function viewMonthLastIso(year: number, month1to12: number): string {
  const lastDom = new Date(year, month1to12, 0).getDate();
  const m = String(month1to12).padStart(2, '0');
  return `${year}-${m}-${String(lastDom).padStart(2, '0')}`;
}

/** All YYYY-MM-DD strings for the viewed calendar month — string math only (no Date rollover bugs). */
function getAllDatesInMonth(year: number, month: number): string[] {
  const mNum = Number(month);
  if (!Number.isFinite(mNum) || mNum < 1 || mNum > 12) return [];
  const last = new Date(year, mNum, 0).getDate();
  const mm = String(mNum).padStart(2, '0');
  const out: string[] = [];
  for (let d = 1; d <= last; d += 1) {
    out.push(`${year}-${mm}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

function rowPriorityForClassicRow(r: ClassicScheduleRow): number {
  switch (r.rowType) {
    case 'TRIP_START':
      return 60;
    case 'TRIP_CONTINUATION':
      return 50;
    case 'TRIP_END':
      return 45;
    case 'CARRY_IN':
      return 40;
    case 'CARRY_OUT':
      return 35;
    case 'NON_FLIGHT_DUTY':
      return 20;
    case 'EMPTY_DAY':
      return 10;
    default:
      return 0;
  }
}

function bucketClassicRowsByDate(rows: ClassicScheduleRow[]): Map<string, ClassicScheduleRow[]> {
  const buckets = new Map<string, ClassicScheduleRow[]>();
  for (const r of rows) {
    const k = String(r.dateIso).trim().slice(0, 10);
    const arr = buckets.get(k) ?? [];
    arr.push(r);
    buckets.set(k, arr);
  }
  return buckets;
}

/** Multiple pairings may share a calendar day — sort so TRIP_START / flying rows lead (FCV-style). */
function sortClassicRowsSameDay(arr: ClassicScheduleRow[]): ClassicScheduleRow[] {
  return [...arr].sort((a, b) => {
    const pa = rowPriorityForClassicRow(a);
    const pb = rowPriorityForClassicRow(b);
    if (pa !== pb) return pb - pa;
    return String(a.sourcePairingId).localeCompare(String(b.sourcePairingId));
  });
}

function findTripForDutyDay(trips: CrewScheduleTrip[], dateIso: string, sourcePairingId: string): CrewScheduleTrip | null {
  const pid = String(sourcePairingId ?? '')
    .trim()
    .toUpperCase();
  if (!pid) return null;
  for (const t of trips) {
    const pc = String(t.pairingCode ?? '')
      .trim()
      .toUpperCase();
    if (pc !== pid) continue;
    if (dateIso >= t.startDate && dateIso <= t.endDate) return t;
  }
  return null;
}

/** PTV blocks often have no `schedule_duties` rows — merge from trips when the duty grid is blank for that date. */
function findPtvTripForDate(trips: CrewScheduleTrip[], dateIso: string): CrewScheduleTrip | null {
  for (const t of trips) {
    if (t.status !== 'ptv') continue;
    if (dateIso >= t.startDate && dateIso <= t.endDate) return t;
  }
  return null;
}

/** City tokens that are placeholders in Classic — must not block PTV overlay (Layer-7 dash/continuation). */
function isRoutePlaceholderCity(cityRaw: string | null | undefined): boolean {
  const t = String(cityRaw ?? '').trim();
  return t === '' || t === '-' || t === '—' || t === '–';
}

/**
 * When a PTV trip exists for this date, use `ptvToDayRow` unless the winning classic row is clearly another
 * pairing's flying duty (real pairing label, report/D-OFF/layover, or route city). Does not read buildClassicRows rules.
 */
function classicRowBlocksPtvTripOverlay(classic: ClassicScheduleRow | undefined): boolean {
  if (!classic) return false;
  if (isFlicaNonFlyingActivityId(String(classic.sourcePairingId ?? ''))) return false;

  const pairing = String(classic.pairingText ?? '').trim();
  if (pairing && !isFlicaNonFlyingActivityId(pairing)) return true;

  if (String(classic.reportText ?? '').trim()) return true;
  if (String(classic.dutyEndText ?? '').trim()) return true;
  if (String(classic.layoverText ?? '').trim()) return true;

  if (!isRoutePlaceholderCity(classic.cityText)) return true;

  return false;
}

function tripForDisplayDate(
  mergedTrips: CrewScheduleTrip[],
  dateIso: string,
  classic: ClassicScheduleRow | undefined,
): CrewScheduleTrip | null {
  if (classic?.sourcePairingId) {
    const byPairing = findTripForDutyDay(mergedTrips, dateIso, classic.sourcePairingId);
    if (byPairing) return byPairing;
  }
  const ptv = findPtvTripForDate(mergedTrips, dateIso);
  if (ptv && !classicRowBlocksPtvTripOverlay(classic)) return ptv;
  const overlap = mergedTrips.filter((t) => dateIso >= t.startDate && dateIso <= t.endDate);
  if (!overlap.length) return null;
  return overlap.find((t) => t.status !== 'ptv') ?? overlap[0]!;
}

function isDutyClassicBlank(classic: ClassicScheduleRow | undefined): boolean {
  if (!classic) return true;
  if (classic.rowType === 'EMPTY_DAY') return true;
  return (
    !String(classic.pairingText ?? '').trim() &&
    !String(classic.reportText ?? '').trim() &&
    !String(classic.cityText ?? '').trim() &&
    !String(classic.dutyEndText ?? '').trim() &&
    !String(classic.layoverText ?? '').trim()
  );
}

function ptvToDayRow(dateIso: string, trip: CrewScheduleTrip, todayIso: string): DayRow {
  const d = parseLocalNoon(dateIso);
  const dayIdx = d.getDay();
  const code = String(trip.pairingCode ?? '').trim() || 'PTV';
  return {
    id: `ptv:${dateIso}:${trip.id}`,
    dateIso,
    kind: 'ptv',
    trip,
    dayCode: DOW[dayIdx],
    dayNum: d.getDate(),
    isWeekend: dayIdx === 0 || dayIdx === 6,
    pairingText: code,
    reportText: '',
    cityText: '',
    dEndText: '',
    layoverText: '',
    wxText: '',
    statusText: '',
    reportMinutes: null,
    releaseMinutes: null,
    isToday: dateIso === todayIso,
    groupedWithPrev: false,
    groupedWithNext: false,
  };
}

/** One calendar line: Layer-7 classic row (if any) + trip for navigation; grid order is duties-first, not trip-touched-days. */
type ClassicDisplayItem = {
  dateIso: string;
  classic: ClassicScheduleRow | undefined;
  trip: CrewScheduleTrip | null;
};

function classicToDayRow(
  dateIso: string,
  classic: ClassicScheduleRow | undefined,
  trip: CrewScheduleTrip | null,
  todayIso: string,
  rowIdx: number,
): DayRow {
  const d = parseLocalNoon(dateIso);
  const dayIdx = d.getDay();
  const isBlank =
    !classic ||
    classic.rowType === 'EMPTY_DAY' ||
    (!String(classic.pairingText ?? '').trim() &&
      !String(classic.reportText ?? '').trim() &&
      !String(classic.cityText ?? '').trim() &&
      !String(classic.dutyEndText ?? '').trim() &&
      !String(classic.layoverText ?? '').trim());
  const isPtvTrip = trip?.status === 'ptv';
  const kind: RowKind = isPtvTrip ? 'ptv' : isBlank ? 'empty' : 'trip';
  const wxText = isBlank || isPtvTrip ? '' : '☀︎';
  return {
    id: `duty:${dateIso}:${classic?.sourcePairingId ?? 'none'}:${classic?.rowType ?? 'na'}:${rowIdx}`,
    dateIso,
    kind,
    trip,
    dayCode: DOW[dayIdx],
    dayNum: d.getDate(),
    isWeekend: dayIdx === 0 || dayIdx === 6,
    pairingText: classic?.pairingText ?? '',
    reportText: classic?.reportText ?? '',
    cityText: classic?.cityText ?? '',
    dEndText: classic?.dutyEndText ?? '',
    layoverText: classic?.layoverText ?? '',
    wxText,
    statusText: '',
    reportMinutes: null,
    releaseMinutes: null,
    isToday: dateIso === todayIso,
    groupedWithPrev: false,
    groupedWithNext: false,
  };
}

function displayItemToDayRow(
  item: ClassicDisplayItem,
  mergedTrips: CrewScheduleTrip[],
  todayIso: string,
  rowIdx: number,
): DayRow {
  const { dateIso, classic, trip } = item;
  const ptv = findPtvTripForDate(mergedTrips, dateIso);
  let finalRow: DayRow;
  if (ptv && !classicRowBlocksPtvTripOverlay(classic)) {
    finalRow = ptvToDayRow(dateIso, ptv, todayIso);
    finalRow = { ...finalRow, id: `${finalRow.id}:r${rowIdx}` };
  } else {
    finalRow = classicToDayRow(dateIso, classic, trip, todayIso, rowIdx);
  }
  return finalRow;
}

function isTripLikeKind(kind: RowKind): boolean {
  return kind === 'trip' || kind === 'continuation' || kind === 'deadhead' || kind === 'ptv';
}

function attachDayRowGrouping(rows: DayRow[]): DayRow[] {
  for (let i = 0; i < rows.length; i += 1) {
    const cur = rows[i];
    const prev = rows[i - 1];
    const next = rows[i + 1];
    const curPair = cur.trip?.pairingCode || null;
    rows[i].groupedWithPrev =
      !!prev &&
      !!curPair &&
      curPair !== '—' &&
      prev.trip?.pairingCode === curPair &&
      isTripLikeKind(cur.kind) &&
      isTripLikeKind(prev.kind);
    rows[i].groupedWithNext =
      !!next &&
      !!curPair &&
      curPair !== '—' &&
      next.trip?.pairingCode === curPair &&
      isTripLikeKind(cur.kind) &&
      isTripLikeKind(next.kind);
  }
  return rows;
}

const ScheduleRow = memo(function ScheduleRow({
  row,
  onPressTrip,
  onLongPressTrip,
  rowDateIso,
}: {
  row: DayRow;
  onPressTrip?: (trip: CrewScheduleTrip, rowDateIso?: string) => void;
  onLongPressTrip?: (trip: CrewScheduleTrip, rowDateIso?: string) => void;
  rowDateIso: string;
}) {
  const isEmpty = row.kind === 'empty';
  const isPtv = row.kind === 'ptv';
  const isTripDuty =
    row.kind === 'trip' || row.kind === 'continuation' || row.kind === 'deadhead' || row.kind === 'ptv';

  const pairingValue = row.pairingText || '';
  const pairingDisplay = row.groupedWithPrev ? '' : pairingValue;
  const reportValue = row.reportText || '';
  const cityValue = row.cityText || '';
  const dEndValue = row.dEndText || '';
  const layoverValue = row.layoverText || '';
  /** WX always from trip / entries pipeline (Layer 10), not schedule_duties. */
  const wxValue = row.wxText || '';

  const rowStyle = [
    styles.row,
    styles.bodyRow,
    isEmpty && styles.emptyDayRow,
    row.isWeekend && !isEmpty && styles.weekendRow,
    row.isToday && styles.todayRow,
    row.groupedWithPrev && styles.tripChainRow,
  ];

  const dateWorkRed = row.isToday || (isTripDuty && !isEmpty);
  const dataPlaceholder = isEmpty || isPtv;
  const wxMuted = isEmpty || isPtv;

  const interactive = !!row.trip && !!onPressTrip;

  const dEndDisplay =
    dEndValue.trim() || (isEmpty ? '' : isTripDuty ? '—' : '');
  const layDisplay =
    layoverValue.trim() || (isEmpty ? '' : isTripDuty ? '—' : '');
  const hasLayText = Boolean(layoverValue.trim());

  const cityIsPlaceholder = !cityValue.trim() || cityValue.trim() === '—' || cityValue.trim() === '–';

  const rowBody = (
    <View style={styles.cellsRow}>
      <View style={[styles.rowCell, styles.cellDate]}>
        <View style={styles.dateStack}>
          <Text
            style={[
              styles.dateDowSmall,
              dateWorkRed ? styles.dateWorkAccent : null,
            ]}
            numberOfLines={1}
          >
            {row.dayCode.slice(0, 2)}
          </Text>
          <Text
            style={[
              styles.dateDomLarge,
              dateWorkRed ? styles.dateWorkAccent : null,
              PAIRING_DETAIL_STAT_DIGIT_TYPE,
              PAIRING_DETAIL_STAT_DIGIT_TRACKING,
            ]}
            numberOfLines={1}
          >
            {row.dayNum}
          </Text>
        </View>
      </View>
      <View style={[styles.rowCell, styles.cellPairing]}>
        <Text
          style={[
            styles.cellText,
            styles.assignmentCode,
            isPtv && styles.ptoCode,
            !pairingDisplay.trim() && styles.routePlaceholder,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {pairingDisplay}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellReport]}>
        <Text
          style={[
            styles.cellText,
            dataPlaceholder && styles.routePlaceholder,
            PAIRING_DETAIL_STAT_DIGIT_TYPE,
            PAIRING_DETAIL_STAT_DIGIT_TRACKING,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {reportValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellRoute]}>
        <Text
          style={[
            styles.cellText,
            cityIsPlaceholder ? styles.routePlaceholder : styles.routeMain,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {cityValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellDetail]}>
        <Text
          style={[
            styles.cellText,
            styles.detailCellText,
            !dEndDisplay && styles.routePlaceholder,
            PAIRING_DETAIL_STAT_DIGIT_TYPE,
            PAIRING_DETAIL_STAT_DIGIT_TRACKING,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {dEndDisplay}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellLayover]}>
        <Text
          style={[
            styles.cellText,
            styles.detailCellText,
            styles.layoverCellText,
            hasLayText && styles.layoverValueGreen,
            !layDisplay && styles.routePlaceholder,
            PAIRING_DETAIL_STAT_DIGIT_TYPE,
            PAIRING_DETAIL_STAT_DIGIT_TRACKING,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {layDisplay}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellWx]}>
        <Text
          style={[styles.cellText, styles.wxCellText, wxMuted && styles.routePlaceholder]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {wxValue}
        </Text>
      </View>
    </View>
  );

  const rowChrome = (
    <View style={rowStyle}>
      {row.isToday ? (
        <>
          <View style={styles.todayInsetTopEdge} pointerEvents="none" />
          <View style={styles.todayInsetBottomEdge} pointerEvents="none" />
        </>
      ) : null}
      <View style={styles.rowAccentHost}>
        {isTripDuty ? <View style={styles.rowAccentBar} /> : <View style={styles.rowAccentSpacerFill} />}
      </View>
      {rowBody}
    </View>
  );

  if (interactive) {
    return (
      <Pressable
        style={({ pressed }) => [styles.rowPressHost, pressed && styles.rowPressed]}
        onPress={() => onPressTrip!(row.trip!, rowDateIso)}
        onLongPress={onLongPressTrip ? () => onLongPressTrip(row.trip!, rowDateIso) : undefined}
        delayLongPress={420}
        accessibilityRole="button"
        accessibilityHint="Opens trip detail. Long press for a quick preview."
      >
        {rowChrome}
      </Pressable>
    );
  }

  return rowChrome;
});

function BandBHeaderLabel({ children }: { children: string }) {
  return (
    <Text
      numberOfLines={1}
      ellipsizeMode="clip"
      style={[styles.headerText, styles.headerTextCenter, Platform.OS === 'android' ? styles.headerTextAndroid : null]}
    >
      {children}
    </Text>
  );
}

/** Non-interactive shell while Layer-7 classic data is fetching — avoids trip grid + stale classic mismatches. */
function ClassicScheduleSkeleton() {
  return (
    <View style={styles.tableOuter}>
      <View style={styles.tableSurface}>
        <View style={styles.headerRow}>
          <View style={[styles.headerBandCell, styles.headerColDate]}>
            <BandBHeaderLabel>DATE</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerColPairing]}>
            <BandBHeaderLabel>PAIRING</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerColReport]}>
            <BandBHeaderLabel>RPT</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerColRoute]}>
            <BandBHeaderLabel>CITY</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerColDetail]}>
            <BandBHeaderLabel>D-END</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerColLayover]}>
            <BandBHeaderLabel>LAYOVR</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerBandWx]}>
            <BandBHeaderLabel>WX</BandBHeaderLabel>
          </View>
        </View>

        <View style={styles.skeletonBody}>
          <ActivityIndicator size="large" color={T.accent} accessibilityLabel="Loading schedule grid" />
        </View>
      </View>
    </View>
  );
}

function EmptyMonth({ onOpenManage }: { onOpenManage?: () => void }) {
  return (
    <View style={styles.emptyMonth}>
      <Text style={styles.emptyMonthTitle}>No schedule for this month</Text>
      <Text style={styles.emptyMonthBody}>
        Import and view options are in Manage. Open Manage to import a schedule or switch Classic / Calendar / Smart.
      </Text>
      {onOpenManage ? (
        <Pressable style={styles.importBtn} onPress={onOpenManage}>
          <Text style={styles.importBtnText}>Open Manage</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type Props = {
  trips: CrewScheduleTrip[];
  year: number;
  month: number;
  /** Bumps when the schedule tab gains focus / trips reload so Layer-7 duties re-fetch matches Supabase. */
  refreshKey?: number;
  /** Month header strip: stored metrics only (import/screenshot), never derived in the client. */
  monthMetrics?: ScheduleMonthMetrics | null;
  /**
   * Trip + stats layer hydrated for `{year, month}` (schedule hook finished for the month on screen).
   * While swipe is holding the prior month (`monthLoadPending`), pass true so the held month still renders.
   */
  tripLayerReady: boolean;
  onPressTrip: (trip: CrewScheduleTrip, rowDateIso?: string) => void;
  /** Opens Crew Schedule → Manage (import + view mode). */
  onOpenManage?: () => void;
};

export default function ClassicListView({
  trips,
  year,
  month,
  refreshKey,
  monthMetrics,
  tripLayerReady,
  onPressTrip,
  onOpenManage,
}: Props) {
  const [previewTrip, setPreviewTrip] = useState<CrewScheduleTrip | null>(null);
  /** Committed Layer-7 grid for `ymKey` only — avoids painting prior month classics against new-month trips. */
  /** Monotonic load generation — bumps in `useLayoutEffect` so we never paint stale classic rows for a new `{year, month, refreshKey}` (or same-month refresh). */
  const loadEpochRef = useRef(0);
  const [loadEpoch, setLoadEpoch] = useState(0);
  const [classicCommit, setClassicCommit] = useState<{ ymKey: string; classicRows: ClassicScheduleRow[] } | null>(
    null,
  );
  /** `loadEpoch` value that last wrote `classicCommit`; must equal current `loadEpoch` for a coherent grid. */
  const [classicSettledEpoch, setClassicSettledEpoch] = useState(0);
  const onLongPressTrip = useCallback(
    (t: CrewScheduleTrip, rowDateIso?: string) => {
      stashTripForDetailNavigation(t, trips, { visibleMonth: { year, month }, rowDateIso: rowDateIso ?? null });
      setPreviewTrip(t);
    },
    [trips, year, month],
  );
  const closePreview = useCallback(() => setPreviewTrip(null), []);
  const openFullFromPreview = useCallback(() => {
    const t = previewTrip;
    setPreviewTrip(null);
    if (t) onPressTrip(t);
  }, [previewTrip, onPressTrip]);

  const ymKey = monthCalendarKey(year, month);

  useLayoutEffect(() => {
    loadEpochRef.current += 1;
    const epoch = loadEpochRef.current;
    setLoadEpoch(epoch);
    const snap = readScheduleMonthUISnapshot(ymKey);
    if (snap && isScheduleMonthUISnapshotCoherent(snap, year, month)) {
      setClassicCommit({ ymKey, classicRows: snap.classicRows });
      setClassicSettledEpoch(epoch);
    } else {
      setClassicCommit(null);
      setClassicSettledEpoch(0);
    }
  }, [year, month, ymKey]);

  useEffect(() => {
    const epoch = loadEpochRef.current;
    const y = year;
    const m = month;
    const key = ymKey;
    let cancelled = false;
    void (async () => {
      try {
        const { duties, pairings, pairingLegs } = await fetchScheduleDutiesAndPairingsForMonth(y, m);
        if (cancelled || epoch !== loadEpochRef.current) return;
        const rows = buildClassicRowsFromDuties(duties, pairings, pairingLegs);
        setClassicCommit({ ymKey: key, classicRows: rows });
        setClassicSettledEpoch(epoch);
      } catch {
        if (!cancelled && epoch === loadEpochRef.current) {
          const fallback = readScheduleMonthUISnapshot(key);
          if (fallback && isScheduleMonthUISnapshotCoherent(fallback, y, m)) {
            return;
          }
          setClassicCommit({ ymKey: key, classicRows: [] });
          setClassicSettledEpoch(epoch);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadEpoch, year, month, ymKey, refreshKey]);

  const mergedTrips = useMemo(
    () =>
      trips.map((t) => {
        const merged = mergeLayoverOntoLegDates(t);
        return merged ? { ...t, layoverByDate: merged } : t;
      }),
    [trips],
  );

  const classicHydratedForRequest = classicSettledEpoch === loadEpoch;
  const dutiesLoaded = classicCommit?.ymKey === ymKey && classicHydratedForRequest;
  const pairingsLoaded = dutiesLoaded;
  const legsLoaded = dutiesLoaded;
  const statsLoaded = tripLayerReady;
  const isReady = dutiesLoaded && pairingsLoaded && legsLoaded && statsLoaded;

  useEffect(() => {
    if (!isReady || !classicCommit || classicCommit.ymKey !== ymKey) return;
    const prevSnap = readScheduleMonthUISnapshot(ymKey);
    const metrics = monthMetrics ?? prevSnap?.monthMetrics ?? null;
    if (
      !canSaveScheduleMonthUISnapshot({
        monthKey: ymKey,
        trips,
        classicRows: classicCommit.classicRows,
        monthMetrics: metrics,
      })
    ) {
      return;
    }
    writeScheduleMonthUISnapshot({
      monthKey: ymKey,
      generatedAt: Date.now(),
      trips,
      classicRows: classicCommit.classicRows,
      monthMetrics: metrics,
    });
  }, [isReady, ymKey, trips, classicCommit, monthMetrics]);

  const viewModelRows = useMemo((): ClassicDisplayItem[] | null => {
    if (!isReady || !classicCommit || classicCommit.ymKey !== ymKey) return null;
    const classicRows = classicCommit.classicRows;
    const monthLastIso = viewMonthLastIso(year, month);
    const viewMonthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const viewYm = `${year}-${String(month).padStart(2, '0')}`;
    const monthDates = getAllDatesInMonth(year, month);
    const bucket = bucketClassicRowsByDate(classicRows);
    const carryOutRows = classicRows.filter((r) => {
      const d = r.dateIso.slice(0, 10);
      return d > monthLastIso;
    });

    const result: ClassicDisplayItem[] = [];

    const carryInDates = [...bucket.keys()]
      .filter((d) => d < viewMonthStart && d.slice(0, 7) < viewYm)
      .sort((a, b) => a.localeCompare(b));

    for (const dateIso of carryInDates) {
      for (const c of sortClassicRowsSameDay(bucket.get(dateIso) ?? [])) {
        result.push({ dateIso, classic: c, trip: tripForDisplayDate(mergedTrips, dateIso, c) });
      }
    }

    for (const dateIso of monthDates) {
      const list = bucket.get(dateIso);
      if (!list?.length) {
        result.push({ dateIso, classic: undefined, trip: tripForDisplayDate(mergedTrips, dateIso, undefined) });
      } else {
        for (const c of sortClassicRowsSameDay(list)) {
          result.push({ dateIso, classic: c, trip: tripForDisplayDate(mergedTrips, dateIso, c) });
        }
      }
    }

    const carrySorted = [...carryOutRows].sort((a, b) => {
      const da = a.dateIso.slice(0, 10).localeCompare(b.dateIso.slice(0, 10));
      if (da !== 0) return da;
      return String(a.sourcePairingId).localeCompare(String(b.sourcePairingId));
    });
    for (const r of carrySorted) {
      const dateIso = r.dateIso.slice(0, 10);
      result.push({ dateIso, classic: r, trip: tripForDisplayDate(mergedTrips, dateIso, r) });
    }

    return result;
  }, [isReady, classicCommit, ymKey, mergedTrips, year, month]);

  const rows = useMemo(() => {
    if (!viewModelRows) return null;
    const todayIso = dateToIsoDateLocal(new Date());
    return attachDayRowGrouping(
      viewModelRows.map((item, rowIdx) => displayItemToDayRow(item, mergedTrips, todayIso, rowIdx)),
    );
  }, [viewModelRows, mergedTrips]);

  if (isReady && !trips.length && (classicCommit?.classicRows.length ?? 0) === 0) {
    return <EmptyMonth onOpenManage={onOpenManage} />;
  }

  if (!isReady || !rows) {
    return <ClassicScheduleSkeleton />;
  }

  return (
    <View style={styles.tableOuter}>
      <View style={styles.tableSurface}>
        <View style={styles.headerRow}>
          <View style={[styles.headerBandCell, styles.headerColDate]}>
            <BandBHeaderLabel>DATE</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerColPairing]}>
            <BandBHeaderLabel>PAIRING</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerColReport]}>
            <BandBHeaderLabel>RPT</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerColRoute]}>
            <BandBHeaderLabel>CITY</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerColDetail]}>
            <BandBHeaderLabel>D-END</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerColLayover]}>
            <BandBHeaderLabel>LAYOVR</BandBHeaderLabel>
          </View>
          <View style={[styles.headerBandCell, styles.headerBandWx]}>
            <BandBHeaderLabel>WX</BandBHeaderLabel>
          </View>
        </View>

        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ScheduleRow
              row={item}
              rowDateIso={item.dateIso}
              onPressTrip={item.trip ? onPressTrip : undefined}
              onLongPressTrip={item.trip ? onLongPressTrip : undefined}
            />
          )}
          contentContainerStyle={styles.wrap}
          initialNumToRender={22}
          maxToRenderPerBatch={24}
          windowSize={9}
          removeClippedSubviews
          scrollEnabled={false}
        />
      </View>

      <TripQuickPreviewSheet
        visible={previewTrip != null}
        trip={previewTrip}
        pairingUuid={previewTrip?.schedulePairingId}
        onClose={closePreview}
        onOpenFullTrip={openFullFromPreview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tableOuter: {
    width: '100%',
    backgroundColor: T.bg,
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  tableSurface: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  wrap: { paddingBottom: 0 },
  skeletonBody: {
    minHeight: 260,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    backgroundColor: '#F3F4F6',
  },
  headerBandCell: {
    justifyContent: 'center',
    minHeight: 28,
    paddingVertical: 5,
    paddingHorizontal: 2,
    overflow: 'visible',
  },
  headerColDate: {
    flexGrow: GRID_W_DATE,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_DATE,
    alignItems: 'center',
  },
  headerColPairing: {
    flexGrow: GRID_W_PAIRING,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_PAIRING,
    alignItems: 'center',
  },
  headerColReport: {
    flexGrow: GRID_W_REPORT,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_REPORT,
    alignItems: 'center',
  },
  headerColRoute: {
    flexGrow: GRID_W_ROUTE,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_ROUTE,
    alignItems: 'center',
  },
  headerColDetail: {
    flexGrow: GRID_W_DETAIL,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_DETAIL,
    alignItems: 'center',
  },
  headerColLayover: {
    flexGrow: GRID_W_LAYOVER,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_LAYOVER,
    alignItems: 'center',
  },
  headerBandWx: {
    flexGrow: GRID_W_WX,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_WX,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  headerText: {
    fontSize: 7,
    fontWeight: '500',
    color: '#94A3B8',
    letterSpacing: 0.04,
    lineHeight: 9,
    width: '100%',
    textTransform: 'uppercase',
  },
  headerTextCenter: { textAlign: 'center', letterSpacing: 0.03 },
  headerTextAndroid: { includeFontPadding: false },
  rowCell: {
    minHeight: 20,
    paddingHorizontal: 2,
    marginHorizontal: 0,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    width: '100%',
    minHeight: 22,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: ROW_DIVIDER_WIDTH,
    borderBottomColor: CLASSIC_ROW_DIVIDER,
    overflow: 'hidden',
  },
  cellsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 22,
  },
  rowAccentHost: {
    width: 3,
    alignSelf: 'stretch',
    paddingVertical: 5,
    justifyContent: 'center',
  },
  rowAccentBar: {
    flex: 1,
    width: 3,
    minHeight: 10,
    alignSelf: 'center',
    borderRadius: 1,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
  },
  rowAccentSpacerFill: {
    flex: 1,
    width: 3,
    minHeight: 10,
    alignSelf: 'center',
    opacity: 0,
  },
  rowPressHost: {
    width: '100%',
    alignSelf: 'stretch',
  },
  bodyRow: {
    backgroundColor: '#FFFFFF',
  },
  emptyDayRow: {
    backgroundColor: '#F8FAFC',
  },
  rowPressed: {
    backgroundColor: '#F1F5F9',
  },
  cellDate: {
    flexGrow: GRID_W_DATE,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_DATE,
    overflow: 'hidden',
    alignItems: 'center',
  },
  cellPairing: {
    flexGrow: GRID_W_PAIRING,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_PAIRING,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellReport: {
    flexGrow: GRID_W_REPORT,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_REPORT,
    overflow: 'hidden',
    alignItems: 'center',
  },
  cellRoute: {
    flexGrow: GRID_W_ROUTE,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_ROUTE,
    overflow: 'hidden',
    alignItems: 'center',
  },
  cellDetail: {
    flexGrow: GRID_W_DETAIL,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_DETAIL,
    overflow: 'hidden',
    alignItems: 'center',
  },
  cellLayover: {
    flexGrow: GRID_W_LAYOVER,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_LAYOVER,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellWx: {
    flexGrow: GRID_W_WX,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_WX,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekendRow: {
    backgroundColor: '#F9FAFB',
  },
  noPressRow: { opacity: 0.96 },
  pressedRow: { opacity: 0.95 },
  todayRow: {
    backgroundColor: '#F9F0F2',
  },
  /** Recessed “pressed tile” look — darker band along top inner edge (mock inset shadow). */
  todayInsetTopEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 4,
    height: Platform.OS === 'ios' ? 2 : Math.max(ROW_DIVIDER_WIDTH * 2, 1),
    backgroundColor: 'rgba(15, 23, 42, 0.14)',
  },
  /** Subtle inner highlight along bottom (inset bevel). */
  todayInsetBottomEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    height: ROW_DIVIDER_WIDTH,
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
  },
  tripChainRow: { },
  dateStack: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 0,
    paddingVertical: 2,
  },
  dateDowSmall: {
    fontSize: 6.5,
    fontWeight: '600',
    color: '#64748B',
    lineHeight: 8,
  },
  dateDomLarge: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 11,
  },
  dateWorkAccent: {
    color: SCHEDULE_MOCK_HEADER_RED,
  },
  cellText: {
    width: '100%',
    fontSize: 7.6,
    color: '#1E293B',
    lineHeight: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  assignmentCode: {
    fontSize: 8,
    fontWeight: '800',
    color: SCHEDULE_MOCK_HEADER_RED,
    lineHeight: 10,
    textAlign: 'center',
  },
  routeMain: { fontSize: 7.6, fontWeight: '700', color: SCHEDULE_MOCK_HEADER_RED, lineHeight: 10, textAlign: 'center' },
  detailCellText: { fontSize: 7.6, color: '#475569', lineHeight: 10, fontWeight: '600', textAlign: 'center' },
  layoverCellText: { textAlign: 'center' },
  layoverValueGreen: { color: '#15803D', fontWeight: '700' },
  wxCellText: {
    fontSize: 7.5,
    color: '#CA8A04',
    lineHeight: 10,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  continuationCode: { color: '#425972', fontWeight: '600' },
  routePlaceholder: { fontSize: 7.6, color: '#C6D1DE', lineHeight: 10, textAlign: 'center' },
  offCode: { color: '#475569' },
  ptoCode: { color: '#047857' },
  reserveCode: { color: '#92400E' },
  unavailableCode: { color: '#475569' },
  emptyCode: { color: '#94A3B8', fontWeight: '700' },
  stateDetail: { color: '#667085' },
  emptyMonth: {
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 10,
    backgroundColor: T.surface,
    padding: 14,
    alignItems: 'center',
  },
  emptyMonthTitle: { color: T.text, fontSize: 15, fontWeight: '800' },
  emptyMonthBody: { color: T.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  importBtn: {
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: T.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  importBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
