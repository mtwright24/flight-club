import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CrewScheduleTrip, ScheduleMonthMetrics } from '../types';
import {
  buildClassicRowsFromDuties,
  fetchScheduleDutiesAndPairingsForMonth,
  type ClassicScheduleRow,
} from '../buildClassicRows';
import { mergeLayoverOntoLegDates } from '../scheduleTime';
import { scheduleTheme as T } from '../scheduleTheme';
import { isFlicaNonFlyingActivityId } from '../../../services/flicaScheduleHtmlParser';
import TripQuickPreviewSheet from './TripQuickPreviewSheet';

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

const DIV = StyleSheet.hairlineWidth;

/** Classic grid proportional weights — sum used to split row width; WX kept small so weather glyph never owns a wide strip. */
const GRID_W_DATE = 44;
const GRID_W_PAIRING = 68;
const GRID_W_REPORT = 52;
const GRID_W_ROUTE = 44;
const GRID_W_DETAIL = 52;
const GRID_W_LAYOVER = 52;
const GRID_W_WX = 22;

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

/** One Layer-7 winner per calendar date when upstream emits duplicates. */
function classicRowsByDate(rows: ClassicScheduleRow[]): Map<string, ClassicScheduleRow> {
  const buckets = new Map<string, ClassicScheduleRow[]>();
  for (const r of rows) {
    const k = String(r.dateIso).trim().slice(0, 10);
    const arr = buckets.get(k) ?? [];
    arr.push(r);
    buckets.set(k, arr);
  }
  const out = new Map<string, ClassicScheduleRow>();
  for (const [k, arr] of buckets) {
    arr.sort((a, b) => rowPriorityForClassicRow(b) - rowPriorityForClassicRow(a));
    out.set(k, arr[0]!);
  }
  return out;
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

function classicToDayRow(dateIso: string, classic: ClassicScheduleRow | undefined, trip: CrewScheduleTrip | null, todayIso: string): DayRow {
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
    id: `duty:${dateIso}:${classic?.sourcePairingId ?? 'none'}`,
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

/** TEMP: diagnose PTV Classic row — remove when PTV pipeline verified. */
const PTV_DEBUG_DATE_ISO = '2026-05-23';

function logClassicPtvDebug20260523(params: {
  dateIso: string;
  mergedTrips: CrewScheduleTrip[];
  classic: ClassicScheduleRow | undefined;
  itemTrip: CrewScheduleTrip | null;
  finalRow: DayRow;
}) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const { dateIso, mergedTrips, classic, itemTrip, finalRow } = params;
  if (dateIso !== PTV_DEBUG_DATE_ISO) return;

  const overlapping = mergedTrips.filter((t) => dateIso >= t.startDate && dateIso <= t.endDate);
  const overlapSummaries = overlapping.map((t) => ({
    id: t.id,
    pairingCode: t.pairingCode ?? '',
    status: t.status,
    startDate: t.startDate,
    endDate: t.endDate,
  }));

  for (const t of overlapping) {
    const pc = String(t.pairingCode ?? '')
      .trim()
      .toUpperCase();
    if (pc === 'PTV' && t.status !== 'ptv') {
      console.warn('[Classic PTV DEBUG] pairingCode is PTV but status is not `ptv`:', t.status, {
        id: t.id,
        startDate: t.startDate,
        endDate: t.endDate,
      });
    }
  }

  const ptvFromFinder = findPtvTripForDate(mergedTrips, dateIso);
  const blocksOverlay = classicRowBlocksPtvTripOverlay(classic);
  const wouldPtvOverlay = Boolean(ptvFromFinder) && !blocksOverlay;

  console.log('[Classic PTV DEBUG] date', dateIso);
  console.log('[Classic PTV DEBUG] 1) mergedTrips overlapping this date:', JSON.stringify(overlapSummaries));
  console.log(
    '[Classic PTV DEBUG] 2) findPtvTripForDate (status must be exactly "ptv"):',
    ptvFromFinder
      ? JSON.stringify({
          id: ptvFromFinder.id,
          pairingCode: ptvFromFinder.pairingCode,
          status: ptvFromFinder.status,
          startDate: ptvFromFinder.startDate,
          endDate: ptvFromFinder.endDate,
        })
      : 'null',
  );
  console.log(
    '[Classic PTV DEBUG] 3) classic row (winner for date):',
    classic == null
      ? 'undefined'
      : JSON.stringify({
          dateIso: classic.dateIso,
          rowType: classic.rowType,
          sourcePairingId: classic.sourcePairingId,
          pairingText: classic.pairingText,
          reportText: classic.reportText,
          cityText: classic.cityText,
          dutyEndText: classic.dutyEndText,
          layoverText: classic.layoverText,
          syntheticGapNoDuty: classic.syntheticGapNoDuty ?? false,
        }),
  );
  console.log('[Classic PTV DEBUG] 4) classicRowBlocksPtvTripOverlay:', blocksOverlay);
  console.log(
    '[Classic PTV DEBUG] 5) item.trip (from tripForDisplayDate, navigation target):',
    itemTrip
      ? JSON.stringify({
          id: itemTrip.id,
          pairingCode: itemTrip.pairingCode,
          status: itemTrip.status,
          startDate: itemTrip.startDate,
          endDate: itemTrip.endDate,
        })
      : 'null',
  );
  console.log(
    '[Classic PTV DEBUG] 6) final DayRow:',
    JSON.stringify({
      id: finalRow.id,
      kind: finalRow.kind,
      pairingText: finalRow.pairingText,
      tripAttached: finalRow.trip
        ? {
            id: finalRow.trip.id,
            pairingCode: finalRow.trip.pairingCode,
            status: finalRow.trip.status,
          }
        : null,
    }),
  );
  console.log('[Classic PTV DEBUG] ptvToDayRow called:', wouldPtvOverlay && finalRow.kind === 'ptv');
  if (!wouldPtvOverlay) {
    console.log(
      '[Classic PTV DEBUG] ptvToDayRow NOT used because:',
      !ptvFromFinder
        ? 'findPtvTripForDate is null (no trip with status==="ptv" spanning date, or dates exclude this day).'
        : blocksOverlay
          ? 'classicRowBlocksPtvTripOverlay===true (classic looks like another pairing flying duty).'
          : 'unexpected',
    );
  }
}

function displayItemToDayRow(item: ClassicDisplayItem, mergedTrips: CrewScheduleTrip[], todayIso: string): DayRow {
  const { dateIso, classic, trip } = item;
  const ptv = findPtvTripForDate(mergedTrips, dateIso);
  let finalRow: DayRow;
  if (ptv && !classicRowBlocksPtvTripOverlay(classic)) {
    finalRow = ptvToDayRow(dateIso, ptv, todayIso);
  } else {
    finalRow = classicToDayRow(dateIso, classic, trip, todayIso);
  }
  logClassicPtvDebug20260523({ dateIso, mergedTrips, classic, itemTrip: trip, finalRow: finalRow });
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

function formatDec(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

export type SummaryMetricItem = { id: string; label: string; value: string };

/** Header strip: only `schedule_month_metrics` (import/screenshot). No sums from trip rows. */
function buildSummaryStrip(server: ScheduleMonthMetrics | null | undefined): SummaryMetricItem[] {
  if (server) {
    return [
      { id: 'block', label: 'BLOCK', value: formatDec(server.blockHours) },
      { id: 'tafb', label: 'TAFB', value: formatDec(server.monthlyTafbHours) },
      { id: 'credit', label: 'CREDIT', value: formatDec(server.creditHours) },
      { id: 'ytd', label: 'YTD', value: formatDec(server.ytdCreditHours) },
      { id: 'off', label: 'DAYS OFF', value: server.daysOff != null ? String(server.daysOff) : '—' },
    ];
  }
  return [
    { id: 'block', label: 'BLOCK', value: '—' },
    { id: 'tafb', label: 'TAFB', value: '—' },
    { id: 'credit', label: 'CREDIT', value: '—' },
    { id: 'ytd', label: 'YTD', value: '—' },
    { id: 'off', label: 'DAYS OFF', value: '—' },
  ];
}

const ScheduleRow = memo(function ScheduleRow({
  row,
  onPressTrip,
  onLongPressTrip,
}: {
  row: DayRow;
  onPressTrip?: (trip: CrewScheduleTrip) => void;
  onLongPressTrip?: (trip: CrewScheduleTrip) => void;
}) {
  const isEmpty = row.kind === 'empty';
  const isPtv = row.kind === 'ptv';
  const dayInitial = row.dayCode.slice(0, 1);
  const dayNumber = String(row.dayNum).padStart(2, '0');

  const pairingValue = row.pairingText || '';
  const reportValue = row.reportText || '';
  const cityValue = row.cityText || '';
  const dEndValue = row.dEndText || '';
  const layoverValue = row.layoverText || '';
  /** WX always from trip / entries pipeline (Layer 10), not schedule_duties. */
  const wxValue = row.wxText || '';

  const rowStyle = [
    styles.row,
    styles.bodyRow,
    row.isWeekend && styles.weekendRow,
    row.isToday && styles.todayRow,
    row.groupedWithPrev && styles.tripChainRow,
  ];

  const dataPlaceholder = isEmpty || isPtv;
  const wxMuted = isEmpty || isPtv;

  const interactive = !!row.trip && !!onPressTrip;

  const content = (
    <>
      <View style={[styles.rowCell, styles.cellDate]}>
        <View style={styles.dateInlineWrap}>
          <Text style={[styles.cellText, styles.dateDayInline, row.isToday && styles.todayDateInline]} numberOfLines={1}>
            {dayInitial}
          </Text>
          <Text style={[styles.cellText, styles.dateNumInline, row.isToday && styles.todayDateInline]} numberOfLines={1}>
            {dayNumber}
          </Text>
        </View>
      </View>
      <View style={[styles.rowCell, styles.cellPairing]}>
        <Text
          style={[
            styles.cellText,
            styles.assignmentCode,
            isPtv && styles.ptoCode,
            !isPtv && dataPlaceholder && styles.routePlaceholder,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {pairingValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellReport]}>
        <Text style={[styles.cellText, dataPlaceholder && styles.routePlaceholder]} numberOfLines={1} ellipsizeMode="tail">
          {reportValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellRoute]}>
        <Text style={[styles.cellText, styles.routeMain]} numberOfLines={1} ellipsizeMode="tail">
          {cityValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellDetail]}>
        <Text
          style={[styles.cellText, styles.detailCellText, dataPlaceholder && styles.routePlaceholder]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {dEndValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellLayover]}>
        <Text
          style={[styles.cellText, styles.detailCellText, styles.layoverCellText, dataPlaceholder && styles.routePlaceholder]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {layoverValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellWx]}>
        <Text style={[styles.cellText, styles.wxCellText, wxMuted && styles.routePlaceholder]} numberOfLines={1} ellipsizeMode="tail">
          {wxValue}
        </Text>
      </View>
    </>
  );

  if (interactive) {
    return (
      <Pressable
        style={({ pressed }) => [styles.rowPressHost, pressed && styles.rowPressed]}
        onPress={() => onPressTrip!(row.trip!)}
        onLongPress={onLongPressTrip ? () => onLongPressTrip(row.trip!) : undefined}
        delayLongPress={420}
        accessibilityRole="button"
        accessibilityHint="Opens trip detail. Long press for a quick preview."
      >
        {/* Inner row View: Pressable with multiple RN children can lose horizontal flex; one flex row child fixes layout. */}
        <View style={rowStyle}>{content}</View>
      </Pressable>
    );
  }

  return <View style={rowStyle}>{content}</View>;
});

function BandBHeaderLabel({ children, align }: { children: string; align: 'left' | 'center' }) {
  return (
    <Text
      numberOfLines={1}
      ellipsizeMode="clip"
      style={[
        styles.headerText,
        align === 'center' ? styles.headerTextWx : styles.headerTextLeft,
        Platform.OS === 'android' ? styles.headerTextAndroid : null,
      ]}
    >
      {children}
    </Text>
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
  onPressTrip: (trip: CrewScheduleTrip) => void;
  /** Opens Crew Schedule → Manage (import + view mode). */
  onOpenManage?: () => void;
};

export default function ClassicListView({
  trips,
  year,
  month,
  refreshKey,
  monthMetrics,
  onPressTrip,
  onOpenManage,
}: Props) {
  const [previewTrip, setPreviewTrip] = useState<CrewScheduleTrip | null>(null);
  const [classicRows, setClassicRows] = useState<ClassicScheduleRow[]>([]);
  const onLongPressTrip = useCallback((t: CrewScheduleTrip) => setPreviewTrip(t), []);
  const closePreview = useCallback(() => setPreviewTrip(null), []);
  const openFullFromPreview = useCallback(() => {
    const t = previewTrip;
    setPreviewTrip(null);
    if (t) onPressTrip(t);
  }, [previewTrip, onPressTrip]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { duties, pairings, pairingLegs } = await fetchScheduleDutiesAndPairingsForMonth(year, month);
        if (cancelled) return;
        setClassicRows(buildClassicRowsFromDuties(duties, pairings, pairingLegs));
      } catch {
        if (!cancelled) setClassicRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month, refreshKey]);

  const classicByDate = useMemo(() => classicRowsByDate(classicRows), [classicRows]);

  const mergedTrips = useMemo(
    () =>
      trips.map((t) => {
        const merged = mergeLayoverOntoLegDates(t);
        return merged ? { ...t, layoverByDate: merged } : t;
      }),
    [trips],
  );

  const displayRows = useMemo((): ClassicDisplayItem[] => {
    const monthLastIso = viewMonthLastIso(year, month);
    const viewMonthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const viewYm = `${year}-${String(month).padStart(2, '0')}`;
    const monthDates = getAllDatesInMonth(year, month);
    const carryOutRows = classicRows.filter((r) => {
      const d = r.dateIso.slice(0, 10);
      return d > monthLastIso;
    });

    const result: ClassicDisplayItem[] = [];
    const seen = new Set<string>();

    const carryInDates = [...classicByDate.keys()]
      .filter((d) => d < viewMonthStart && d.slice(0, 7) < viewYm)
      .sort((a, b) => a.localeCompare(b));

    for (const dateIso of carryInDates) {
      if (seen.has(dateIso)) continue;
      seen.add(dateIso);
      const classic = classicByDate.get(dateIso);
      result.push({ dateIso, classic, trip: tripForDisplayDate(mergedTrips, dateIso, classic) });
    }

    for (const dateIso of monthDates) {
      if (seen.has(dateIso)) continue;
      seen.add(dateIso);
      const classic = classicByDate.get(dateIso);
      result.push({ dateIso, classic, trip: tripForDisplayDate(mergedTrips, dateIso, classic) });
    }

    for (const r of [...carryOutRows].sort((a, b) => a.dateIso.localeCompare(b.dateIso))) {
      const dateIso = r.dateIso.slice(0, 10);
      if (seen.has(dateIso)) continue;
      seen.add(dateIso);
      result.push({ dateIso, classic: r, trip: tripForDisplayDate(mergedTrips, dateIso, r) });
    }

    return result;
  }, [classicRows, classicByDate, mergedTrips, year, month]);

  const rows = useMemo(() => {
    const todayIso = dateToIsoDateLocal(new Date());
    return attachDayRowGrouping(displayRows.map((item) => displayItemToDayRow(item, mergedTrips, todayIso)));
  }, [displayRows, mergedTrips]);

  const summary = useMemo(() => buildSummaryStrip(monthMetrics ?? null), [monthMetrics]);

  if (!trips.length && !classicRows.length) {
    return <EmptyMonth onOpenManage={onOpenManage} />;
  }

  return (
    <View style={styles.tableWrap}>
      <View style={styles.summaryStripRow}>
        {summary.map((item) => (
          <View key={item.id} style={styles.summaryMetricCell}>
            <Text style={styles.summaryKey} numberOfLines={2}>
              {item.label}
            </Text>
            <Text style={styles.summaryValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.headerRow}>
        <View style={[styles.headerBandCell, styles.headerColDate]}>
          <BandBHeaderLabel align="left">DATE</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.headerColPairing]}>
          <BandBHeaderLabel align="left">PAIRING</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.headerColReport]}>
          <BandBHeaderLabel align="left">REPORT</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.headerColRoute]}>
          <BandBHeaderLabel align="left">CITY</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.headerColDetail]}>
          <BandBHeaderLabel align="left">D-END</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.headerColLayover]}>
          <BandBHeaderLabel align="center">LAYOVER</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.headerBandWx]}>
          <BandBHeaderLabel align="center">WX</BandBHeaderLabel>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ScheduleRow
            row={item}
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

      <TripQuickPreviewSheet
        visible={previewTrip != null}
        trip={previewTrip}
        onClose={closePreview}
        onOpenFullTrip={openFullFromPreview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tableWrap: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    paddingLeft: 2,
    paddingRight: 2,
  },
  wrap: { paddingBottom: 0 },
  summaryStripRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#B8BEC6',
    backgroundColor: '#D4D7DD',
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  summaryMetricCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  summaryKey: {
    fontSize: 8,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.15,
    marginBottom: 4,
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  /** Band B: lighter frosted neutral than Band A; not body white. */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    backgroundColor: '#F5F6F8',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D8DCE2',
  },
  headerBandCell: {
    justifyContent: 'center',
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 0,
    overflow: 'visible',
  },
  /** Header cells use the same flex weights as body columns so labels line up with data. */
  headerColDate: {
    flexGrow: GRID_W_DATE,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_DATE,
    alignItems: 'flex-start',
  },
  headerColPairing: {
    flexGrow: GRID_W_PAIRING,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_PAIRING,
    alignItems: 'flex-start',
  },
  headerColReport: {
    flexGrow: GRID_W_REPORT,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_REPORT,
    alignItems: 'flex-start',
  },
  headerColRoute: {
    flexGrow: GRID_W_ROUTE,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_ROUTE,
    alignItems: 'flex-start',
  },
  headerColDetail: {
    flexGrow: GRID_W_DETAIL,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_DETAIL,
    alignItems: 'flex-start',
  },
  headerColLayover: {
    flexGrow: GRID_W_LAYOVER,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_LAYOVER,
    alignItems: 'center',
  },
  /** WX: narrow flex share so the column never grows wider than a small glyph. */
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
    fontSize: 7.2,
    fontWeight: '700',
    color: '#334155',
    letterSpacing: 0,
    lineHeight: 10,
    width: '100%',
    textTransform: 'uppercase',
  },
  headerTextLeft: {
    textAlign: 'left',
  },
  headerTextWx: {
    textAlign: 'center',
    letterSpacing: 0.02,
  },
  headerTextAndroid: {
    includeFontPadding: false,
  },
  rowCell: {
    minHeight: 22,
    paddingHorizontal: 0,
    marginHorizontal: 0,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    width: '100%',
    minHeight: 22,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: DIV,
    borderBottomColor: '#E8EAED',
    overflow: 'hidden',
  },
  /** Wraps the flex row so Pressable stays full-width without breaking column layout. */
  rowPressHost: {
    width: '100%',
    alignSelf: 'stretch',
  },
  /** Default body fill: no status-based row tints (PTO/RSV/DH/OFF/etc. use text color only). */
  bodyRow: {
    backgroundColor: '#FFFFFF',
  },
  rowPressed: {
    backgroundColor: '#F1F5F9',
  },
  /**
   * Layer 8: proportional flex columns so the row spans full width evenly (no left-heavy cluster);
   * WX uses the smallest weight so a tiny icon never sits in an oversized strip.
   */
  cellDate: {
    flexGrow: GRID_W_DATE,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_DATE,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
  },
  cellPairing: {
    flexGrow: GRID_W_PAIRING,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_PAIRING,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cellReport: {
    flexGrow: GRID_W_REPORT,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_REPORT,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
  },
  cellRoute: {
    flexGrow: GRID_W_ROUTE,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_ROUTE,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
  },
  cellDetail: {
    flexGrow: GRID_W_DETAIL,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_DETAIL,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
  },
  cellLayover: {
    flexGrow: GRID_W_LAYOVER,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: GRID_W_LAYOVER,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
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
  /** Only weekend + today override bodyRow; cool neutral, not beige/pink. */
  weekendRow: {
    backgroundColor: '#F8F9FA',
  },
  noPressRow: {
    opacity: 0.96,
  },
  pressedRow: {
    opacity: 0.95,
  },
  todayRow: {
    backgroundColor: '#F9F0F2',
  },
  tripChainRow: { opacity: 0.992 },
  cellText: { width: '100%', fontSize: 7.8, color: '#243447', lineHeight: 10, fontWeight: '600' },
  dateInlineWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateDayInline: {
    width: 10,
    fontSize: 8.1,
    fontWeight: '700',
    color: '#334155',
    lineHeight: 10,
    letterSpacing: 0,
    textAlign: 'left',
  },
  dateNumInline: {
    width: 18,
    marginLeft: 2,
    fontSize: 8.1,
    fontWeight: '700',
    color: '#334155',
    lineHeight: 10,
    letterSpacing: 0,
    textAlign: 'left',
    fontVariant: ['tabular-nums'],
  },
  todayDateInline: { color: '#8A2E3C', fontWeight: '800' },
  assignmentCode: { fontSize: 8.2, fontWeight: '700', color: T.text, lineHeight: 10 },
  routeMain: { fontSize: 7.8, fontWeight: '600', color: '#B5161E', lineHeight: 10 },
  detailCellText: { fontSize: 7.8, color: '#607086', lineHeight: 10, fontWeight: '600' },
  layoverCellText: { textAlign: 'center' },
  wxCellText: {
    fontSize: 8,
    color: '#EAB308',
    lineHeight: 10,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  continuationCode: { color: '#425972', fontWeight: '600' },
  routePlaceholder: { fontSize: 7.8, color: '#C6D1DE', lineHeight: 10 },
  offCode: { color: '#475569' },
  ptoCode: { color: '#047857' },
  reserveCode: { color: '#92400E' },
  unavailableCode: { color: '#475569' },
  emptyCode: { color: '#AAB8CB', fontWeight: '700' },
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
