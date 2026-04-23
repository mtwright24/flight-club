import { addIsoDays } from './ledgerContext';
import { formatTripCompactShorthand } from './jetblueFlicaImport';
import { extractLayoverRestFourDigits, formatLayoverColumnDisplay } from './scheduleTime';
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

/** One segment: DEP-ARR, DEP→ARR (no commas — caller splits lists). */
function parseOneRouteSegment(segment: string | null | undefined): { dep: string; arr: string } | null {
  if (!segment) return null;
  const s = String(segment).trim();
  if (!s) return null;
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

/** Apply-row `city` is often comma-joined per duty day, e.g. "JFK-SFO, SFO-BOS" — one leg per segment. */
function parseRouteSegmentsFromCity(city: string | null | undefined): { dep: string; arr: string }[] {
  if (!city) return [];
  const out: { dep: string; arr: string }[] = [];
  for (const part of String(city)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const r = parseOneRouteSegment(part);
    if (r) out.push(r);
  }
  return out;
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

function buildCompactTripRouteSummary(legs: CrewScheduleLeg[], fallback: string): string {
  if (!legs.length) return fallback;
  /** Schedule calendar rows omit pairing base; use multi-day + round-trip heuristics in `formatTripCompactShorthand`. */
  const compact = formatTripCompactShorthand(
    legs.map((l) => ({
      from_airport: l.departureAirport,
      to_airport: l.arrivalAirport,
      duty_date: l.dutyDate ?? null,
    })),
    null
  );
  if (compact !== '—') return compact;
  return fallback;
}

function legsFromRow(day: ScheduleEntryRow): CrewScheduleLeg[] {
  const st = statusFromCode(day.status_code);
  /** Layover / dash days (FLICA CONT) never become flight legs — prevents extra “phantom” legs. */
  if (st === 'continuation') return [];

  const pairing = String(day.pairing_code ?? '').toUpperCase();
  if (pairing === 'PTV' || st === 'off' || st === 'pto') return [];

  const segs = parseRouteSegmentsFromCity(day.city);
  if (!segs.length) {
    return [];
  }

  const flightNumber = parseFlightFromNotes(day.notes);
  const isDh = st === 'deadhead';
  return segs.map((route, i) => ({
    id: `${day.id}-leg-${i}`,
    scheduleEntryId: day.id,
    dutyDate: day.date,
    departureAirport: route.dep,
    arrivalAirport: route.arr,
    reportLocal: i === 0 ? formatTimeDisplay(day.report_time) : undefined,
    departLocal: formatTimeDisplay(day.depart_local),
    arriveLocal: formatTimeDisplay(day.arrive_local),
    releaseLocal: i === segs.length - 1 ? formatTimeDisplay(day.d_end_time) : undefined,
    isDeadhead: isDh,
    flightNumber,
  }));
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

/**
 * For the same `trip_group_id`, merge **previous** month + **current** month `schedule_entries` so
 * `startDate`, `legs`, and `layoverByDate` include March when viewing April. Without this, April
 * `entriesToTrips` alone starts the trip on April 1 and March 30/31 is missing — the “30” can appear
 * only as April 30 at the bottom of the list.
 */
export function mergeTripsWithPriorMonthRows(
  trips: CrewScheduleTrip[],
  currentMonthRows: ScheduleEntryRow[],
  prevMonthRows: ScheduleEntryRow[],
  viewYear: number,
  viewMonth: number,
): CrewScheduleTrip[] {
  return trips.map((t) => {
    const prev = prevMonthRows.filter((r) => r.trip_group_id === t.id);
    if (prev.length === 0) {
      return { ...t, year: viewYear, month: viewMonth };
    }
    const curr = currentMonthRows.filter((r) => r.trip_group_id === t.id);
    const combined = [...prev, ...curr].sort((a, b) => a.date.localeCompare(b.date));
    const merged = entriesToSingleTrip(combined);
    if (!merged) {
      return { ...t, year: viewYear, month: viewMonth };
    }
    return { ...merged, year: viewYear, month: viewMonth };
  });
}

function normPairingCode(p: string | undefined): string {
  return String(p ?? '').trim().toUpperCase();
}

/** Same real pairing line as ledger (not CONT / placeholder). */
function isCarryMergePairing(p: string): boolean {
  const u = p.trim().toUpperCase();
  return u.length > 0 && u !== 'CONT' && u !== '—' && u !== 'RDO' && u !== 'PTV' && u !== 'PTO' && u !== 'RSV';
}

/**
 * FLICA / `schedule_import_replace_month` often assigns **different** `trip_group_id` per month. Then
 * March J1016 and April J1016 are two trips; id-based merge misses them. Merge when the same pairing
 * code is **calendar-contiguous** across the month boundary so the April ledger can start on Mar 30.
 * Display-only — does not change Supabase.
 */
export function mergeCarryInTripsByContiguousPairing(
  trips: CrewScheduleTrip[],
  currentMonthRows: ScheduleEntryRow[],
  prevMonthRows: ScheduleEntryRow[],
  viewYear: number,
  viewMonth: number,
): CrewScheduleTrip[] {
  const viewMonthStart = `${viewYear}-${String(viewMonth).padStart(2, '0')}-01`;
  if (!prevMonthRows.length) {
    return trips.map((t) => ({ ...t, year: viewYear, month: viewMonth }));
  }

  const prevTrips = entriesToTrips(prevMonthRows);
  const usedPrevIds = new Set<string>();

  return trips.map((t) => {
    const withYm = { ...t, year: viewYear, month: viewMonth };
    if (t.startDate < viewMonthStart) {
      return withYm;
    }
    const code = normPairingCode(t.pairingCode);
    if (!isCarryMergePairing(code)) {
      return withYm;
    }

    for (const p of prevTrips) {
      if (usedPrevIds.has(p.id)) continue;
      const pCode = normPairingCode(p.pairingCode);
      if (!isCarryMergePairing(pCode) || pCode !== code) continue;
      if (addIsoDays(p.endDate, 1) !== t.startDate) continue;

      const pRows = prevMonthRows.filter((r) => r.trip_group_id === p.id);
      const cRows = currentMonthRows.filter((r) => r.trip_group_id === t.id);
      if (!pRows.length || !cRows.length) continue;

      const combined = [...pRows, ...cRows].sort((a, b) => a.date.localeCompare(b.date));
      const merged = entriesToSingleTrip(combined);
      if (!merged) continue;

      usedPrevIds.add(p.id);
      return {
        ...merged,
        year: viewYear,
        month: viewMonth,
        id: t.id,
        ledgerContext: t.ledgerContext ?? merged.ledgerContext,
      };
    }

    return withYm;
  });
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
    legs.push(...legsFromRow(d));
  }

  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const origin = firstLeg?.departureAirport;
  const destination = lastLeg?.arrivalAirport;

  const routeSummary = buildCompactTripRouteSummary(legs, first.city?.includes('→') ? String(first.city) : pairingCode);

  /** `schedule_entries.layover` is FLICA layover *time* (4-digit); do not treat as station name. */
  const layoverMeta = first.layover?.trim();
  const layoverCity =
    layoverMeta && !/^\d{4}$/.test(layoverMeta) ? layoverMeta : undefined;

  const layoverByDate: Record<string, string> = {};
  for (const d of days) {
    const fromLay = formatLayoverColumnDisplay(d.layover?.trim() ?? '');
    const fromCity = d.city ? extractLayoverRestFourDigits(d.city) || formatLayoverColumnDisplay(d.city) : '';
    const v = fromLay || fromCity;
    if (v) layoverByDate[d.date] = v;
  }

  const fcvLo = /\bfcv_lo:([A-Z]{3,4})\b/i;
  const layoverStationByDate: Record<string, string> = {};
  for (const d of days) {
    const m = fcvLo.exec(d.notes ?? '');
    if (m?.[1]) layoverStationByDate[d.date] = m[1]!.toUpperCase();
  }

  return {
    id: first.trip_group_id,
    pairingCode,
    /** `month_key` of first entry — can be the prior month for merged carry-over trips. */
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
    ...(Object.keys(layoverStationByDate).length > 0 ? { layoverStationByDate } : {}),
  };
}
