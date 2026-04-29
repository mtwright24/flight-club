import { addIsoDays } from './ledgerContext';
import { departureTimeForDutyDaySortKey } from './scheduleNormalizer';
import { formatTripCompactShorthand } from './jetblueFlicaImport';
import { extractLayoverRestFourDigits, formatLayoverColumnDisplay } from './scheduleTime';
import type { CrewScheduleLeg, CrewScheduleTrip, ScheduleDutyStatus } from './types';
import type { ScheduleEntryRow } from './scheduleApi';
import type { ScheduleDuty, SchedulePairing, SchedulePairingLegLite } from './buildClassicRows';
import { pairingOverlapsCalendarMonth } from './buildClassicRows';
import { isOvernightArrivalToPairingBase } from './b6CrewlineOvernightBase';
import { isFlicaNonFlyingActivityId } from '../../services/flicaScheduleHtmlParser';

function statusFromCode(code: string | null | undefined): ScheduleDutyStatus {
  const u = String(code ?? '').toUpperCase();
  if (u === 'OFF') return 'off';
  if (u === 'PTO' || u === 'UTO') return 'pto';
  if (u === 'PTV' || u === 'VAC') return 'ptv';
  if (u === 'RSV') return 'rsv';
  if (u === 'DH') return 'deadhead';
  if (u === 'CONT') return 'continuation';
  if (u === 'TRAINING' || u === 'RECURRENT') return 'training';
  if (u === 'FMLA' || u === 'SICK' || u === 'JURY') return 'other';
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

function blockTimeDisplayFromLegRow(L: SchedulePairingLegLite): string | undefined {
  const nj = L.normalized_json;
  const hhmm = nj && typeof nj.flica_block_hhmm === 'string' ? String(nj.flica_block_hhmm).trim() : '';
  if (/^\d{4}$/.test(hhmm)) return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
  return undefined;
}

function layoverRestFromLegRow(L: SchedulePairingLegLite): string | undefined {
  const nj = L.normalized_json;
  const v = nj?.layover_rest_display;
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
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
  if (isFlicaNonFlyingActivityId(pairing) || st === 'off' || st === 'pto' || st === 'ptv') return [];

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
  if (u.length === 0 || u === 'CONT' || u === '—' || u === 'RDO' || isFlicaNonFlyingActivityId(u)) {
    return false;
  }
  return true;
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
  const pc = normPairingCode(pairingCode);
  const tripStatus: ScheduleDutyStatus =
    pc === 'PTV' || pc === 'VAC'
      ? 'ptv'
      : pc === 'PTO' || pc === 'UTO'
        ? 'pto'
        : pc === 'RSV'
          ? 'rsv'
          : pc === 'TRAINING' || pc === 'RECURRENT'
            ? 'training'
            : pc === 'FMLA' || pc === 'SICK' || pc === 'JURY'
              ? 'other'
              : statusFromCode(first.status_code);

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

  /**
   * Extend through the arrival calendar day when the last segment is a Crewline/JetBlue overnight to base /
   * co-base red-eye (`0009`-style deps count even when wall-clock arrival &gt; dep), matching
   * `isOvernightArrivalToPairingBase` + normalized `schedule_pairings` span. Otherwise a CONT-only trailing
   * row can be omitted and J3H95 collapses from BOS / – / JFK into two ledger lines.
   */
  let endDate = last.date;
  if (legs.length > 0) {
    const chronLast = legs[legs.length - 1]!;
    const dutyIso = chronLast.dutyDate;
    const pairingBase = 'JFK';
    const overnightToBaseLeg =
      !!dutyIso &&
      isOvernightArrivalToPairingBase(chronLast.arrivalAirport, chronLast.departLocal, chronLast.arriveLocal, pairingBase);
    if (dutyIso && (overnightToBaseLeg || hhmmCrossesMidnight(chronLast.departLocal, chronLast.arriveLocal))) {
      endDate = maxIsoDates([endDate, addIsoDays(dutyIso, 1)]);
    }
  }

  return {
    id: first.trip_group_id,
    pairingCode,
    /** `month_key` of first entry — can be the prior month for merged carry-over trips. */
    month: m,
    year: y,
    startDate: first.date,
    endDate,
    dutyDays: calendarSpanDays(first.date, endDate),
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

function isoDate10(raw: unknown): string | null {
  const s = String(raw ?? '')
    .trim()
    .slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function minIsoDates(dates: string[]): string {
  return [...dates].sort()[0]!;
}

function maxIsoDates(dates: string[]): string {
  return [...dates].sort()[dates.length - 1]!;
}

function hhmmCrossesMidnight(dep?: string, arr?: string): boolean {
  const ds = String(dep ?? '').replace(/\D/g, '');
  const ars = String(arr ?? '').replace(/\D/g, '');
  if (ds.length < 3 || ars.length < 3) return false;
  const dn = parseInt(ds.slice(-4).padStart(4, '0'), 10);
  const an = parseInt(ars.slice(-4).padStart(4, '0'), 10);
  return an < dn;
}

/**
 * One `CrewScheduleTrip` per `schedule_pairings` row touching the month, from normalized duties + legs.
 * `trip.id` = `schedule_pairings.id` (UUID) for navigation and trip detail.
 */
export function buildCrewScheduleTripsFromNormalizedPack(
  viewYear: number,
  viewMonth: number,
  duties: ScheduleDuty[],
  pairings: SchedulePairing[],
  pairingLegs: SchedulePairingLegLite[],
): CrewScheduleTrip[] {
  const out: CrewScheduleTrip[] = [];
  const dutyByPairing = new Map<string, ScheduleDuty[]>();
  for (const d of duties) {
    const pid = String(d.pairing_id ?? '').trim();
    if (!pid) continue;
    const arr = dutyByPairing.get(pid) ?? [];
    arr.push(d);
    dutyByPairing.set(pid, arr);
  }
  for (const arr of dutyByPairing.values()) {
    arr.sort((a, b) => String(a.duty_date).localeCompare(String(b.duty_date)));
  }

  for (const pairing of pairings) {
    const pairUuid = pairing.id;
    const code = String(pairing.pairing_id ?? '').trim();
    if (!pairUuid || !code) continue;
    if (!pairingOverlapsCalendarMonth(pairing, viewYear, viewMonth)) continue;

    const tripDuties = dutyByPairing.get(code) ?? [];
    const tripLegsRaw = pairingLegs.filter((l) => l.pairing_id === pairUuid);
    if (!tripDuties.length && !tripLegsRaw.length) {
      if (!isFlicaNonFlyingActivityId(code)) continue;
      const opS = isoDate10(pairing.operate_start_date ?? pairing.pairing_start_date);
      const opE = isoDate10(pairing.operate_end_date ?? pairing.pairing_end_date);
      if (!opS) continue;
      const zlStart = opS;
      const zlEnd = opE && opE >= opS ? opE : opS;
      const pcNl = normPairingCode(code);
      const zlStatus: ScheduleDutyStatus =
        pcNl === 'PTV' || pcNl === 'VAC'
          ? 'ptv'
          : pcNl === 'PTO' || pcNl === 'UTO'
            ? 'pto'
            : pcNl === 'RSV'
              ? 'rsv'
              : pcNl === 'TRAINING' || pcNl === 'RECURRENT'
                ? 'training'
                : pcNl === 'FMLA' || pcNl === 'SICK' || pcNl === 'JURY'
                  ? 'other'
                  : 'other';
      out.push({
        id: String(pairUuid),
        schedulePairingId: String(pairUuid),
        pairingCode: code,
        base: pairing.base_code ? String(pairing.base_code).trim() : 'JFK',
        month: viewMonth,
        year: viewYear,
        startDate: zlStart,
        endDate: zlEnd,
        dutyDays: calendarSpanDays(zlStart, zlEnd),
        status: zlStatus,
        routeSummary: code,
        legs: [],
      });
      continue;
    }

    const tripLegs = [...tripLegsRaw].sort((a, b) => {
      const da = String(a.duty_date ?? '');
      const db = String(b.duty_date ?? '');
      if (da !== db) return da.localeCompare(db);
      /** Same duty day: Crewline order — e.g. J3H95 BOS-LAS 1926 before LAS-JFK 0009 (0009 must not sort before 1926 lexically). */
      const ta = departureTimeForDutyDaySortKey(a.scheduled_departure_local as string | null | undefined);
      const tb = departureTimeForDutyDaySortKey(b.scheduled_departure_local as string | null | undefined);
      const td = ta.localeCompare(tb);
      if (td !== 0) return td;
      return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
    });

    const dutyDateToReport = new Map<string, string | null>();
    for (const d of tripDuties) {
      const iso = isoDate10(d.duty_date);
      if (iso) dutyDateToReport.set(iso, d.report_time ?? null);
    }

    const legs: CrewScheduleLeg[] = [];
    for (let idx = 0; idx < tripLegs.length; idx++) {
      const L = tripLegs[idx]!;
      const dutyIso = isoDate10(L.duty_date);
      const prev = idx > 0 ? tripLegs[idx - 1]! : null;
      const prevIso = prev ? isoDate10(prev.duty_date) : null;
      const isFirstLegOfDay = dutyIso != null && dutyIso !== prevIso;
      const rep = isFirstLegOfDay && dutyIso ? dutyDateToReport.get(dutyIso) : null;
      const calDom =
        L.calendar_day != null && Number.isFinite(Number(L.calendar_day))
          ? Number(L.calendar_day)
          : undefined;
      legs.push({
        id: L.id ? String(L.id) : `${pairUuid}-leg-${idx}`,
        dutyDate: dutyIso ?? undefined,
        dutyDayCalendarDom: calDom,
        departureAirport: String(L.departure_station ?? '')
          .trim()
          .toUpperCase()
          .slice(0, 4),
        arrivalAirport: String(L.arrival_station ?? '')
          .trim()
          .toUpperCase()
          .slice(0, 4),
        reportLocal: rep ? formatTimeDisplay(rep) : undefined,
        departLocal: formatTimeDisplay(L.scheduled_departure_local),
        arriveLocal: formatTimeDisplay(L.scheduled_arrival_local),
        releaseLocal: formatTimeDisplay(L.release_time_local),
        flightNumber: L.flight_number ? String(L.flight_number).trim() : undefined,
        blockTimeLocal: blockTimeDisplayFromLegRow(L),
        equipmentCode: L.aircraft_position_code ? String(L.aircraft_position_code).trim() : undefined,
        layoverCityLeg: L.layover_city ? String(L.layover_city).trim() : undefined,
        layoverRestDisplay: layoverRestFromLegRow(L),
        isDeadhead: String(L.segment_type ?? '').toLowerCase() === 'deadhead' || !!L.is_deadhead,
      });
    }

    const legDutyDates = tripLegs.map((x) => isoDate10(x.duty_date)).filter((x): x is string => Boolean(x));

    let firstDutyIso =
      tripDuties.length > 0 ? isoDate10(tripDuties[0]!.duty_date) : legDutyDates.length ? minIsoDates(legDutyDates) : null;
    let lastDutyIso =
      tripDuties.length > 0
        ? isoDate10(tripDuties[tripDuties.length - 1]!.duty_date)
        : legDutyDates.length
          ? maxIsoDates(legDutyDates)
          : null;

    const opStart = isoDate10(pairing.operate_start_date ?? pairing.pairing_start_date);
    const opEnd = isoDate10(pairing.operate_end_date ?? pairing.pairing_end_date);

    const startCand: string[] = [];
    if (firstDutyIso) startCand.push(firstDutyIso);
    if (opStart) startCand.push(opStart);
    let startDate = startCand.length ? minIsoDates(startCand) : firstDutyIso ?? opStart ?? '';

    const endCand: string[] = [];
    if (lastDutyIso) endCand.push(lastDutyIso);
    if (opEnd) endCand.push(opEnd);
    let endDate = endCand.length ? maxIsoDates(endCand) : lastDutyIso ?? opEnd ?? startDate;

    if (lastDutyIso && legs.length) {
      const lastLeg = legs[legs.length - 1]!;
      if (hhmmCrossesMidnight(lastLeg.departLocal, lastLeg.arriveLocal)) {
        const span = addIsoDays(lastDutyIso!, 1);
        endDate = maxIsoDates([endDate, span]);
      }
    }

    const layoverByDate: Record<string, string> = {};
    const layoverStationByDate: Record<string, string> = {};
    for (const d of tripDuties) {
      const di = isoDate10(d.duty_date);
      if (!di) continue;
      const lt = formatLayoverColumnDisplay(String(d.layover_time ?? '').trim());
      if (lt) layoverByDate[di] = lt;
      const city = String(d.layover_city ?? '').trim();
      if (city) layoverStationByDate[di] = city;
    }

    const routeSummary = buildCompactTripRouteSummary(legs, code);
    const firstLeg = legs[0];
    const lastL = legs[legs.length - 1];

    out.push({
      id: String(pairUuid),
      schedulePairingId: String(pairUuid),
      pairingCode: code,
      base: pairing.base_code ? String(pairing.base_code).trim() : 'JFK',
      month: viewMonth,
      year: viewYear,
      startDate,
      endDate,
      dutyDays: calendarSpanDays(startDate, endDate),
      status: 'flying',
      routeSummary: routeSummary || code,
      origin: firstLeg?.departureAirport,
      destination: lastL?.arrivalAirport,
      legs,
      ...(Object.keys(layoverByDate).length > 0 ? { layoverByDate } : {}),
      ...(Object.keys(layoverStationByDate).length > 0 ? { layoverStationByDate } : {}),
    });
  }

  out.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return out;
}
