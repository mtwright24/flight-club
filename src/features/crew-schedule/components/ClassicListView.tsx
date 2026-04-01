import React, { memo, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CrewScheduleTrip } from '../types';
import { scheduleTheme as T } from '../scheduleTheme';

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
  routeText: string;
  detailText: string;
  statusText: string;
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
  if (kind === 'off') return 'OFF';
  if (kind === 'pto') return 'PTO';
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
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return '';
  let hour = Number(match[1]);
  const minute = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}${minute}`;
}

function buildRowForTrip(dateIso: string, trip: CrewScheduleTrip, isProxyContinuation: boolean): Omit<DayRow, 'isToday' | 'groupedWithPrev' | 'groupedWithNext'> {
  const d = parseLocalNoon(dateIso);
  const dayIdx = d.getDay();
  const kind = isProxyContinuation ? 'continuation' : statusToKind(trip);
  const leg = trip.legs[0];
  const pairingText = buildRowLabel(trip);
  const reportText =
    kind === 'off' || kind === 'pto' || kind === 'reserve' || kind === 'unavailable' || kind === 'special' || kind === 'continuation'
      ? ''
      : toCompactTime(leg?.reportLocal || leg?.departLocal);
  const routeText =
    kind === 'off' || kind === 'pto'
      ? ''
      : kind === 'reserve'
        ? trip.base
          ? `Base ${trip.base}`
          : 'Base'
        : trip.routeSummary || [trip.origin, trip.destination].filter(Boolean).join(' -> ');
  const detailText =
    kind === 'off'
      ? ''
      : kind === 'pto'
        ? 'Paid time off'
        : kind === 'reserve'
          ? 'Reserve day'
          : kind === 'continuation'
            ? trip.destination
              ? `Dest ${trip.destination}`
              : 'Continuation day'
            : toCompactTime(leg?.releaseLocal || leg?.arriveLocal);
  const statusText =
    kind === 'continuation'
      ? 'CONT'
      : kind === 'off'
        ? 'OFF'
        : kind === 'pto'
          ? 'PTO'
          : kind === 'reserve'
            ? 'RSV'
            : trip.layoverCity || '';

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
    routeText,
    detailText,
    statusText,
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

  const sorted = [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const year = sorted[0].year;
  const month = sorted[0].month;
  const dateRows = new Map<string, Omit<DayRow, 'isToday' | 'groupedWithPrev' | 'groupedWithNext'>[]>();

  for (const trip of sorted) {
    const start = parseLocalNoon(trip.startDate);
    const end = parseLocalNoon(trip.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    for (let t = start.getTime(), i = 0; t <= end.getTime(); t += 24 * 60 * 60 * 1000, i += 1) {
      const dateIso = toIsoDate(new Date(t));
      const row = buildRowForTrip(dateIso, trip, i > 0);
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
        pairingText: '-',
        reportText: '',
        routeText: '',
        detailText: '',
        statusText: '',
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

function kindTint(kind: RowKind): string {
  if (kind === 'off') return '#F4F7FC';
  if (kind === 'pto') return '#ECFDF5';
  if (kind === 'reserve') return '#FFFBEB';
  if (kind === 'unavailable') return '#F8FAFC';
  if (kind === 'special') return '#F8FAFC';
  if (kind === 'continuation') return '#F7FAFF';
  if (kind === 'deadhead') return '#F8FAFC';
  if (kind === 'empty') return '#FFFFFF';
  return '#FFFFFF';
}

function formatHours(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '--';
  return value.toFixed(2);
}

function parseHourMinute(raw?: string): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function durationHours(start?: string, end?: string): number | null {
  const s = parseHourMinute(start);
  const e = parseHourMinute(end);
  if (s == null || e == null) return null;
  let delta = e - s;
  if (delta < 0) delta += 24 * 60;
  return delta / 60;
}

function buildSummaryMetrics(trips: CrewScheduleTrip[]) {
  let credit = 0;
  let block = 0;
  let tafb = 0;
  let hasBlock = false;
  let hasTafb = false;
  let daysOff = 0;

  for (const trip of trips) {
    const kind = statusToKind(trip);
    if (kind === 'off' || kind === 'pto') daysOff += 1;
    if (trip.creditHours != null) credit += trip.creditHours;
    const leg = trip.legs[0];
    const blockDur = durationHours(leg?.departLocal, leg?.arriveLocal);
    if (blockDur != null) {
      hasBlock = true;
      block += blockDur;
    }
    const tafbDur = durationHours(leg?.reportLocal, leg?.releaseLocal);
    if (tafbDur != null) {
      hasTafb = true;
      tafb += tafbDur;
    }
  }

  return [
    { key: 'BLOCK', value: hasBlock ? formatHours(block) : '--' },
    { key: 'CREDIT', value: formatHours(credit) },
    { key: 'TAFB', value: hasTafb ? formatHours(tafb) : '--' },
    { key: 'YTD', value: '--' },
    { key: 'DAYS OFF', value: String(daysOff) },
  ];
}

const ScheduleRow = memo(function ScheduleRow({
  row,
}: {
  row: DayRow;
}) {
  const debugLoggedRef = useRef(false);
  const isEmpty = row.kind === 'empty';
  const dateValue = `${row.dayCode} ${String(row.dayNum).padStart(2, '0')}`;
  const pairingValue = row.pairingText || (isEmpty ? '-' : '');
  const reportValue = row.reportText || '';
  const routeValue = row.routeText || '';
  const detailValue = row.detailText || '';
  const statusValue = row.statusText || '';
  const rowStyle = [
    styles.row,
    isEmpty && styles.emptyRow,
    { backgroundColor: kindTint(row.kind) },
    row.isWeekend && styles.weekendRow,
    row.isToday && styles.todayRow,
    row.groupedWithPrev && styles.tripChainRow,
  ];

  if (!debugLoggedRef.current && row.dateIso.endsWith('-24')) {
    debugLoggedRef.current = true;
    console.log('[ClassicList debug row]', {
      dateIso: row.dateIso,
      date: `${row.dayCode} ${String(row.dayNum).padStart(2, '0')}`,
      pairing: pairingValue,
      report: reportValue,
      route: routeValue,
      detail: detailValue,
      status: statusValue,
    });
  }

  const content = (
    <>
      <View style={[styles.rowCell, styles.cellDate]}>
        <Text style={[styles.cellText, styles.dateInline, row.isToday && styles.todayDateInline]} numberOfLines={1} ellipsizeMode="tail">
          {dateValue}
        </Text>
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
          {routeValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellDetail]}>
        <Text style={[styles.cellText, styles.detailCellText, isEmpty && styles.routePlaceholder]} numberOfLines={1} ellipsizeMode="tail">
          {detailValue}
        </Text>
      </View>
      <View style={[styles.rowCell, styles.cellStatus]}>
        <Text style={[styles.cellText, styles.statusCellText, isEmpty && styles.routePlaceholder]} numberOfLines={1} ellipsizeMode="tail">
          {statusValue}
        </Text>
      </View>
    </>
  );
  return <View style={rowStyle}>{content}</View>;
});

function EmptyMonth({
  onImportSchedule,
}: {
  onImportSchedule?: () => void;
}) {
  return (
    <View style={styles.emptyMonth}>
      <Text style={styles.emptyMonthTitle}>No schedule for this month</Text>
      <Text style={styles.emptyMonthBody}>Import your schedule to populate Classic List.</Text>
      {onImportSchedule ? (
        <Pressable style={styles.importBtn} onPress={onImportSchedule}>
          <Text style={styles.importBtnText}>Import Schedule</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type Props = {
  trips: CrewScheduleTrip[];
  onPressTrip: (trip: CrewScheduleTrip) => void;
  onImportSchedule?: () => void;
};

export default function ClassicListView({ trips, onPressTrip: _onPressTrip, onImportSchedule }: Props) {
  const rows = useMemo(() => rowsFromTrips(trips), [trips]);
  const summary = useMemo(() => buildSummaryMetrics(trips), [trips]);

  if (!trips.length) {
    return <EmptyMonth onImportSchedule={onImportSchedule} />;
  }

  return (
    <View style={styles.tableWrap}>
      <View style={styles.summaryStrip}>
        {summary.map((item) => (
          <View key={item.key} style={styles.summaryInlineItem}>
            <Text style={styles.summaryKey}>{item.key}</Text>
            <Text style={styles.summaryValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.headerRow}>
        <View style={[styles.headerCell, styles.cellDate]}>
          <Text style={styles.headerText} numberOfLines={1}>DATE</Text>
        </View>
        <View style={[styles.headerCell, styles.cellPairing]}>
          <Text style={styles.headerText} numberOfLines={1}>PAIRING</Text>
        </View>
        <View style={[styles.headerCell, styles.cellReport]}>
          <Text style={styles.headerText} numberOfLines={1}>REPORT</Text>
        </View>
        <View style={[styles.headerCell, styles.cellRoute]}>
          <Text style={styles.headerText} numberOfLines={1}>CITY / ROUTE</Text>
        </View>
        <View style={[styles.headerCell, styles.cellDetail]}>
          <Text style={styles.headerText} numberOfLines={1}>D-END / DETAIL</Text>
        </View>
        <View style={[styles.headerCell, styles.cellStatus]}>
          <Text style={styles.headerText} numberOfLines={1}>LAYOVER / STATUS</Text>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ScheduleRow row={item} />}
        contentContainerStyle={styles.wrap}
        initialNumToRender={22}
        maxToRenderPerBatch={24}
        windowSize={9}
        removeClippedSubviews
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tableWrap: {
    backgroundColor: '#FFFFFF',
  },
  wrap: { paddingBottom: 0 },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    borderBottomWidth: DIV,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FAFBFC',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  summaryInlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  summaryKey: {
    fontSize: 7,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.15,
  },
  summaryValue: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 16,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: DIV,
    borderBottomColor: '#D8E2EE',
  },
  headerText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.1,
  },
  headerCell: {
    height: 18,
    paddingHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  rowCell: {
    height: 22,
    paddingHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    height: 22,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: DIV,
    borderBottomColor: '#E2E8F0',
    overflow: 'hidden',
  },
  emptyRow: {
    height: 14,
  },
  cellDate: { width: 48, minWidth: 48, maxWidth: 48, borderRightWidth: DIV, borderRightColor: '#E2E8F0', alignItems: 'flex-start' },
  cellPairing: { width: 58, minWidth: 58, maxWidth: 58, borderRightWidth: DIV, borderRightColor: '#E2E8F0', alignItems: 'flex-start' },
  cellReport: { width: 46, minWidth: 46, maxWidth: 46, borderRightWidth: DIV, borderRightColor: '#E2E8F0', alignItems: 'flex-start' },
  cellRoute: { flex: 1.2, minWidth: 0, borderRightWidth: DIV, borderRightColor: '#E2E8F0', alignItems: 'flex-start' },
  cellDetail: { width: 76, minWidth: 76, maxWidth: 76, borderRightWidth: DIV, borderRightColor: '#E2E8F0', alignItems: 'flex-start' },
  cellStatus: { width: 76, minWidth: 76, maxWidth: 76, alignItems: 'flex-start' },
  weekendRow: {
    backgroundColor: '#F5F7FA',
  },
  noPressRow: {
    opacity: 0.96,
  },
  pressedRow: {
    opacity: 0.95,
  },
  todayRow: {
    backgroundColor: '#E9EEF6',
  },
  tripChainRow: {
    borderLeftWidth: 0,
  },
  cellText: { width: '100%', fontSize: 8, color: '#334155', lineHeight: 10, fontWeight: '700' },
  dateInline: { fontSize: 8, fontWeight: '700', color: '#334155', lineHeight: 10, letterSpacing: 0.1 },
  todayDateInline: { color: '#1E3A8A', fontWeight: '800' },
  assignmentCode: { fontSize: 9, fontWeight: '800', color: T.text, lineHeight: 10 },
  routeMain: { fontSize: 9, fontWeight: '700', color: '#0F172A', lineHeight: 10 },
  detailCellText: { fontSize: 8, color: '#4B5563', lineHeight: 10, fontWeight: '600' },
  statusCellText: { fontSize: 8, color: '#334155', lineHeight: 10, fontWeight: '700' },
  routePlaceholder: { fontSize: 8, color: '#B0BFD1', lineHeight: 10 },
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
