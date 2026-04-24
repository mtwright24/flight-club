/**
 * Canonical duty-day model built from `schedule_pairings` + `schedule_pairing_legs` (FLICA leg truth),
 * for classic month ledger and future pairing detail — not from `schedule_entries.city` route strings.
 */
import { addIsoDays } from './ledgerContext';
import { isOvernightArrivalInRow } from './ledgerDisplay';
import { buildLayoverSummaryFromDuties, mapLegRowToDuty, type SchedulePairingDutyRow } from './jetblueFlicaImport';
import type { SchedulePairingRow } from './jetblueFlicaImport';
import { formatLayoverColumnDisplay } from './scheduleTime';

function compactStation(raw: string | null | undefined): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (/^[A-Z]{3,4}$/i.test(v)) return v.toUpperCase().slice(0, 4);
  const cleaned = v.replace(/[^A-Za-z]/g, '').toUpperCase();
  return cleaned.length >= 3 ? cleaned.slice(0, 3) : v.slice(0, 3).toUpperCase();
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
 * Crewline-style CITY: **last leg’s `layover_city`** for that duty day; on **last** day of trip, if
 * empty, **base**; otherwise **arrival** (`to`) of the last leg. Not the departure station.
 */
export function computeCrewlineCityForDutyDay(params: {
  calendarDate: string;
  blockLastLegDate: string;
  baseCode: string;
  dayDuties: SchedulePairingDutyRow[];
}): string {
  const { calendarDate, blockLastLegDate, baseCode, dayDuties } = params;
  if (dayDuties.length === 0) return '-';
  const last = dayDuties[dayDuties.length - 1]!;
  const lay = compactStation(last.layover_city);
  if (lay) return lay;
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

  const duties = (legRows ?? []).map((r) => mapLegRowToDuty(r));
  const withDate = duties.filter((d) => d.duty_date);
  if (withDate.length === 0) return null;

  const byDate = new Map<string, SchedulePairingDutyRow[]>();
  for (const d of withDate) {
    const k = d.duty_date!;
    const arr = byDate.get(k) ?? [];
    arr.push(d);
    byDate.set(k, arr);
  }

  const legDates = [...byDate.keys()].sort();
  const opStart = String(pairing.operate_start_date ?? '')
    .trim()
    .slice(0, 10) || minIso(legDates);
  const opEnd = String(pairing.operate_end_date ?? '')
    .trim()
    .slice(0, 10) || maxIso(legDates) || opStart;

  const blockFirstLegDate = minIso(legDates);
  const blockLastLegDate = maxIso(legDates);
  const viewMonthStart = `${viewYear}-${String(viewMonth).padStart(2, '0')}-01`;
  const lastDom = new Date(viewYear, viewMonth, 0).getDate();
  const viewMonthEnd = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(lastDom).padStart(2, '0')}`;

  const baseCode = (pairing.base_code ?? 'JFK').toUpperCase();

  const days: Record<string, PairingDay> = {};
  let flyOrd = 0;
  const firstDutyDate = legDates[0] ?? '';

  for (const dateIso of enumerateDatesInclusive(opStart, opEnd)) {
    const dayLegsRaw = byDate.get(dateIso) ?? [];
    const dayLegs = [...dayLegsRaw].sort((a, b) =>
      (a.departure_time_local ?? '').localeCompare(b.departure_time_local ?? ''),
    );
    const isCont = dayLegs.length === 0;
    const dayIdx = isCont ? -1 : flyOrd;
    if (!isCont) flyOrd += 1;

    /** Crewline LAYOVER = rest time on the **last** sector of the duty day (FLICA layover cell), not the first. */
    const layoverRaw =
      isCont || dateIso === blockLastLegDate
        ? null
        : dayLegs.length
          ? buildLayoverSummaryFromDuties([dayLegs[dayLegs.length - 1]!])
          : null;
    const layoverStation =
      !isCont && dayLegs.length
        ? compactStation(dayLegs[dayLegs.length - 1]!.layover_city) || null
        : null;
    const layoverRest = layoverRaw ? formatLayoverColumnDisplay(layoverRaw) || layoverRaw : null;

    let displayCity = '-';
    let sameDayTurn = false;
    if (!isCont) {
      displayCity = computeCrewlineCityForDutyDay({
        calendarDate: dateIso,
        blockLastLegDate,
        baseCode,
        dayDuties: dayLegs,
      });
      if (dateIso === blockFirstLegDate && dateIso === blockLastLegDate) {
        sameDayTurn = isSameDayRoundTurnStations(dayLegs);
        if (sameDayTurn) displayCity = '';
      }
    }

    const lastLeg = isCont ? null : dayLegs[dayLegs.length - 1];
    const firstLeg = isCont ? null : dayLegs[0];
    /** Crewline D-END column = **scheduled arrival** of the last flight of that duty day (not `REPT`). */
    const dEnd = lastLeg ? digitsOrNull(lastLeg.arrival_time_local) : null;
    let rep: string | null = null;
    if (!isCont && firstLeg && firstDutyDate) {
      if (dateIso === firstDutyDate) {
        const bse = digitsOrNull(String(pairing.report_time_local ?? ''));
        rep = bse && bse.length >= 3 ? bse : digitsOrNull(firstLeg.departure_time_local);
      } else {
        const di = legDates.indexOf(dateIso);
        if (di > 0) {
          const prevD = legDates[di - 1]!;
          const prevLegs = [...(byDate.get(prevD) ?? [])].sort((a, b) =>
            (a.departure_time_local ?? '').localeCompare(b.departure_time_local ?? ''),
          );
          const lastPrev = prevLegs[prevLegs.length - 1];
          rep =
            digitsOrNull(lastPrev?.flica_rept_local) ?? digitsOrNull(firstLeg.departure_time_local);
        }
      }
    }

    const segments: PairingDaySegment[] = isCont
      ? []
      : dayLegs.map((L) => ({
          departureStation: compactStation(L.from_airport) || '',
          arrivalStation: compactStation(L.to_airport) || '',
          flightNumber: L.flight_number,
          isDeadhead: L.is_deadhead === true,
          routeLabel: `${compactStation(L.from_airport) || '?'}-${compactStation(L.to_airport) || '?'}`,
        }));

    const lastArr = lastLeg ? compactStation(lastLeg.to_airport) : '';
    const baseReturn = Boolean(!isCont && lastArr && lastArr === baseCode && dateIso === opEnd);

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
      layoverStation,
      layoverRestDisplay: layoverRest,
      baseReturnDay: Boolean(baseReturn),
      continuationDay: isCont,
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
    operateStart: opStart,
    operateEnd: opEnd,
    daysByDate: days,
  };
}

export function normPairingCode(p: string | undefined | null): string {
  return String(p ?? '')
    .trim()
    .toUpperCase();
}