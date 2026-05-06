import type { CrewScheduleTrip } from "../types";
import type { ClassicScheduleRow } from "../buildClassicRows";
import { isFlicaNonFlyingActivityId } from "../../../services/flicaScheduleHtmlParser";

const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
/**
 * Carry-in prefix: trips that began before day 1 of the viewed month (e.g. late March at top of April).
 * We still block **future-calendar-month** ISO rows (mis-keyed imports / overlap) so May+ never blends above April.
 */

export type RowKind =
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

export type DayRow = {
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

function parseLocalNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

/** Calendar date in local timezone — avoids UTC shift (e.g. May 1–2 appearing above April) from `toISOString()`. */
export function dateToIsoDateLocal(d: Date): string {
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
export type ClassicDisplayItem = {
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

export function isTripLikeKind(kind: RowKind): boolean {
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

export function buildClassicDisplayItems(
  isReady: boolean,
  classicCommit: { ymKey: string; classicRows: ClassicScheduleRow[] } | null,
  ymKey: string,
  mergedTrips: CrewScheduleTrip[],
  year: number,
  month: number,
): ClassicDisplayItem[] | null {
  if (!isReady || !classicCommit || classicCommit.ymKey !== ymKey) return null;
  const classicRows = classicCommit.classicRows;
  const monthLastIso = viewMonthLastIso(year, month);
  const viewMonthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const viewYm = `${year}-${String(month).padStart(2, "0")}`;
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
}

export function buildDayRowsFromDisplayItems(
  viewModelRows: ClassicDisplayItem[],
  mergedTrips: CrewScheduleTrip[],
  todayIso: string,
): DayRow[] {
  return attachDayRowGrouping(
    viewModelRows.map((item, rowIdx) => displayItemToDayRow(item, mergedTrips, todayIso, rowIdx)),
  );
}
