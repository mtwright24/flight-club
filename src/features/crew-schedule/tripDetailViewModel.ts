/**
 * View-model for Crew Schedule trip quick preview + full trip detail.
 * Single adapter over `CrewScheduleTrip` — no duplicate fetch logic.
 */

import { routeSummaryFromCanonicalLedgerCities } from './pairingDayApply';
import { departureTimeForDutyDaySortKey } from './scheduleNormalizer';
import { formatLayoverColumnDisplay } from './scheduleTime';
import type { PairingDay } from './pairingDayModel';
import type { CrewScheduleLeg, CrewScheduleTrip, ScheduleCrewMember, ScheduleDutyStatus } from './types';

export type TripStatTile = { id: string; label: string; value: string };

export type TripDayViewModel = {
  dateIso: string;
  /** "Day 1", "Day 2", … */
  dayLabel: string;
  dayIndex: number;
  legs: CrewScheduleLeg[];
  /** Short layover/rest line for this calendar day when import provided it */
  layoverRestLine: string | null;
};

export type TripLayoverHotelPreview = {
  layoverLine: string | null;
  hotelLine: string | null;
};

export type TripDetailViewModel = {
  pairingCode: string;
  routeSummary: string;
  statusLabel: string;
  status: ScheduleDutyStatus;
  dateRangeLabel: string;
  /** e.g. "3 duty days · 12.50 block · 14.00 credit" */
  summaryLine: string;
  statTiles: TripStatTile[];
  crewMembers: ScheduleCrewMember[];
  layoverHotelPreview: TripLayoverHotelPreview | null;
  days: TripDayViewModel[];
  trip: CrewScheduleTrip;
};

export function statusLabelFromTrip(trip: CrewScheduleTrip): string {
  switch (trip.status) {
    case 'flying':
      return 'Flying';
    case 'deadhead':
      return 'Deadhead';
    case 'continuation':
      return 'Continuation';
    case 'off':
      return 'Off';
    case 'pto':
      return 'PTO';
    case 'ptv':
      return 'PTV';
    case 'rsv':
      return 'Reserve';
    case 'training':
      return 'Training';
    default:
      return 'Duty';
  }
}

export function formatTripDateRange(trip: CrewScheduleTrip): string {
  const a = new Date(`${trip.startDate}T12:00:00`);
  const b = new Date(`${trip.endDate}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  if (trip.startDate === trip.endDate) return a.toLocaleDateString(undefined, opts);
  return `${a.toLocaleDateString(undefined, opts)} → ${b.toLocaleDateString(undefined, opts)}`;
}

function formatHoursH(h: number | null | undefined | string): string {
  const n = typeof h === 'number' ? h : Number(h);
  if (h == null || h === '' || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}h`;
}

export function formatLayoverTotalMinutes(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  const mm = Math.round(m);
  const h = Math.floor(mm / 60);
  const rest = mm % 60;
  return `${h}:${String(rest).padStart(2, '0')}`;
}

function layoverRestForDate(trip: CrewScheduleTrip, dateIso: string): string | null {
  const raw = trip.layoverByDate?.[dateIso];
  if (!raw?.trim()) return null;
  const v = formatLayoverColumnDisplay(raw).trim();
  return v || null;
}

function segmentTimeForUi(t: string | null | undefined): string | undefined {
  if (t == null || !String(t).trim()) return undefined;
  const s = String(t).trim();
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  return s;
}

function depTimeLocalForSort(leg: CrewScheduleLeg): string {
  return String(leg.departLocal ?? leg.reportLocal ?? '').trim();
}

function sortLegsByDepartureForTripDetail(legs: CrewScheduleLeg[]): CrewScheduleLeg[] {
  if (legs.length < 2) return legs;
  return [...legs].sort((a, b) => {
    const ka = departureTimeForDutyDaySortKey(depTimeLocalForSort(a));
    const kb = departureTimeForDutyDaySortKey(depTimeLocalForSort(b));
    const c = ka.localeCompare(kb);
    if (c !== 0) return c;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}

function addOneCalendarIso(yyyyMmDd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd).trim());
  if (!m) return yyyyMmDd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Enumerate yyyy-mm-dd inclusive from trip.startDate through trip.endDate. */
function eachTripCalendarIsoInclusive(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = String(startIso).trim().slice(0, 10);
  const end = String(endIso).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cur) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return out;
  while (cur <= end) {
    out.push(cur);
    const nx = addOneCalendarIso(cur);
    if (!nx || nx <= cur || out.length > 380) break;
    cur = nx;
  }
  return out;
}

/** When {@link CrewScheduleTrip.canonicalPairingDays} is set, per-leg flight / block / equipment match `schedule_pairing_legs`. */
function crewLegsFromCanonicalPairingDay(pd: PairingDay, dateIso: string, tripId: string): CrewScheduleLeg[] {
  if (!pd.segments.length) return [];
  return pd.segments.map((seg, index) => ({
    id: `${tripId}-canon-${dateIso}-${index}`,
    dutyDate: dateIso,
    departureAirport: seg.departureStation,
    arrivalAirport: seg.arrivalStation,
    reportLocal: undefined,
    departLocal: segmentTimeForUi(seg.departTimeLocal),
    arriveLocal: segmentTimeForUi(seg.arriveTimeLocal),
    releaseLocal: undefined,
    isDeadhead: seg.isDeadhead,
    flightNumber: seg.flightNumber ?? undefined,
    blockTimeLocal: seg.blockTimeLocal ?? undefined,
    equipmentCode: seg.equipmentCode ?? undefined,
  }));
}

/**
 * One row per calendar day that has at least one leg, sorted by date.
 * If there are no legs, a single synthetic day is returned for the trip start date.
 * When {@link CrewScheduleTrip.canonicalPairingDays} has segments for a date, those replace entry-derived
 * legs (preserves per-leg flight numbers and multi-leg duty days from stored pairing rows).
 * Within each day, legs use {@link departureTimeForDutyDaySortKey}: normal morning deps (including 0553)
 * stay before later same-day deps; true post‑midnight continuations sort after evening.
 */
export function buildTripDays(trip: CrewScheduleTrip): TripDayViewModel[] {
  const byDate = new Map<string, CrewScheduleLeg[]>();
  for (const leg of trip.legs) {
    const d = (leg.dutyDate && /^\d{4}-\d{2}-\d{2}$/.test(leg.dutyDate) ? leg.dutyDate : trip.startDate) ?? trip.startDate;
    const arr = byDate.get(d) ?? [];
    arr.push(leg);
    byDate.set(d, arr);
  }
  if (trip.canonicalPairingDays) {
    for (const [dateIso, pd] of Object.entries(trip.canonicalPairingDays)) {
      if (pd?.phantomBlankDay) continue;
      if (pd?.segments?.length) {
        byDate.set(dateIso, crewLegsFromCanonicalPairingDay(pd, dateIso, trip.id));
      }
    }
  }

  const range = eachTripCalendarIsoInclusive(trip.startDate, trip.endDate);
  if (!range.length) {
    return [
      {
        dateIso: trip.startDate,
        dayLabel: 'Day 1',
        dayIndex: 1,
        legs: [],
        layoverRestLine: null,
      },
    ];
  }

  return range.map((dateIso, i) => {
    const legs = sortLegsByDepartureForTripDetail(byDate.get(dateIso) ?? []);
    /** RULE 7: layover/rest banner only on days with zero flight legs — never bleed onto flying days */
    let layoverRestLine: string | null = null;
    if (legs.length === 0) {
      layoverRestLine = layoverRestForDate(trip, dateIso);
    }
    return {
      dateIso,
      dayLabel: `Day ${i + 1}`,
      dayIndex: i + 1,
      legs,
      layoverRestLine,
    };
  });
}

function buildSummaryLine(trip: CrewScheduleTrip): string {
  const parts: string[] = [];
  parts.push(`${trip.dutyDays} duty day${trip.dutyDays === 1 ? '' : 's'}`);
  const block = trip.pairingBlockHours;
  const credit = trip.pairingCreditHours ?? trip.creditHours;
  const legCount = trip.legs?.length ?? 0;
  if (legCount > 0) parts.push(`${legCount} leg${legCount === 1 ? '' : 's'}`);
  if (block != null && Number.isFinite(block)) parts.push(`${block.toFixed(2)} block`);
  if (credit != null && Number.isFinite(Number(credit))) parts.push(`${Number(credit).toFixed(2)} credit`);
  return parts.join(' · ');
}

function buildStatTiles(trip: CrewScheduleTrip): TripStatTile[] {
  let layVal: string;
  if (trip.tripLayoverTotalMinutes != null && Number.isFinite(trip.tripLayoverTotalMinutes)) {
    layVal = formatLayoverTotalMinutes(trip.tripLayoverTotalMinutes);
  } else if (trip.layoverCity?.trim()) {
    layVal = trip.layoverCity.trim();
  } else {
    layVal = '—';
  }
  return [
    { id: 'block', label: 'Block', value: formatHoursH(trip.pairingBlockHours) },
    { id: 'credit', label: 'Credit', value: formatHoursH(trip.pairingCreditHours ?? trip.creditHours) },
    { id: 'tafb', label: 'TAFB', value: formatHoursH(trip.pairingTafbHours) },
    { id: 'layover', label: 'Layover', value: layVal },
  ];
}

function buildLayoverHotelPreview(trip: CrewScheduleTrip): TripLayoverHotelPreview | null {
  const hotel = trip.hotel;
  const hotelLine =
    hotel?.name != null
      ? [hotel.name, hotel.city, hotel.phone].filter(Boolean).join(' · ') || hotel.name
      : null;
  const lay = trip.layoverCity?.trim() || null;
  if (!lay && !hotelLine) return null;
  return { layoverLine: lay, hotelLine: hotelLine };
}

/**
 * Single entry point: map loaded `CrewScheduleTrip` (already merged with metadata if applicable) to UI view-model.
 */
export function buildTripDetailViewModel(trip: CrewScheduleTrip): TripDetailViewModel {
  const pairingCode = trip.pairingCode !== '—' && trip.pairingCode ? trip.pairingCode : 'Duty';
  const routeFromCanon = routeSummaryFromCanonicalLedgerCities(trip)?.trim();
  return {
    trip,
    pairingCode,
    routeSummary: routeFromCanon || trip.routeSummary || pairingCode,
    status: trip.status,
    statusLabel: statusLabelFromTrip(trip),
    dateRangeLabel: formatTripDateRange(trip),
    summaryLine: buildSummaryLine(trip),
    statTiles: buildStatTiles(trip),
    crewMembers: trip.crewMembers ?? [],
    layoverHotelPreview: buildLayoverHotelPreview(trip),
    days: buildTripDays(trip),
  };
}

export function shortDateLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
