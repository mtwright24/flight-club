import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CrewScheduleTrip, ScheduleMonthMetrics } from '../types';
import { addIsoDays } from '../ledgerContext';
import {
  buildFcvPairingCityColumn,
  isFcvClassicContinuationRow,
  shouldShowPairingInClassicLedgerMonth,
} from '../ledgerDisplay';
import { earliestOperationalDutyIso, type PairingDay } from '../pairingDayModel';
import {
  formatLayoverColumnDisplay,
  mergeLayoverOntoLegDates,
  parseScheduleTimeMinutes,
  resolveClassicLayoverColumn,
} from '../scheduleTime';
import { mergeLedgerPairingBlocks } from '../pairingBlockMerge';
import { departureTimeForDutyDaySortKey } from '../scheduleNormalizer';
import { scheduleTheme as T } from '../scheduleTheme';
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

type DayRowBuilt = Omit<DayRow, 'isToday' | 'groupedWithPrev' | 'groupedWithNext'>;

function normPairingForDedupe(pc: string | null | undefined): string {
  return String(pc ?? '')
    .trim()
    .toUpperCase();
}

/**
 * Display-only: same calendar day + same pairing (duplicate `trip_group`/merged fetch) → one row.
 * Import pipeline unchanged; richer row wins (times + city + legs/canonical).
 */
function classicRowDedupeKey(e: DayRowBuilt): string {
  const t = e.trip;
  if (!t) return `__${e.id}`;
  const pc = normPairingForDedupe(t.pairingCode);
  if (
    pc &&
    pc !== '—' &&
    pc !== 'CONT' &&
    pc !== 'RDO'
  ) {
    return `pair:${pc}`;
  }
  return `trip:${t.id}:${e.kind}`;
}

function classicRowRichness(e: DayRowBuilt): number {
  let n = 0;
  const z = (x: string | undefined) => (String(x ?? '').trim() ? 1 : 0);
  n += z(e.pairingText) * 3;
  n += z(e.reportText) * 2;
  n += z(e.cityText) * 2;
  n += z(e.dEndText);
  n += z(e.layoverText);
  if ((e.trip?.legs?.length ?? 0) > 0) n += 1;
  if (e.trip?.canonicalPairingDays && Object.keys(e.trip.canonicalPairingDays).length > 0) n += 3;
  return n;
}

function dedupeClassicRowsSameCalendarDay(entries: DayRowBuilt[]): DayRowBuilt[] {
  if (entries.length < 2) return entries;
  const byKey = new Map<string, DayRowBuilt>();
  for (const e of entries) {
    const k = classicRowDedupeKey(e);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, e);
      continue;
    }
    byKey.set(k, classicRowRichness(e) > classicRowRichness(prev) ? e : prev);
  }
  return [...byKey.values()].sort((a, b) => {
    if (!a.trip || !b.trip) return 0;
    return a.trip.startDate.localeCompare(b.trip.startDate);
  });
}

function statusToKind(trip: CrewScheduleTrip): RowKind {
  if (trip.status === 'off') return 'off';
  if (trip.status === 'ptv') return 'ptv';
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
  if (kind === 'ptv') return 'PTV';
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

/**
 * LAYOVER column: FLICA layover rest (4 digits from last leg’s layover cell / `layover_rest_display`),
 * not the first departure of the day.
 */
function layoverColumnForFlyingLedger(
  trip: CrewScheduleTrip,
  dateIso: string,
  canon: PairingDay | undefined,
): string {
  if (canon) {
    return formatLayoverColumnDisplay(canon.layoverRestDisplay) || '';
  }
  return resolveClassicLayoverColumn(trip, dateIso);
}

type ClassicLedgerMonthCtx = {
  fullDateList: readonly string[];
  viewMonthStart: string;
  viewMonthEnd: string;
};

function buildRowForTrip(
  dateIso: string,
  trip: CrewScheduleTrip,
  isProxyContinuation: boolean,
  dayIndexInTrip: number,
  ledgerMonthCtx: ClassicLedgerMonthCtx,
): Omit<DayRow, 'isToday' | 'groupedWithPrev' | 'groupedWithNext'> {
  const d = parseLocalNoon(dateIso);
  const dayIdx = d.getDay();
  const ptvEveryDay = trip.status === 'ptv';
  const baseKind = statusToKind(trip);
  const useLedger = (baseKind === 'trip' || baseKind === 'deadhead') && !ptvEveryDay;

  if (useLedger) {
    return buildRowFlyingLedger(dateIso, trip, d, dayIdx, ledgerMonthCtx);
  }

  const kind = isProxyContinuation ? 'continuation' : baseKind;
  const legsOnDate = trip.legs.filter((l) => l.dutyDate === dateIso);
  const legForDay = legsOnDate.length ? legsOnDate[legsOnDate.length - 1] : undefined;
  const firstLegOnDate = legsOnDate[0];
  const leg = legForDay ?? (!isProxyContinuation && trip.legs.length ? trip.legs[0] : undefined);
  let pairingText = kind === 'continuation' ? '' : buildRowLabel(trip);
  if (
    pairingText &&
    !isProxyContinuation &&
    dayIndexInTrip === 0 &&
    trip.pairingTafbHours != null &&
    kind !== 'off' &&
    kind !== 'pto' &&
    kind !== 'ptv' &&
    kind !== 'reserve' &&
    kind !== 'unavailable'
  ) {
    pairingText = `${pairingText}  ${formatPairingTafbSameLine(trip.pairingTafbHours)}`;
  }
  const reportText =
    kind === 'off' ||
    kind === 'pto' ||
    kind === 'ptv' ||
    kind === 'reserve' ||
    kind === 'unavailable' ||
    kind === 'special' ||
    kind === 'continuation'
      ? ''
      : toCompactTime(firstLegOnDate?.reportLocal || firstLegOnDate?.departLocal || leg?.reportLocal || leg?.departLocal);
  const cityText =
    kind === 'off' || kind === 'pto' || kind === 'ptv'
      ? ''
      : kind === 'reserve'
        ? compactToken(trip.base)
        : kind === 'continuation'
          ? legForDay
            ? compactToken(legForDay.arrivalAirport)
            : ''
        : compactToken(leg?.arrivalAirport) || compactToken(trip.origin) || compactToken(trip.routeSummary);
  const dEndText =
    kind === 'off' || kind === 'pto' || kind === 'ptv' || kind === 'reserve' || kind === 'unavailable' || kind === 'special' || kind === 'continuation'
      ? ''
      : toCompactTime(legsOnDate.length ? legsOnDate[legsOnDate.length - 1]?.releaseLocal : leg?.releaseLocal);
  const layoverText = resolveClassicLayoverColumn(trip, dateIso);
  const wxText =
    kind === 'off' || kind === 'pto' || kind === 'ptv' || kind === 'reserve' || kind === 'unavailable' || kind === 'special'
      ? ''
      : '☀︎';
  const statusText =
    kind === 'continuation'
      ? 'CONT'
      : kind === 'off'
        ? 'OFF'
        : kind === 'pto'
          ? 'PTO'
          : kind === 'ptv'
            ? 'PTV'
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

function buildRowFlyingLedger(
  dateIso: string,
  trip: CrewScheduleTrip,
  d: Date,
  dayIdx: number,
  ledgerMonthCtx: ClassicLedgerMonthCtx,
): Omit<DayRow, 'isToday' | 'groupedWithPrev' | 'groupedWithNext'> {
  const canon = trip.canonicalPairingDays?.[dateIso];
  const legsOnDate = trip.legs
    .filter((l) => l.dutyDate === dateIso)
    .sort((a, b) =>
      departureTimeForDutyDaySortKey(a.departLocal).localeCompare(departureTimeForDutyDaySortKey(b.departLocal)),
    );
  const cityText = canon
    ? canon.displayCityLedger
    : buildFcvPairingCityColumn(trip, dateIso);
  const showPairing = shouldShowPairingInClassicLedgerMonth(
    trip,
    dateIso,
    ledgerMonthCtx.fullDateList,
    ledgerMonthCtx.viewMonthStart,
    ledgerMonthCtx.viewMonthEnd,
  );
  const base = statusToKind(trip);
  /** Prefer canonical `schedule_pairing_legs` when present; else FCV on synthetic legs. */
  /** `pureBaseArrivalOnly`: block ends arrival-only row — no REPORT/D‑END/LAY (Crewline F24-style). */
  const isContLike = canon
    ? canon.continuationDay || canon.pureBaseArrivalOnly === true
    : isFcvClassicContinuationRow(trip, dateIso);
  const kind: RowKind = isContLike ? 'continuation' : base;

  const firstLegOnDate = legsOnDate[0];
  const lastLegOnDate = legsOnDate.length ? legsOnDate[legsOnDate.length - 1] : undefined;
  const legForTime = firstLegOnDate ?? (trip.legs.length ? trip.legs[0] : undefined);
  const priorDateIso = addIsoDays(dateIso, -1);
  const prevDayLegs =
    !canon && dateIso > trip.startDate
      ? trip.legs
          .filter((l) => l.dutyDate === priorDateIso)
          .sort((a, b) =>
            departureTimeForDutyDaySortKey(a.departLocal).localeCompare(departureTimeForDutyDaySortKey(b.departLocal)),
          )
      : [];
  const lastLegPrevDay = prevDayLegs.length ? prevDayLegs[prevDayLegs.length - 1] : undefined;

  let pairingText = showPairing ? buildRowLabel(trip) : '';
  if (
    pairingText &&
    showPairing &&
    trip.pairingTafbHours != null &&
    kind !== 'off' &&
    kind !== 'pto' &&
    kind !== 'ptv' &&
    kind !== 'reserve' &&
    kind !== 'unavailable'
  ) {
    pairingText = `${pairingText}  ${formatPairingTafbSameLine(trip.pairingTafbHours)}`;
  }
  const reportText =
    kind === 'off' ||
    kind === 'pto' ||
    kind === 'ptv' ||
    kind === 'reserve' ||
    kind === 'unavailable' ||
    kind === 'special' ||
    kind === 'continuation'
      ? ''
      : canon
        ? toCompactTime(canon.reportTimeDisplay ?? undefined)
        : toCompactTime(
            dateIso === trip.startDate
              ? firstLegOnDate?.reportLocal || firstLegOnDate?.departLocal
              : firstLegOnDate?.reportLocal ||
                  lastLegPrevDay?.releaseLocal ||
                  firstLegOnDate?.departLocal,
          );
  const dEndText =
    kind === 'off' ||
    kind === 'pto' ||
    kind === 'ptv' ||
    kind === 'reserve' ||
    kind === 'unavailable' ||
    kind === 'special' ||
    kind === 'continuation'
      ? ''
      : canon
        ? toCompactTime(canon.dEndTimeDisplay ?? undefined)
        : toCompactTime(legsOnDate.length ? lastLegOnDate?.arriveLocal : legForTime?.arriveLocal);
  const layoverText = layoverColumnForFlyingLedger(trip, dateIso, canon);
  const wxText =
    kind === 'off' ||
    kind === 'pto' ||
    kind === 'ptv' ||
    kind === 'reserve' ||
    kind === 'unavailable' ||
    kind === 'special' ||
    kind === 'continuation'
      ? ''
      : '☀︎';
  const statusText =
    kind === 'continuation'
      ? 'CONT'
      : kind === 'off'
        ? 'OFF'
        : kind === 'pto'
          ? 'PTO'
          : kind === 'ptv'
            ? 'PTV'
            : kind === 'reserve'
              ? 'RSV'
              : '';
  const reportMinutes = parseScheduleTimeMinutes(
    canon ? canon.reportTimeDisplay : firstLegOnDate?.reportLocal || firstLegOnDate?.departLocal,
  );
  const releaseMinutes = parseScheduleTimeMinutes(
    canon ? canon.dEndTimeDisplay : lastLegOnDate?.arriveLocal,
  );

  return {
    id: `${trip.id}:${dateIso}:ledger`,
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

/** Last ISO day yyyy-mm-dd inclusive for [year, month1–12]; never spills into next month. */
function viewMonthLastIso(year: number, month1to12: number): string {
  const lastDom = new Date(year, month1to12, 0).getDate();
  const m = String(month1to12).padStart(2, '0');
  return `${year}-${m}-${String(lastDom).padStart(2, '0')}`;
}

/** One ISO per calendar day in the viewed month — string math only (no Date rollover bugs). */
function enumerateMonthDates(year: number, month: number): string[] {
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

/**
 * Carry-out tail: spillover ISO dates **after** the viewed month last day through `trip.endDate`,
 * for trips that overlap `[viewMonthStart, monthLastIso]` but end later (matches Crewline continuation).
 */
function trailingCarryOutDates(
  trips: CrewScheduleTrip[],
  viewMonthStart: string,
  monthLastIso: string,
): string[] {
  const dayAfterMonth = addIsoDays(monthLastIso, 1);
  const out = new Set<string>();
  for (const t of trips) {
    const pc = String(t.pairingCode ?? '')
      .trim()
      .toUpperCase();
    if (!pc || pc === 'PTO' || pc === 'PTV' || pc === 'CONT' || pc === '—') continue;
    if (t.endDate < viewMonthStart || t.startDate > monthLastIso) continue;
    if (t.endDate <= monthLastIso) continue;
    const loopStart = t.startDate > dayAfterMonth ? t.startDate : dayAfterMonth;
    if (loopStart > t.endDate) continue;
    for (let d = loopStart; d <= t.endDate; d = addIsoDays(d, 1)) {
      if (d > monthLastIso) out.add(d);
    }
  }
  return [...out].sort();
}

/** Extend Classic ledger pairing window when carry-out trailing May days append after Apr 30, etc. */
function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

/**
 * Drops bogus pairing paint on viewed month dom 01–02 when FLICA/canon proves first duty lands later:
 * avoids May-side carry pairing rows occupying Apr 1–2 at the top (display-only).
 */
function skipPhantomTopOfMonthDutyRowForTrip(trip: CrewScheduleTrip, dateIso: string, viewMonthStart: string): boolean {
  if (dateIso < viewMonthStart) return false;
  const ew = earliestOperationalDutyIso(trip);
  if (!ew) return false;
  const dom0 = viewMonthStart;
  const dom1 = addIsoDays(dom0, 1);
  return (dateIso === dom0 || dateIso === dom1) && dateIso < ew;
}

/** ISO dates in `trip` strictly before `monthStartIso` capped at calendar day before that month start (carry-in head). */
function priorMonthDaysBeforeView(trip: CrewScheduleTrip, monthStartIso: string): string[] {
  if (trip.startDate >= monthStartIso) return [];
  const lastBeforeView = addIsoDays(monthStartIso, -1);
  const spanEnd = trip.endDate < lastBeforeView ? trip.endDate : lastBeforeView;
  if (spanEnd < trip.startDate) return [];
  const out: string[] = [];
  for (let d = trip.startDate; d <= spanEnd; d = addIsoDays(d, 1)) {
    if (d >= monthStartIso) break;
    out.push(d);
  }
  return out.filter((iso) => iso < monthStartIso);
}

function isTripLikeKind(kind: RowKind): boolean {
  return kind === 'trip' || kind === 'continuation' || kind === 'deadhead';
}

function rowsFromTrips(trips: CrewScheduleTrip[], viewYear: number, viewMonth: number): DayRow[] {
  if (!trips.length) return [];

  const viewMonthStart = `${viewYear}-${String(viewMonth).padStart(2, '0')}-01`;
  const sorted = mergeLedgerPairingBlocks(
    [...trips].map((t) => {
      const merged = mergeLayoverOntoLegDates(t);
      return merged ? { ...t, layoverByDate: merged } : t;
    }),
    1,
  ).sort((a, b) => a.startDate.localeCompare(b.startDate));

  const leading = new Set<string>();
  for (const t of sorted) {
    for (const d of priorMonthDaysBeforeView(t, viewMonthStart)) {
      leading.add(d);
    }
  }

  /** Prior-month carry dates only (`yyyy-mm` strictly **before** the viewed month) — rejects future-month leaks. */
  const viewYm = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
  const leadingSortedEligible = Array.from(leading)
    .filter((d) => {
      const yym = d.slice(0, 7);
      return d < viewMonthStart && yym < viewYm;
    })
    .sort();

  const inMonth = enumerateMonthDates(viewYear, viewMonth);
  const monthLastIso = viewMonthLastIso(viewYear, viewMonth);
  const trailing = trailingCarryOutDates(sorted, viewMonthStart, monthLastIso);
  const ledgerViewEndIso = trailing.length ? maxIso(monthLastIso, trailing[trailing.length - 1]!) : monthLastIso;

  const baseList = [...leadingSortedEligible, ...inMonth].filter((iso) => {
    if (iso < viewMonthStart) {
      const yym = iso.slice(0, 7);
      return yym < viewYm;
    }
    return iso >= viewMonthStart && iso <= monthLastIso && iso.slice(0, 7) === viewYm;
  });

  /** Carry-out spill (e.g. May 1+) after viewed month tail — excludes dates already covered by trailing month_key fetch duplicates. */
  const trailingEligible = trailing.filter((iso) => {
    const ym = iso.slice(0, 7);
    return ym > viewYm;
  });

  const fullDateList = [...baseList, ...trailingEligible];

  const ledgerMonthCtx: ClassicLedgerMonthCtx = {
    fullDateList,
    viewMonthStart,
    viewMonthEnd: ledgerViewEndIso,
  };

  const dateRows = new Map<string, Omit<DayRow, 'isToday' | 'groupedWithPrev' | 'groupedWithNext'>[]>();

  for (const trip of sorted) {
    const start = parseLocalNoon(trip.startDate);
    const end = parseLocalNoon(trip.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const ptvEveryDay = trip.status === 'ptv';
    for (let tt = start.getTime(), i = 0; tt <= end.getTime(); tt += 24 * 60 * 60 * 1000, i += 1) {
      const dateIso = dateToIsoDateLocal(new Date(tt));
      if (skipPhantomTopOfMonthDutyRowForTrip(trip, dateIso, viewMonthStart)) continue;
      const row = buildRowForTrip(dateIso, trip, ptvEveryDay ? false : i > 0, i, ledgerMonthCtx);
      if (!dateRows.has(dateIso)) dateRows.set(dateIso, []);
      dateRows.get(dateIso)!.push(row);
    }
  }

  const todayIso = dateToIsoDateLocal(new Date());
  const rows: DayRow[] = [];
  for (const dateIso of fullDateList) {
    const sortedDay = (dateRows.get(dateIso) || []).sort((a, b) => {
      if (!a.trip || !b.trip) return 0;
      return a.trip.startDate.localeCompare(b.trip.startDate);
    });
    const entries = dedupeClassicRowsSameCalendarDay(sortedDay);
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

  return attachDayRowGrouping(rows);
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

  const dataPlaceholder = isEmpty;
  const wxMuted = isEmpty;

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
          style={[styles.cellText, styles.assignmentCode, dataPlaceholder && styles.routePlaceholder]}
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
          style={[styles.cellText, styles.detailCellText, dataPlaceholder && styles.routePlaceholder]}
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
  monthMetrics,
  onPressTrip,
  onOpenManage,
}: Props) {
  const [previewTrip, setPreviewTrip] = useState<CrewScheduleTrip | null>(null);
  const onLongPressTrip = useCallback((t: CrewScheduleTrip) => setPreviewTrip(t), []);
  const closePreview = useCallback(() => setPreviewTrip(null), []);
  const openFullFromPreview = useCallback(() => {
    const t = previewTrip;
    setPreviewTrip(null);
    if (t) onPressTrip(t);
  }, [previewTrip, onPressTrip]);

  const rows = useMemo(() => rowsFromTrips(trips, year, month), [trips, year, month]);
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
    gap: 3,
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
  /** Same width as `cellWx`. */
  headerBandWx: {
    width: 24,
    minWidth: 24,
    maxWidth: 24,
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
    flexGrow: 0,
    flexShrink: 0,
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
    gap: 3,
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
  /** Classic grid: fixed pixel widths only (Layer 8); every row uses the same columns. */
  cellDate: {
    width: 44,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
  },
  cellPairing: {
    width: 68,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cellReport: {
    width: 52,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
  },
  cellRoute: {
    width: 44,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
  },
  cellDetail: {
    width: 52,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
  },
  cellLayover: {
    width: 52,
    overflow: 'hidden',
    borderRightWidth: DIV,
    borderRightColor: '#ECEEF1',
    alignItems: 'flex-start',
  },
  cellWx: {
    width: 24,
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
