import type { CrewScheduleLeg, CrewScheduleTrip, ScheduleDutyStatus } from './types';
import type { ScheduleEntryRow } from './scheduleApi';

function statusFromCode(code: string | null | undefined): ScheduleDutyStatus {
  const u = String(code ?? '').toUpperCase();
  if (u === 'OFF') return 'off';
  if (u === 'PTO') return 'pto';
  if (u === 'RSV') return 'rsv';
  if (u === 'DH') return 'deadhead';
  if (u === 'CONT') return 'continuation';
  if (u === 'BLANK' || u === 'UNK') return 'other';
  return 'flying';
}

function formatTimeDisplay(t: string | null | undefined): string | undefined {
  if (!t) return undefined;
  const s = String(t).trim();
  if (/^\d{4}$/.test(s)) {
    return `${s.slice(0, 2)}:${s.slice(2)}`;
  }
  return s;
}

/** e.g. notes "flt:B6 841" or "B6 841" → display for leg + tracker */
function parseFlightFromNotes(notes: string | null | undefined): string | undefined {
  if (!notes) return undefined;
  const m = notes.match(/\bflt:\s*([^\s]+)/i) ?? notes.match(/\b(B6\s*\d+)\b/i);
  if (!m) return undefined;
  return m[1].replace(/\s+/g, ' ').trim();
}

/** Parse DEP→ARR, JFK-DUB, JFK → DUB */
function parseRouteFromCity(city: string | null | undefined): { dep: string; arr: string } | null {
  if (!city) return null;
  const s = String(city).trim();
  const arrow = s.split(/\s*→\s*|->|\u2192/i);
  if (arrow.length >= 2) {
    const dep = arrow[0]?.trim().toUpperCase();
    const arr = arrow[1]?.trim().toUpperCase();
    if (dep && arr && /^[A-Z]{3,4}$/.test(dep) && /^[A-Z]{3,4}$/.test(arr)) return { dep, arr };
  }
  const dash = s.match(/^([A-Z]{3,4})\s*[-–]\s*([A-Z]{3,4})$/i);
  if (dash) return { dep: dash[1].toUpperCase(), arr: dash[2].toUpperCase() };
  return null;
}

function calendarSpanDays(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${endIso}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function firstNonContPairing(days: ScheduleEntryRow[]): string {
  for (const d of days) {
    const p = String(d.pairing_code ?? '').trim();
    if (!p) continue;
    if (p.toUpperCase() === 'CONT') continue;
    return p;
  }
  return days[0]?.pairing_code ?? '—';
}

function buildRouteSummary(legs: CrewScheduleLeg[], fallback: string): string {
  if (!legs.length) return fallback;
  const parts: string[] = [];
  for (const leg of legs) {
    if (!parts.length) {
      parts.push(leg.departureAirport, leg.arrivalAirport);
    } else if (parts[parts.length - 1] === leg.departureAirport) {
      parts.push(leg.arrivalAirport);
    } else {
      parts.push(leg.departureAirport, leg.arrivalAirport);
    }
  }
  return parts.filter(Boolean).join(' → ');
}

function legFromRow(day: ScheduleEntryRow): CrewScheduleLeg | null {
  const st = statusFromCode(day.status_code);
  /** Layover / dash days (FLICA CONT) never become flight legs — prevents extra “phantom” legs. */
  if (st === 'continuation') return null;

  const pairing = String(day.pairing_code ?? '').toUpperCase();
  if (pairing === 'PTV' || st === 'off' || st === 'pto') return null;

  const route = parseRouteFromCity(day.city);
  if (!route) {
    return null;
  }

  const flightNumber = parseFlightFromNotes(day.notes);
  const isDh = st === 'deadhead';

  return {
    id: `${day.id}-leg`,
    scheduleEntryId: day.id,
    dutyDate: day.date,
    departureAirport: route.dep,
    arrivalAirport: route.arr,
    reportLocal: formatTimeDisplay(day.report_time),
    departLocal: formatTimeDisplay(day.depart_local),
    arriveLocal: formatTimeDisplay(day.arrive_local),
    releaseLocal: formatTimeDisplay(day.d_end_time),
    isDeadhead: isDh,
    flightNumber,
  };
}

/** Map one trip_group's rows to a single CrewScheduleTrip. */
export function entriesToSingleTrip(rows: ScheduleEntryRow[]): CrewScheduleTrip | undefined {
  if (!rows.length) return undefined;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return entryGroupToTrip(sorted);
}

/** Group schedule_entries rows into CrewScheduleTrip blocks by trip_group_id. */
export function entriesToTrips(rows: ScheduleEntryRow[]): CrewScheduleTrip[] {
  const byGroup = new Map<string, ScheduleEntryRow[]>();
  for (const r of rows) {
    const g = r.trip_group_id;
    const arr = byGroup.get(g) ?? [];
    arr.push(r);
    byGroup.set(g, arr);
  }

  const trips: CrewScheduleTrip[] = [];
  for (const [, days] of byGroup) {
    days.sort((a, b) => a.date.localeCompare(b.date));
    trips.push(entryGroupToTrip(days));
  }

  trips.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return trips;
}

function entryGroupToTrip(days: ScheduleEntryRow[]): CrewScheduleTrip {
  const first = days[0];
  const last = days[days.length - 1];
  const y = Number(first.month_key.slice(0, 4));
  const m = Number(first.month_key.slice(5, 7));

  const pairingCode = firstNonContPairing(days);
  const tripStatus = statusFromCode(first.status_code);

  const legs: CrewScheduleLeg[] = [];
  for (const d of days) {
    const leg = legFromRow(d);
    if (leg) legs.push(leg);
  }

  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const origin = firstLeg?.departureAirport;
  const destination = lastLeg?.arrivalAirport;

  const routeSummary = buildRouteSummary(legs, first.city?.includes('→') ? String(first.city) : pairingCode);

  const layoverCity = first.layover ?? undefined;

  const layoverByDate: Record<string, string> = {};
  for (const d of days) {
    const v = d.layover?.trim();
    if (v) layoverByDate[d.date] = v;
  }

  return {
    id: first.trip_group_id,
    pairingCode,
    month: m,
    year: y,
    startDate: first.date,
    endDate: last.date,
    dutyDays: calendarSpanDays(first.date, last.date),
    status: tripStatus,
    routeSummary: routeSummary || pairingCode,
    origin,
    destination,
    layoverCity,
    legs,
    ...(Object.keys(layoverByDate).length > 0 ? { layoverByDate } : {}),
  };
}
