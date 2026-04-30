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
  /** Stable key (unique per operating duty block; same calendar date may repeat). */
  panelId: string;
  dateIso: string;
  /** Calendar display "MM-DD" e.g. "04-06". */
  dateShort: string;
  /** DOW e.g. "MON". */
  dayLabel: string;
  /** 1-based operating panel index. */
  dayIndex: number;
  legs: CrewScheduleLeg[];
  /** Legacy: layover-only placeholder panels; operating panels use leg-level layover rows. */
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

export function formatHoursH(h: number | null | undefined | string): string {
  const n = typeof h === 'number' ? h : Number(h);
  if (h == null || h === '' || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}`;
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

function dayOfWeekShortLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim().slice(0, 10))) return '—';
  const d = new Date(`${String(iso).trim().slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function dateShortMmDd(iso: string): string {
  const s = String(iso).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return `${s.slice(5, 7)}-${s.slice(8, 10)}`;
}

function clockToMinutes(raw: string | null | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim();
  if (/^\d{4}$/.test(s)) {
    const hh = Number(s.slice(0, 2));
    const mm = Number(s.slice(2, 4));
    if (hh > 47 || mm > 59) return null;
    return hh * 60 + mm;
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const hh = Number(m24[1]);
    const mm = Number(m24[2]);
    if (hh > 23 || mm > 59) return null;
    return hh * 60 + mm;
  }
  return null;
}

/** Ground time between consecutive legs on the same operating calendar date (arrival → next departure). */
function groundGapMinutesSameDay(prev: CrewScheduleLeg, next: CrewScheduleLeg): number | null {
  const arr = clockToMinutes(prev.arriveLocal);
  const dep = clockToMinutes(next.departLocal);
  if (arr == null || dep == null) return null;
  let gap = dep - arr;
  if (gap < 0) gap += 24 * 60;
  return gap;
}

/** When sit time exceeds this between same-day legs, start a new operating panel (Crewline-style duty split). */
const OPERATING_SPLIT_GAP_MINUTES = 180;

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
 * One panel per operating duty / leg group (Crewline-style), not per calendar date.
 * Same calendar date may yield multiple panels when a new report period starts (second `schedule_entries` row)
 * or when ground time between consecutive legs exceeds {@link OPERATING_SPLIT_GAP_MINUTES}.
 * Dates with no flight legs do not produce panels (layover-only days live in the trip layover section).
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

  const datesWithLegs = [...byDate.keys()]
    .filter((d) => (byDate.get(d) ?? []).length > 0)
    .sort((a, b) => a.localeCompare(b));

  const panels: TripDayViewModel[] = [];
  let dayIndex = 0;

  for (const dateIso of datesWithLegs) {
    const sorted = sortLegsByDepartureForTripDetail(byDate.get(dateIso)!);
    const groups: CrewScheduleLeg[][] = [];
    let cur: CrewScheduleLeg[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const leg = sorted[i]!;
      const prev = cur.length > 0 ? cur[cur.length - 1]! : null;
      const hasExplicitReport = leg.reportLocal != null && String(leg.reportLocal).trim() !== '';
      const gapMin = prev ? groundGapMinutesSameDay(prev, leg) : null;
      const splitByGap = prev != null && gapMin != null && gapMin >= OPERATING_SPLIT_GAP_MINUTES;
      const splitByReport = prev != null && hasExplicitReport;
      const startNew = splitByReport || splitByGap;

      if (startNew) {
        if (cur.length) groups.push(cur);
        cur = [leg];
      } else {
        cur.push(leg);
      }
    }
    if (cur.length) groups.push(cur);

    for (let g = 0; g < groups.length; g++) {
      const legs = groups[g]!;
      dayIndex++;
      const panelId = `${dateIso}-op${g}-${legs[0]?.id ?? g}`;
      panels.push({
        panelId,
        dateIso,
        dateShort: dateShortMmDd(dateIso),
        dayLabel: dayOfWeekShortLabel(dateIso),
        dayIndex,
        legs,
        layoverRestLine: null,
      });
    }
  }

  if (!panels.length) {
    const iso = String(trip.startDate).trim().slice(0, 10);
    return [
      {
        panelId: `placeholder-${iso}`,
        dateIso: iso,
        dateShort: dateShortMmDd(iso),
        dayLabel: dayOfWeekShortLabel(iso),
        dayIndex: 1,
        legs: [],
        layoverRestLine: layoverRestForDate(trip, iso),
      },
    ];
  }

  return panels;
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
  const days = buildTripDays(trip);
  if (typeof __DEV__ !== 'undefined' && __DEV__ && String(trip.pairingCode).trim().toUpperCase() === 'J4173') {
    console.log('[detail operating panels]', {
      panelCount: days.length,
      panels: days.map((p) => ({
        date: p.dateIso,
        report: p.legs[0]?.reportLocal ?? null,
        legs: p.legs.length,
        route: p.legs.map((l) => `${l.departureAirport}→${l.arrivalAirport}`).join(', '),
        dEnd: p.legs[p.legs.length - 1]?.releaseLocal ?? null,
        layover:
          p.legs
            .map((l) => l.layoverRestDisplay ?? l.layoverCityLeg)
            .filter(Boolean)
            .join('; ') || null,
        hotel: trip.hotel?.name ?? null,
      })),
    });
  }
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
    days,
  };
}

export function shortDateLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
