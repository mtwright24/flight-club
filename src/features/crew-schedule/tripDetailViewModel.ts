/**
 * View-model for Crew Schedule trip quick preview + full trip detail.
 * Single adapter over `CrewScheduleTrip` — no duplicate fetch logic.
 */

import { formatLayoverColumnDisplay } from './scheduleTime';
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

/**
 * One row per calendar day that has at least one leg, sorted by date.
 * If there are no legs, a single synthetic day is returned for the trip start date.
 */
export function buildTripDays(trip: CrewScheduleTrip): TripDayViewModel[] {
  const byDate = new Map<string, CrewScheduleLeg[]>();
  for (const leg of trip.legs) {
    const d = (leg.dutyDate && /^\d{4}-\d{2}-\d{2}$/.test(leg.dutyDate) ? leg.dutyDate : trip.startDate) ?? trip.startDate;
    const arr = byDate.get(d) ?? [];
    arr.push(leg);
    byDate.set(d, arr);
  }
  const dates = [...byDate.keys()].sort((x, y) => x.localeCompare(y));
  for (const d of dates) {
    const row = byDate.get(d);
    if (row && row.length > 1) {
      row.sort((a, b) => (a.departLocal ?? '').localeCompare(b.departLocal ?? ''));
    }
  }
  if (dates.length === 0) {
    return [
      {
        dateIso: trip.startDate,
        dayLabel: 'Day 1',
        dayIndex: 1,
        legs: [],
        layoverRestLine: layoverRestForDate(trip, trip.startDate),
      },
    ];
  }
  return dates.map((dateIso, i) => ({
    dateIso,
    dayLabel: `Day ${i + 1}`,
    dayIndex: i + 1,
    legs: byDate.get(dateIso) ?? [],
    layoverRestLine: layoverRestForDate(trip, dateIso),
  }));
}

function buildSummaryLine(trip: CrewScheduleTrip): string {
  const parts: string[] = [];
  parts.push(`${trip.dutyDays} duty day${trip.dutyDays === 1 ? '' : 's'}`);
  const block = trip.pairingBlockHours;
  const credit = trip.pairingCreditHours ?? trip.creditHours;
  if (block != null && Number.isFinite(block)) parts.push(`${block.toFixed(2)} block`);
  if (credit != null && Number.isFinite(Number(credit))) parts.push(`${Number(credit).toFixed(2)} credit`);
  return parts.join(' · ');
}

function buildStatTiles(trip: CrewScheduleTrip): TripStatTile[] {
  const layVal =
    trip.tripLayoverTotalMinutes != null
      ? formatLayoverTotalMinutes(trip.tripLayoverTotalMinutes)
      : trip.layoverCity
        ? trip.layoverCity
        : '—';
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
      ? [hotel.name, hotel.city].filter(Boolean).join(' · ') || hotel.name
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
  return {
    trip,
    pairingCode,
    routeSummary: trip.routeSummary || pairingCode,
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
