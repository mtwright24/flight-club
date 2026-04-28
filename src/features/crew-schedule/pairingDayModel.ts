/**
 * Canonical duty-day model built from `schedule_pairings` + `schedule_pairing_legs` (FLICA leg truth),
 * for classic month ledger and future pairing detail — not from `schedule_entries.city` route strings.
 */
import { supabase } from '../../lib/supabaseClient';
import { addIsoDays } from './ledgerContext';
import type { ScheduleEntryRow } from './scheduleApi';
import type { CrewScheduleLeg, CrewScheduleTrip } from './types';
import { isOvernightArrivalToPairingBase } from './b6CrewlineOvernightBase';
import { isOvernightArrivalInRow } from './ledgerDisplay';
import { mapLegRowToDuty, type SchedulePairingDutyRow } from './jetblueFlicaImport';
import type { SchedulePairingRow } from './jetblueFlicaImport';
import { formatLayoverColumnDisplay } from './scheduleTime';

function compactStation(raw: string | null | undefined): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (/^[A-Z]{3,4}$/i.test(v)) return v.toUpperCase().slice(0, 4);
  const cleaned = v.replace(/[^A-Za-z]/g, '').toUpperCase();
  return cleaned.length >= 3 ? cleaned.slice(0, 3) : v.slice(0, 3).toUpperCase();
}

/** Any non-empty layover_city from the database — IATA, full names, international fields (no 3-letter-only filter). */
function formatLayoverCityRaw(raw: string | null | undefined): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (/^[A-Za-z]{3,4}$/.test(v)) return v.toUpperCase();
  return v;
}

function minIso(dates: (string | null | undefined)[]): string {
  const xs = dates.filter((x): x is string => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x));
  if (xs.length === 0) return '';
  return xs.sort()[0]!;
}

function maxIso(dates: (string | null | undefined)[]): string {
  const xs = dates.filter((x): x is string => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x));
  if (xs.length === 0) return '';
  return xs.sort()[xs.length - 1]!;
}

function trimStr(s: string | null | undefined): string {
  return String(s ?? '').trim();
}

/**
 * Sort key for one duty day: departures 0000–0559 sort after 0600–2359 (next-day continuation),
 * e.g. 0009 → 2409 so it orders after 1926. Display-only; does not change stored `departure_time_local`.
 */
function departureTimeForDutyDaySort(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().replace(':', '');
  if (!/^\d{1,4}$/.test(s)) {
    return String(raw ?? '');
  }
  const pad = s.padStart(4, '0');
  if (!/^\d{4}$/.test(pad)) {
    return String(raw ?? '');
  }
  const n = parseInt(pad, 10);
  if (n >= 0 && n <= 559) {
    return String(2400 + n);
  }
  return pad;
}

/**
 * FLICA may attach `hotel_name` to more than one leg; **midnight-crossing** sectors (arrival time
 * before departure time on the same row) are en route, not the overnight layover stop. Prefer
 * non-crossing hotel legs; the last one by departure time is the real layover (e.g. JFK–LAS vs LAS–MCO
 * red-eye on the same duty day). Uses the same time parser as the rest of the ledger (HHMM, 18:26, etc.).
 *
 * If **every** leg with a hotel line is a crossing (e.g. only LAS–JFK to base has D-END/hotel in the DB),
 * return **null** so CITY is **"–"** (continuation) instead of a bogus layover at LAS. True ground layovers
 * (e.g. BOS) sit on same-day, non-crossing sectors; see J3H95 (BOS / – / JFK on three rows).
 */
function findHotelLeg(
  dayLegs: SchedulePairingDutyRow[],
  dateForLog: string,
  skipDetailLog?: boolean,
): SchedulePairingDutyRow | null {
  if (!dayLegs.length) return null;
  const byDep = [...dayLegs].sort(
    (a, b) =>
      departureTimeForDutyDaySort(a.departure_time_local).localeCompare(
        departureTimeForDutyDaySort(b.departure_time_local),
      ),
  );
  const withHotel = byDep.filter((L) => trimStr(L.hotel_name));
  if (!withHotel.length) return null;
  const nonCrossingHotelLegs = withHotel.filter(
    (L) =>
      !isOvernightArrivalInRow(L.departure_time_local ?? undefined, L.arrival_time_local ?? undefined),
  );
  if (!skipDetailLog && typeof __DEV__ !== 'undefined' && __DEV__) {
    const date = dateForLog;
    console.log(
      '[FIND HOTEL LEG]',
      'date:',
      date,
      'withHotel:',
      withHotel.map((l) => ({
        route: `${l.from_airport ?? ''}-${l.to_airport ?? ''}`,
        dep: l.departure_time_local,
        arr: l.arrival_time_local,
        crossing: isOvernightArrivalInRow(l.departure_time_local ?? undefined, l.arrival_time_local ?? undefined),
        hotel: l.hotel_name,
      })),
      'nonCrossing:',
      nonCrossingHotelLegs.map((l) => `${l.from_airport ?? ''}-${l.to_airport ?? ''}`),
    );
  }
  if (nonCrossingHotelLegs.length > 0) {
    return nonCrossingHotelLegs[nonCrossingHotelLegs.length - 1]!;
  }
  return null;
}

function dEndDigitsFromParserLeg(L: SchedulePairingDutyRow): string | null {
  const fe = L.flica_d_end_local;
  if (fe) {
    const t = String(fe).replace(/\D/g, '');
    if (t.length >= 3) return t.slice(0, 4);
  }
  return digitsOrNull(L.arrival_time_local);
}

function layoverTimeDisplayForLeg(L: SchedulePairingDutyRow): string | null {
  const r = L.layover_rest_display;
  if (r == null || !String(r).trim()) return null;
  return formatLayoverColumnDisplay(String(r)) || String(r).trim() || null;
}

/**
 * True when `L` is a same-day, non-overnight sector whose destination connects to a later sector that is an
 * overnight to crew base (e.g. BOS–LAS with LAS–JFK red-eye) — not a true LAS “layover” CITY row.
 */
function isGatewayLegToRedeyeToBase(
  L: SchedulePairingDutyRow,
  allChrono: SchedulePairingDutyRow[],
  baseCode: string,
): boolean {
  if (isOvernightArrivalInRow(L.departure_time_local ?? undefined, L.arrival_time_local ?? undefined)) {
    return false;
  }
  for (const nxt of allChrono) {
    if (nxt === L) continue;
    if (compactStation(nxt.from_airport) !== compactStation(L.to_airport)) continue;
    if (!isOvernightArrivalToPairingBase(nxt.to_airport, nxt.departure_time_local, nxt.arrival_time_local, baseCode)) {
      continue;
    }
    return true;
  }
  return false;
}

function isSameDayRoundTurnStations(
  legs: { from_airport: string | null; to_airport: string | null; departure_time_local: string | null; arrival_time_local: string | null }[],
): boolean {
  if (legs.length < 1) return false;
  if (!legs.every((L) => L.from_airport)) return false;
  for (const L of legs) {
    if (isOvernightArrivalInRow(L.departure_time_local ?? undefined, L.arrival_time_local ?? undefined)) {
      return false;
    }
  }
  const d0 = compactStation(legs[0]!.from_airport);
  const a1 = compactStation(legs[legs.length - 1]!.to_airport);
  return d0.length > 0 && d0 === a1;
}

/**
 * Crewline-style CITY: **first** leg that day (by dep time) with non-empty `layover_city` (any IATA
 * or full string); on **last** day of block, if none, **base**; otherwise **arrival** (`to`) of
 * the last leg. Not the departure station.
 */
export function computeCrewlineCityForDutyDay(params: {
  calendarDate: string;
  blockLastLegDate: string;
  baseCode: string;
  dayDuties: SchedulePairingDutyRow[];
}): string {
  const { calendarDate, blockLastLegDate, baseCode, dayDuties } = params;
  if (dayDuties.length === 0) return '-';
  const byDep = [...dayDuties].sort((a, b) =>
    departureTimeForDutyDaySort(a.departure_time_local).localeCompare(departureTimeForDutyDaySort(b.departure_time_local)),
  );
  for (const d of byDep) {
    const raw = String(d.layover_city ?? '').trim();
    if (raw) {
      return formatLayoverCityRaw(raw);
    }
  }
  const last = byDep[byDep.length - 1]!;
  if (calendarDate === blockLastLegDate) {
    return baseCode.length > 0 ? baseCode : compactStation(last.to_airport) || '-';
  }
  return compactStation(last.to_airport) || '-';
}

export type PairingDaySegment = {
  departureStation: string;
  arrivalStation: string;
  flightNumber: string | null;
  isDeadhead: boolean;
  routeLabel: string;
  /** Local dep time as on the leg row (4-digit or parser display). */
  departTimeLocal: string | null;
  /** Local arr time as on the leg row. */
  arriveTimeLocal: string | null;
  blockTimeLocal: string | null;
  equipmentCode: string | null;
};

/** One calendar day of one pairing, aligned with FLICA `schedule_pairing_legs` for that `duty_date`. */
export type PairingDay = {
  /** Parent row uuid in `schedule_pairings` */
  pairingUuid: string;
  /** Public FLICA id e.g. J1007, J4173 */
  pairingCode: string;
  calendarDate: string;
  /** 0-based among flying duty days; `-1` when {@link continuationDay} is true. */
  dutyDayIndex: number;
  /** Same as `calendarDate` for FLICA v1 (local line). */
  operatingDate: string;
  reportTimeDisplay: string | null;
  dEndTimeDisplay: string | null;
  segments: PairingDaySegment[];
  displayCityLedger: string;
  layoverStation: string | null;
  /** Raw rest from legs + `formatLayoverColumnDisplay` for the lay column */
  layoverRestDisplay: string | null;
  baseReturnDay: boolean;
  continuationDay: boolean;
  /** No legs today, not an overnight from yesterday — do not show report/d-end/layover for this day. */
  phantomBlankDay?: boolean;
  /** Block ends: only base arrival, no report/d-end/lay (see Crewline F24). */
  pureBaseArrivalOnly?: boolean;
  sameDayTurn: boolean;
  carryIn: boolean;
  carryOut: boolean;
  firstDutyDateWithLegs: string;
  lastDutyDateWithLegs: string;
};

export type PairingCalendarBlock = {
  pairingUuid: string;
  pairingCode: string;
  operateStart: string;
  operateEnd: string;
  daysByDate: Record<string, PairingDay>;
};

type RawLeg = Record<string, unknown>;

function digitsOrNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).replace(/\D/g, '');
  return t.length >= 3 ? t.slice(0, 4) : null;
}

export function enumerateDatesInclusive(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  for (let d = start; d <= end; d = addIsoDays(d, 1)) {
    out.push(d);
  }
  return out;
}

/**
 * Build one {@link PairingCalendarBlock} from a pairing row and its leg rows (Supabase shape).
 * Does not resolve cross-month merge — caller merges pairings with the same `pairing_id` if needed.
 */
export function buildPairingCalendarBlockFromDb(
  pairing: SchedulePairingRow,
  legRows: RawLeg[],
  viewYear: number,
  viewMonth: number,
): PairingCalendarBlock | null {
  const code = (pairing.pairing_id ?? '').trim();
  if (!code) return null;

  const baseCode = (trimStr(pairing.base_code) || 'JFK').toUpperCase();
  const preAlignDuties = (legRows ?? []).map((r) => mapLegRowToDuty(r));
  const duties = preAlignDuties;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    for (const a of preAlignDuties) {
      const b = duties.find((d) => String(d.id) === String(a.id));
      const before = a.duty_date ? String(a.duty_date).slice(0, 10) : '';
      const after = b?.duty_date ? String(b.duty_date).slice(0, 10) : '';
      if (before && after && before !== after) {
        const f = (a.from_airport ?? '').trim();
        const t0 = (a.to_airport ?? '').trim();
        const route = f && t0 ? `${f}-${t0}` : f || t0 || '—';
        console.log(
          '[ALIGN RESULT]',
          code,
          route,
          'duty_date',
          before,
          '→',
          after,
          'dep',
          a.departure_time_local,
        );
      }
    }
  }
  const withDate = duties.filter((d) => d.duty_date);
  const dutiesChrono = [...duties].sort(
    (a, b) =>
      (a.duty_date ?? '').localeCompare(b.duty_date ?? '') ||
      departureTimeForDutyDaySort(a.departure_time_local).localeCompare(departureTimeForDutyDaySort(b.departure_time_local)),
  );
  if (withDate.length === 0) return null;

  const byDate = new Map<string, SchedulePairingDutyRow[]>();
  for (const d of withDate) {
    const k = d.duty_date!;
    const arr = byDate.get(k) ?? [];
    arr.push(d);
    byDate.set(k, arr);
  }

  const legDates = [...byDate.keys()].sort();
  let opStart = String(pairing.operate_start_date ?? '')
    .trim()
    .slice(0, 10) || minIso(legDates);
  let opEnd = String(pairing.operate_end_date ?? '')
    .trim()
    .slice(0, 10) || maxIso(legDates) || opStart;

  for (const ld of legDates) {
    if (ld < opStart) opStart = ld;
    if (ld > opEnd) opEnd = ld;
  }
  const sortDay = (a: SchedulePairingDutyRow, b: SchedulePairingDutyRow) =>
    departureTimeForDutyDaySort(a.departure_time_local).localeCompare(departureTimeForDutyDaySort(b.departure_time_local));

  for (const ld of legDates) {
    const list = (byDate.get(ld) ?? []).sort(sortDay);
    for (const L of list) {
      if (isOvernightArrivalInRow(L.departure_time_local ?? undefined, L.arrival_time_local ?? undefined)) {
        const nxt = addIsoDays(ld, 1);
        if (nxt > opEnd) opEnd = nxt;
      }
    }
  }

  const allDateList = enumerateDatesInclusive(opStart, opEnd);
  const blockFirstLegDate = minIso(legDates);
  const blockLastLegDate = allDateList.length ? allDateList[allDateList.length - 1]! : maxIso(legDates);
  const viewMonthStart = `${viewYear}-${String(viewMonth).padStart(2, '0')}-01`;
  const lastDom = new Date(viewYear, viewMonth, 0).getDate();
  const viewMonthEnd = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(lastDom).padStart(2, '0')}`;

  const days: Record<string, PairingDay> = {};
  let flyOrd = 0;
  const firstDutyDate = legDates[0] ?? '';

  for (const dateIso of allDateList) {
    const dayLegs = [...(byDate.get(dateIso) ?? [])].sort(sortDay);
    const isCont = dayLegs.length === 0;
    const priorIso = addIsoDays(dateIso, -1);
    const prevDayLegs = [...(byDate.get(priorIso) ?? [])].sort(sortDay);
    const lastPrev0 = prevDayLegs.length ? prevDayLegs[prevDayLegs.length - 1]! : null;
    const crossingFromPrev =
      lastPrev0 &&
      isOvernightArrivalInRow(
        lastPrev0.departure_time_local ?? undefined,
        lastPrev0.arrival_time_local ?? undefined,
      )
        ? lastPrev0
        : null;
    const C = crossingFromPrev;
    const cTo = C ? compactStation(C.to_airport) : '';

    let displayCity = '';
    let sameDayTurn = false;
    let dEnd: string | null = null;
    let layoverRest: string | null = null;
    let phantomBlankDay = false;
    let pureBaseArrivalOnly = false;
    let contFlag = isCont;
    /** Multi-leg day whose last sector is a red-eye to base: no LAS-style layover in CITY / LAY. */
    let overBase = false;
    let gatewayOnly = false;
    const firstLeg = dayLegs[0] ?? null;

    if (isCont && !C) {
      phantomBlankDay = true;
      contFlag = false;
    } else if (isCont && C) {
      const cDuty = C.duty_date ? String(C.duty_date).slice(0, 10) : '';
      const cOvernight = isOvernightArrivalInRow(
        C.departure_time_local ?? undefined,
        C.arrival_time_local ?? undefined,
      );
      const arrivalCalAfterOvernight = cDuty && cOvernight ? addIsoDays(cDuty, 1) : '';
      const overnightToBaseArrival =
        cTo.length > 0 &&
        cTo.toUpperCase() === baseCode.toUpperCase() &&
        cOvernight &&
        arrivalCalAfterOvernight === dateIso;
      const pureBaseFromBlockEnd =
        dateIso === blockLastLegDate && cTo.length > 0 && cTo.toUpperCase() === baseCode.toUpperCase();
      const pureBase = pureBaseFromBlockEnd || overnightToBaseArrival;
      if (dateIso === '2026-04-24' && typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(
          '[DEBUG F24]',
          'isCont:',
          isCont,
          'pureBase:',
          pureBase,
          'C leg:',
          `${C.from_airport ?? ''}-${C.to_airport ?? ''}`,
          'C arr:',
          C.arrival_time_local,
          'C dep:',
          C.departure_time_local,
        );
      }
      if (pureBase) {
        pureBaseArrivalOnly = true;
        displayCity = baseCode;
        dEnd = null;
        layoverRest = null;
        contFlag = false;
      } else {
        displayCity = '-';
        dEnd = dEndDigitsFromParserLeg(C);
        /** Midnight continuation arrival: CITY / D-END only; LAY column empty (e.g. J1007 S04). */
        layoverRest = null;
      }
    } else if (dayLegs.length > 0) {
      const lastSorted = dayLegs[dayLegs.length - 1]!;
      overBase =
        dayLegs.length > 1 &&
        isOvernightArrivalToPairingBase(
          lastSorted.to_airport,
          lastSorted.departure_time_local ?? undefined,
          lastSorted.arrival_time_local ?? undefined,
          baseCode,
        );
      gatewayOnly =
        !overBase && dayLegs.length === 1 && Boolean(firstLeg) && isGatewayLegToRedeyeToBase(firstLeg!, dutiesChrono, baseCode);
      const hotelLeg = overBase || gatewayOnly ? null : findHotelLeg(dayLegs, dateIso);
      if (dateIso === '2026-04-06' && typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(
          '[DEBUG M06]',
          'hotelLegs:',
          dayLegs
            .filter((l) => trimStr(l.hotel_name))
            .map((l) => ({
              route: `${l.from_airport ?? ''}-${l.to_airport ?? ''}`,
              dep: l.departure_time_local,
              arr: l.arrival_time_local,
              hotel: l.hotel_name,
              crossing: isOvernightArrivalInRow(l.departure_time_local ?? undefined, l.arrival_time_local ?? undefined),
            })),
        );
      }
      if (dateIso === '2026-04-22' && typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(
          '[DEBUG W22]',
          'hotelLeg:',
          hotelLeg
            ? `${hotelLeg.from_airport ?? ''}-${hotelLeg.to_airport ?? ''}`
            : 'null',
          'hotelLeg.layoverCity:',
          hotelLeg?.layover_city,
          'hotelLeg.layoverTime:',
          hotelLeg?.layover_rest_display,
        );
      }
      if (dateIso === '2026-04-29' && typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(
          '[DEBUG W29]',
          'hotelLegs:',
          dayLegs
            .filter((l) => trimStr(l.hotel_name))
            .map((l) => ({
              route: `${l.from_airport ?? ''}-${l.to_airport ?? ''}`,
              dep: l.departure_time_local,
              arr: l.arrival_time_local,
              hotel: l.hotel_name,
              crossing: isOvernightArrivalInRow(l.departure_time_local ?? undefined, l.arrival_time_local ?? undefined),
              layoverCity: l.layover_city,
              layoverTime: l.layover_rest_display,
            })),
        );
      }
      if (gatewayOnly && firstLeg) {
        displayCity = compactStation(firstLeg.from_airport) || '-';
        dEnd = dEndDigitsFromParserLeg(firstLeg);
        layoverRest = null;
      } else if (hotelLeg) {
        const rawCity = trimStr(hotelLeg.layover_city);
        displayCity = rawCity ? formatLayoverCityRaw(rawCity) : compactStation(hotelLeg.to_airport) || '-';
        dEnd = dEndDigitsFromParserLeg(hotelLeg);
        layoverRest = dateIso === blockLastLegDate ? null : layoverTimeDisplayForLeg(hotelLeg);
      } else {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(
            '[NO HOTEL LEG]',
            'date:',
            dateIso,
            'lastLeg:',
            `${lastSorted.from_airport ?? ''}-${lastSorted.to_airport ?? ''}`,
            'dep:',
            lastSorted.departure_time_local,
            'arr:',
            lastSorted.arrival_time_local,
            'crossing:',
            isOvernightArrivalInRow(lastSorted.departure_time_local ?? undefined, lastSorted.arrival_time_local ?? undefined),
            'toAirport:',
            lastSorted.to_airport,
            'baseCode:',
            baseCode,
            'isBase:',
            lastSorted.to_airport === baseCode,
            'isBaseCompact:',
            compactStation(lastSorted.to_airport) === baseCode,
          );
        }
        if (dateIso === '2026-04-17' && typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(
            '[DEBUG F17]',
            'lastLeg:',
            `${lastSorted.from_airport ?? ''}-${lastSorted.to_airport ?? ''}`,
            'dep:',
            lastSorted.departure_time_local,
            'arr:',
            lastSorted.arrival_time_local,
            'crossing:',
            isOvernightArrivalInRow(lastSorted.departure_time_local ?? undefined, lastSorted.arrival_time_local ?? undefined),
            'to_airport:',
            lastSorted.to_airport,
            'baseCode:',
            baseCode,
          );
        }
        const crosses = isOvernightArrivalInRow(
          lastSorted.departure_time_local ?? undefined,
          lastSorted.arrival_time_local ?? undefined,
        );
        const toSt = compactStation(lastSorted.to_airport);
        const toBase = toSt.length > 0 && toSt.toUpperCase() === baseCode;
        if (crosses) {
          displayCity = '-';
          dEnd = dEndDigitsFromParserLeg(lastSorted);
        } else if (toBase) {
          displayCity = baseCode;
          dEnd = digitsOrNull(lastSorted.arrival_time_local) ?? dEndDigitsFromParserLeg(lastSorted);
        } else {
          displayCity = compactStation(lastSorted.to_airport) || '-';
          dEnd = dEndDigitsFromParserLeg(lastSorted);
        }
        layoverRest = null;
      }
      if (dateIso === blockFirstLegDate && dateIso === blockLastLegDate) {
        sameDayTurn = isSameDayRoundTurnStations(dayLegs);
        if (sameDayTurn) displayCity = '';
      }
    }

    if (dateIso === '2026-04-23' && typeof __DEV__ !== 'undefined' && __DEV__) {
      const L23 = dayLegs.length ? dayLegs[dayLegs.length - 1]! : null;
      const dEndDisplay = dEnd;
      console.log(
        '[DEBUG T23]',
        'legs:',
        dayLegs.map((l) => ({
          route: `${l.from_airport ?? ''}-${l.to_airport ?? ''}`,
          dep: l.departure_time_local,
          arr: l.arrival_time_local,
          crossing: isOvernightArrivalInRow(l.departure_time_local ?? undefined, l.arrival_time_local ?? undefined),
        })),
        'lastLeg:',
        L23 ? `${L23.from_airport ?? ''}-${L23.to_airport ?? ''}` : 'n/a',
        'dEnd shown:',
        dEndDisplay,
        'isCont:',
        isCont,
      );
    }

    const dayIdx = isCont ? -1 : flyOrd;
    if (!isCont) flyOrd += 1;

    let rep: string | null = null;
    if (phantomBlankDay) {
      rep = null;
    } else if (pureBaseArrivalOnly) {
      rep = null;
    } else if (isCont && C) {
      rep = trimStr(C.flica_rept_local) ? digitsOrNull(C.flica_rept_local) : null;
    } else if (firstLeg && firstDutyDate) {
      if (dateIso === firstDutyDate) {
        const bse = digitsOrNull(String(pairing.report_time_local ?? ''));
        rep = bse && bse.length >= 3 ? bse : digitsOrNull(firstLeg.departure_time_local);
      } else {
        const di = legDates.indexOf(dateIso);
        if (di > 0) {
          const prevD = legDates[di - 1]!;
          const prevLegs = [...(byDate.get(prevD) ?? [])].sort(sortDay);
          const prevHotel = findHotelLeg(prevLegs, prevD, true);
          if (prevHotel && trimStr(prevHotel.flica_rept_local)) {
            rep = digitsOrNull(prevHotel.flica_rept_local);
          } else {
            const lastPrev1 = prevLegs[prevLegs.length - 1];
            rep = digitsOrNull(lastPrev1?.flica_rept_local) ?? digitsOrNull(firstLeg.departure_time_local);
          }
        }
      }
    }

    const lastForBaseReturn = isCont && C ? C : !isCont && dayLegs.length ? dayLegs[dayLegs.length - 1]! : null;
    const lastArr = lastForBaseReturn ? compactStation(lastForBaseReturn.to_airport) : '';
    const opBlockEnd = allDateList.length ? allDateList[allDateList.length - 1]! : opEnd;
    const baseReturn = Boolean(!isCont && lastArr && lastArr === baseCode && dateIso === opBlockEnd);

    const segments: PairingDaySegment[] = isCont
      ? []
      : dayLegs.map((L) => ({
          departureStation: compactStation(L.from_airport) || '',
          arrivalStation: compactStation(L.to_airport) || '',
          flightNumber: L.flight_number,
          isDeadhead: L.is_deadhead === true,
          routeLabel: `${compactStation(L.from_airport) || '?'}-${compactStation(L.to_airport) || '?'}`,
          departTimeLocal: L.departure_time_local ?? null,
          arriveTimeLocal: L.arrival_time_local ?? null,
          blockTimeLocal: L.block_time_local ?? null,
          equipmentCode: L.equipment_code ?? null,
        }));

    const hlForStation =
      !isCont && dayLegs.length
        ? overBase || gatewayOnly
          ? null
          : findHotelLeg(dayLegs, dateIso, true)
        : null;
    const rawLayoverStation =
      pureBaseArrivalOnly || phantomBlankDay
        ? null
        : hlForStation
          ? hlForStation.layover_city
          : isCont && C
            ? C.layover_city
            : null;
    const layoverStationOut = (() => {
      if (rawLayoverStation == null || !String(rawLayoverStation).trim()) return null;
      return formatLayoverCityRaw(String(rawLayoverStation)) || null;
    })();

    days[dateIso] = {
      pairingUuid: pairing.id,
      pairingCode: code,
      calendarDate: dateIso,
      dutyDayIndex: dayIdx,
      operatingDate: dateIso,
      reportTimeDisplay: rep,
      dEndTimeDisplay: dEnd,
      segments,
      displayCityLedger: displayCity,
      layoverStation: layoverStationOut,
      layoverRestDisplay: layoverRest,
      baseReturnDay: Boolean(baseReturn),
      continuationDay: contFlag,
      phantomBlankDay: phantomBlankDay || undefined,
      pureBaseArrivalOnly: pureBaseArrivalOnly || undefined,
      sameDayTurn,
      carryIn: dateIso < viewMonthStart,
      carryOut: dateIso > viewMonthEnd,
      firstDutyDateWithLegs: blockFirstLegDate,
      lastDutyDateWithLegs: blockLastLegDate,
    };
  }

  return {
    pairingUuid: pairing.id,
    pairingCode: code,
    operateStart: allDateList[0] ?? opStart,
    operateEnd: allDateList.length ? allDateList[allDateList.length - 1]! : opEnd,
    daysByDate: days,
  };
}

export function normPairingCode(p: string | undefined | null): string {
  return String(p ?? '')
    .trim()
    .toUpperCase();
}

/** Inclusive [mStart, mEnd] ISO dates for a calendar month. */
export function calendarMonthBoundsIso(year: number, month: number): { mStart: string; mEnd: string } {
  const mStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastD = new Date(year, month, 0).getDate();
  const mEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastD).padStart(2, '0')}`;
  return { mStart, mEnd };
}

/**
 * `schedule_entries` in the given calendar month by **row date**, not `month_key` (import may stow
 * May legs with April `month_key`).
 */
export async function fetchScheduleEntriesForViewMonthByLegDate(
  year: number,
  month: number,
): Promise<ScheduleEntryRow[] | null> {
  const { mStart, mEnd } = calendarMonthBoundsIso(year, month);
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return null;
  const uid = userData.user.id;
  const { data, error } = await supabase
    .from('schedule_entries')
    .select(
      'id,user_id,trip_group_id,month_key,date,day_of_week,pairing_code,report_time,city,d_end_time,layover,depart_local,arrive_local,wx,status_code,notes,source_type,source_batch_id,is_user_confirmed',
    )
    .eq('user_id', uid)
    .gte('date', mStart)
    .lte('date', mEnd)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduleEntryRow[];
}

/** Earliest date in [mStart, mEnd] that has a leg or a canonical `PairingDay` for this trip. */
export function earliestPairingDateInViewedMonth(
  trip: CrewScheduleTrip,
  mStart: string,
  mEnd: string,
): string | null {
  const dset = new Set<string>();
  for (const l of trip.legs) {
    if (l.dutyDate && l.dutyDate >= mStart && l.dutyDate <= mEnd) dset.add(l.dutyDate);
  }
  const c = trip.canonicalPairingDays;
  if (c) {
    for (const k of Object.keys(c)) {
      if (k >= mStart && k <= mEnd) dset.add(k);
    }
  }
  if (dset.size === 0) return null;
  return minIso([...dset]);
}

/**
 * Show pairing id on this row (within the month ledger) if this is the first calendar day
 * the pairing has duty in the **currently viewed** month.
 */
export function shouldShowPairingIdInViewedMonth(
  trip: CrewScheduleTrip,
  dateIso: string,
  mStart: string,
  mEnd: string,
): boolean {
  if (String(trip.pairingCode || '').toUpperCase() === 'PTV') return true;
  const first = earliestPairingDateInViewedMonth(trip, mStart, mEnd);
  if (first == null) return false;
  return dateIso === first;
}

/**
 * Same overnight duty-date rules as `buildPairingCalendarBlockFromDb`, for `schedule_entries`-sourced
 * trip legs in Classic before filtering by `dutyDate`.
 */
export function alignCrewScheduleLegsForClassicDisplay(trip: CrewScheduleTrip): CrewScheduleLeg[] {
  const legs = trip.legs ?? [];
  if (legs.length === 0) return legs;
  const rows: SchedulePairingDutyRow[] = legs.map((L) => ({
    id: L.id,
    pairing_row_id: trip.id,
    duty_date: L.dutyDate ?? null,
    flight_number: L.flightNumber ?? null,
    from_airport: L.departureAirport,
    to_airport: L.arrivalAirport,
    departure_time_local: L.departLocal ?? null,
    arrival_time_local: L.arriveLocal ?? null,
    block_time_local: L.blockTimeLocal ?? null,
    layover_city: null,
    hotel_name: null,
    release_time_local: L.releaseLocal ?? null,
    is_deadhead: L.isDeadhead,
    equipment_code: L.equipmentCode ?? null,
    row_confidence: 1,
    requires_review: false,
    raw_text: null,
  }));
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  return legs.map((L) => {
    const a = byId.get(String(L.id));
    if (!a?.duty_date) return L;
    const next = String(a.duty_date).trim().slice(0, 10);
    if (!next || next === L.dutyDate) return L;
    return { ...L, dutyDate: next };
  });
}