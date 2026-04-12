import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CrewScheduleTrip, ScheduleMonthMetrics } from '../types';
import { formatLayoverColumnDisplay, mergeLayoverOntoLegDates, parseScheduleTimeMinutes } from '../scheduleTime';
import { scheduleTheme as T } from '../scheduleTheme';
import TripPreviewModal from './TripPreviewModal';

const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

type RowKind =
  | 'trip'
  | 'continuation'
  | 'off'
  | 'pto'
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

function parseLocalNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function statusToKind(trip: CrewScheduleTrip): RowKind {
  if (trip.status === 'off') return 'off';
  if (trip.status === 'pto') return 'pto';
  if (trip.status === 'rsv') return 'reserve';
  if (trip.status === 'training') return 'special';
  if (trip.status === 'other') {
    const upperCode = String(trip.pairingCode || '').trim().toUpperCase();
    const upperRoute = String(trip.routeSummary || '').trim().toUpperCase();
    if (['UNA', 'LSB', 'TAL'].includes(upperCode) || ['UNA', 'LSB', 'TAL'].includes(upperRoute)) {
      return 'unavailable';
    }
    return 'special';
  }
  if (trip.status === 'deadhead') return 'deadhead';
  if (trip.status === 'continuation') return 'continuation';
  return 'trip';
}

function buildRowLabel(trip: CrewScheduleTrip): string {
  const kind = statusToKind(trip);
  if (kind === 'off') return '';
  if (kind === 'pto') {
    const pc = String(trip.pairingCode || '').trim().toUpperCase();
    return pc === 'PTV' ? 'PTV' : 'PTO';
  }
  if (kind === 'reserve') return trip.pairingCode && trip.pairingCode !== '—' ? trip.pairingCode : 'RSV';
  if (kind === 'unavailable') {
    const upperCode = String(trip.pairingCode || '').trim().toUpperCase();
    const upperRoute = String(trip.routeSummary || '').trim().toUpperCase();
    if (['UNA', 'LSB', 'TAL'].includes(upperCode)) return upperCode;
    if (['UNA', 'LSB', 'TAL'].includes(upperRoute)) return upperRoute;
    return 'UNA';
  }
  if (kind === 'special') return trip.pairingCode && trip.pairingCode !== '—' ? trip.pairingCode : trip.status.toUpperCase();
  if (kind === 'deadhead') return trip.pairingCode && trip.pairingCode !== '—' ? trip.pairingCode : 'DH';
  return trip.pairingCode && trip.pairingCode !== '—' ? trip.pairingCode : 'Trip';
}

function toCompactTime(raw?: string): string {
  if (!raw) return '';
  const t = raw.trim();
  const match = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (match) {
    let hour = Number(match[1]);
    const minute = match[2];
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}${minute}`;
  }
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const hour = Number(m24[1]);
    const minute = m24[2];
    if (hour <= 23) return `${String(hour).padStart(2, '0')}${minute}`;
  }
  if (/^\d{4}$/.test(t)) return t;
  return '';
}

/** Same line as pairing ID: 43:11 (from decimal TAFB hours). */
function formatPairingTafbSameLine(hours: number): string {
  const totalMins = Math.round(hours * 60);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function compactToken(raw?: string): string {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^[A-Z]{3,4}$/.test(v)) return v;
  const cleaned = v.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (cleaned.length >= 3) return cleaned.slice(0, 3);
  return cleaned || v.slice(0, 3).toUpperCase();
}

function buildRowForTrip(
  dateIso: string,
  trip: CrewScheduleTrip,
  isProxyContinuation: boolean,
  dayIndexInTrip: number
): Omit<DayRow, 'isToday' | 'groupedWithPrev' | 'groupedWithNext'> {
  const d = parseLocalNoon(dateIso);
  const dayIdx = d.getDay();
  const kind = isProxyContinuation ? 'continuation' : statusToKind(trip);
  const legForDay = trip.legs.find((l) => l.dutyDate === dateIso);
  const leg = legForDay ?? (!isProxyContinuation && trip.legs.length ? trip.legs[0] : undefined);
  let pairingText = kind === 'continuation' ? '' : buildRowLabel(trip);
  if (
    pairingText &&
    !isProxyContinuation &&
    dayIndexInTrip === 0 &&
    trip.pairingTafbHours != null &&
    kind !== 'off' &&
    kind !== 'pto' &&
    kind !== 'reserve' &&
    kind !== 'unavailable'
  ) {
    pairingText = `${pairingText}  ${formatPairingTafbSameLine(trip.pairingTafbHours)}`;
  }
  const reportText =
    kind === 'off' || kind === 'pto' || kind === 'reserve' || kind === 'unavailable' || kind === 'special' || kind === 'continuation'
      ? ''
      : toCompactTime(leg?.reportLocal || leg?.departLocal);
  const cityText =
    kind === 'off' || kind === 'pto'
      ? ''
      : kind === 'reserve'
        ? compactToken(trip.base)
        : kind === 'continuation'
          ? legForDay
            ? compactToken(legForDay.arrivalAirport)
            : ''
        : compactToken(leg?.arrivalAirport) || compactToken(trip.origin) || compactToken(trip.routeSummary);
  const dEndText =
    kind === 'off' || kind === 'pto' || kind === 'reserve' || kind === 'unavailable' || kind === 'special' || kind === 'continuation'
      ? ''
      : toCompactTime(leg?.releaseLocal);
  /** Layover column: time token only (city stripped for display; DB still stores full FLICA text). */
  const layoverText = formatLayoverColumnDisplay(trip.layoverByDate?.[dateIso] ?? '');
  const wxText =
    kind === 'off' || kind === 'pto' || kind === 'reserve' || kind === 'unavailable' || kind === 'special'
      ? ''
      : '☀︎';
  const statusText =
    kind === 'continuation'
      ? 'CONT'
      : kind === 'off'
        ? 'OFF'
        : kind === 'pto'
          ? 'PTO'
          : kind === 'reserve'
            ? 'RSV'
            : '';
  const reportMinutes = parseScheduleTimeMinutes(leg?.reportLocal || leg?.departLocal);
  const releaseMinutes = parseScheduleTimeMinutes(leg?.releaseLocal);

  return {
    id: `${trip.id}:${dateIso}:${isProxyContinuation ? 'cont' : 'start'}`,
    dateIso,
    kind,
    trip,
    dayCode: DOW[dayIdx],
    dayNum: d.getDate(),
    isWeekend: dayIdx === 0 || dayIdx === 6,
    pairingText,
    reportText,
    cityText,
    dEndText,
    layoverText,
    wxText,
    statusText,
    reportMinutes,
    releaseMinutes,
  };
}

function enumerateMonthDates(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d += 1) {
    const dt = new Date(year, month - 1, d, 12, 0, 0, 0);
    out.push(toIsoDate(dt));
  }
  return out;
}

function isTripLikeKind(kind: RowKind): boolean {
  return kind === 'trip' || kind === 'continuation' || kind === 'deadhead';
}

function rowsFromTrips(trips: CrewScheduleTrip[]): DayRow[] {
  if (!trips.length) return [];

  const sorted = [...trips]
    .map((t) => {
      const merged = mergeLayoverOntoLegDates(t);
      return merged ? { ...t, layoverByDate: merged } : t;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const year = sorted[0].year;
  const month = sorted[0].month;
  const dateRows = new Map<string, Omit<DayRow, 'isToday' | 'groupedWithPrev' | 'groupedWithNext'>[]>();

  for (const trip of sorted) {
    const start = parseLocalNoon(trip.startDate);
    const end = parseLocalNoon(trip.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const ptvEveryDay =
      trip.status === 'pto' && String(trip.pairingCode || '').trim().toUpperCase() === 'PTV';
    for (let t = start.getTime(), i = 0; t <= end.getTime(); t += 24 * 60 * 60 * 1000, i += 1) {
      const dateIso = toIsoDate(new Date(t));
      const row = buildRowForTrip(dateIso, trip, ptvEveryDay ? false : i > 0, i);
      if (!dateRows.has(dateIso)) dateRows.set(dateIso, []);
      dateRows.get(dateIso)!.push(row);
    }
  }

  const todayIso = toIsoDate(new Date());
  const rows: DayRow[] = [];
  for (const dateIso of enumerateMonthDates(year, month)) {
    const entries = (dateRows.get(dateIso) || []).sort((a, b) => {
      if (!a.trip || !b.trip) return 0;
      return a.trip.startDate.localeCompare(b.trip.startDate);
    });
    if (!entries.length) {
      rows.push({
        id: `empty:${dateIso}`,
        dateIso,
        kind: 'empty',
        trip: null,
        dayCode: DOW[parseLocalNoon(dateIso).getDay()],
        dayNum: parseLocalNoon(dateIso).getDate(),
        isWeekend: [0, 6].includes(parseLocalNoon(dateIso).getDay()),
        pairingText: '',
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
      });
      continue;
    }
    for (const e of entries) {
      rows.push({
        ...e,
        isToday: dateIso === todayIso,
        groupedWithPrev: false,
        groupedWithNext: false,
      });
    }
  }

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
  const debugLoggedRef = useRef(false);
  const isEmpty = row.kind === 'empty';
  const dayInitial = row.dayCode.slice(0, 1);
  const dayNumber = String(row.dayNum).padStart(2, '0');
  const pairingValue = row.pairingText || '';
  const reportValue = row.reportText || '';
  const cityValue = row.cityText || '';
  const dEndValue = row.dEndText || '';
  const layoverValue = row.layoverText || '';
  const wxValue = row.wxText || '';
  const rowStyle = [
    styles.row,
    styles.bodyRow,
    row.isWeekend && styles.weekendRow,
    row.isToday && styles.todayRow,
    row.groupedWithPrev && styles.tripChainRow,
  ];

  if (!debugLoggedRef.current && row.dateIso.endsWith('-24')) debugLoggedRef.current = true;

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
            row.kind === 'off' && styles.offCode,
            row.kind === 'pto' && styles.ptoCode,
            row.kind === 'reserve' && styles.reserveCode,
            row.kind === 'unavailable' && styles.unavailableCode,
            row.kind === 'continuation' && styles.continuationCode,
            isEmpty && styles.routePlaceholder,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {pairingValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellReport]}>
        <Text style={[styles.cellText, isEmpty && styles.routePlaceholder]} numberOfLines={1} ellipsizeMode="tail">
          {reportValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellRoute]}>
        <Text style={[styles.cellText, styles.routeMain, isEmpty && styles.routePlaceholder]} numberOfLines={1} ellipsizeMode="tail">
          {cityValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellDetail]}>
        <Text style={[styles.cellText, styles.detailCellText, isEmpty && styles.routePlaceholder]} numberOfLines={1} ellipsizeMode="tail">
          {dEndValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellLayover]}>
        <Text
          style={[styles.cellText, styles.detailCellText, isEmpty && styles.routePlaceholder]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {layoverValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellWx]}>
        <Text style={[styles.cellText, styles.wxCellText, isEmpty && styles.routePlaceholder]} numberOfLines={1} ellipsizeMode="tail">
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

/** Band B: fixed size (no per-cell auto-shrink) so short labels like CITY don’t sit in oversized columns vs D-END. */
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
  /** Month header strip: stored metrics only (import/screenshot), never derived in the client. */
  monthMetrics?: ScheduleMonthMetrics | null;
  onPressTrip: (trip: CrewScheduleTrip) => void;
  /** Opens Crew Schedule → Manage (import + view mode). */
  onOpenManage?: () => void;
};

export default function ClassicListView({ trips, monthMetrics, onPressTrip, onOpenManage }: Props) {
  const [previewTrip, setPreviewTrip] = useState<CrewScheduleTrip | null>(null);
  const onLongPressTrip = useCallback((t: CrewScheduleTrip) => setPreviewTrip(t), []);
  const closePreview = useCallback(() => setPreviewTrip(null), []);
  const openFullFromPreview = useCallback(() => {
    const t = previewTrip;
    setPreviewTrip(null);
    if (t) onPressTrip(t);
  }, [previewTrip, onPressTrip]);

  const rows = useMemo(() => rowsFromTrips(trips), [trips]);
  const summary = useMemo(() => buildSummaryStrip(monthMetrics ?? null), [monthMetrics]);

  if (!trips.length) {
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
        <View style={[styles.headerBandCell, styles.cellDate]}>
          <BandBHeaderLabel align="left">DATE</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.cellPairing]}>
          <BandBHeaderLabel align="left">PAIRING</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.cellReport]}>
          <BandBHeaderLabel align="left">REPORT</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.cellRoute]}>
          <BandBHeaderLabel align="left">CITY</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.cellDetail]}>
          <BandBHeaderLabel align="left">D-END</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.cellLayover]}>
          <BandBHeaderLabel align="left">LAYOVER</BandBHeaderLabel>
        </View>
        <View style={[styles.headerBandCell, styles.cellWx]}>
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

      <TripPreviewModal
        visible={previewTrip != null}
        trip={previewTrip}
        onClose={closePreview}
        onOpenFullDetail={openFullFromPreview}
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
    gap: 4,
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
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 4,
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
   * CITY is usually 3 letters; D-END is times. Equal flex (1/1) left a wide empty band in CITY vs D-END.
   * Narrow CITY / widen D-END (0.82 + 1.18 = 2) so the gap between labels matches other columns optically.
   */
  cellDate: { flex: 0.9, minWidth: 0, borderRightWidth: DIV, borderRightColor: '#ECEEF1', alignItems: 'flex-start', paddingLeft: 2, paddingRight: 2 },
  cellPairing: {
    flex: 1,
    minWidth: 0,
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  cellReport: { flex: 1, minWidth: 0, borderRightWidth: DIV, borderRightColor: '#ECEEF1', alignItems: 'flex-start', paddingHorizontal: 2 },
  cellRoute: { flex: 0.82, minWidth: 0, borderRightWidth: DIV, borderRightColor: '#ECEEF1', alignItems: 'flex-start', paddingHorizontal: 2 },
  cellDetail: { flex: 1.18, minWidth: 0, borderRightWidth: DIV, borderRightColor: '#ECEEF1', alignItems: 'flex-start', paddingLeft: 2, paddingRight: 0 },
  /** Pull toward D-END: no pl + negative ml eats row gap so LAYOVER/WX clip less on the right. */
  cellLayover: {
    flex: 1,
    minWidth: 0,
    marginLeft: -4,
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
    paddingLeft: 0,
    paddingRight: 2,
  },
  cellWx: { width: 24, minWidth: 24, maxWidth: 24, alignItems: 'flex-start', paddingHorizontal: 0 },
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
  wxCellText: { fontSize: 8, color: '#EAB308', lineHeight: 10, fontWeight: '700', textAlign: 'left', marginLeft: -2 },
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
