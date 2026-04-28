/**
 * Layers 3–5 — trip normalization from FLICA `FlicaPairing` (parser output).
 * dutyPeriodDate is the only duty-date source of truth; no post-import alignment.
 */
import type { FlicaLeg, FlicaPairing } from '../../services/flicaScheduleHtmlParser';
import { isOvernightArrivalInRow } from './ledgerDisplay';

export interface NormalizedDutyDay {
  dutyDateIso: string;
  reportTime: string | null;
  dutyOffTime: string | null;
  nextReportTime: string | null;
  legs: NormalizedLeg[];
  layoverCity: string | null;
  layoverTime: string | null;
  hotelName: string | null;
  isContinuation: boolean;
  isOvernightDuty: boolean;
}

export interface NormalizedLeg {
  dutyDateIso: string;
  actualDepDateIso: string;
  flightNumber: string;
  depAirport: string;
  arrAirport: string;
  depTimeLocal: string;
  arrTimeLocal: string;
  blockTime: string;
  crossesMidnight: boolean;
  isDeadhead: boolean;
  equipment: string;
}

export interface NormalizedTrip {
  pairingId: string;
  startDateIso: string;
  endDateIso: string;
  baseAirport: string;
  reportTime: string | null;
  touchedDays: string[];
  dutyDays: NormalizedDutyDay[];
  tafb: string | null;
  tripBlock: string | null;
}

function calendarIsoInMonth(year: number, month1to12: number, day: number): string | null {
  const d = new Date(year, month1to12 - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month1to12 - 1 || d.getDate() !== day) {
    return null;
  }
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Resolves a calendar YYYY-MM-DD for a leg using the same file-month + D-END rules as persist
 * (`dutyPeriodDate` or `date` for DOM, never sliding by local dep time).
 */
function resolveFlicaLegIsoInPairing(
  pairing: FlicaPairing,
  leg: FlicaLeg,
  monthKey: string,
  domSource: 'dutyPeriod' | 'row',
  prevResolvedIso: string | null
): string {
  const y = parseInt(monthKey.slice(0, 4), 10);
  const fileM = parseInt(monthKey.slice(5, 7), 10);
  const dom = domSource === 'dutyPeriod' && leg.dutyPeriodDate > 0 ? leg.dutyPeriodDate : leg.date;
  const d = String(dom).padStart(2, '0');
  const start = pairing.startDate;
  const end = pairing.endDate;
  const mStr = String(fileM).padStart(2, '0');
  const yStr = String(y);
  if (!Number.isFinite(y) || !Number.isFinite(fileM) || !start || !end) {
    return `${monthKey.slice(0, 4)}-${monthKey.slice(5, 7)}-${d}`;
  }

  const inFileMonth = calendarIsoInMonth(y, fileM, dom);
  if (inFileMonth && inFileMonth >= start && inFileMonth <= end) {
    return inFileMonth;
  }

  const inRange: string[] = [];
  for (const delta of [-1, 0, 1] as const) {
    const dt = new Date(y, fileM - 1 + delta, 1);
    const cy = dt.getFullYear();
    const cm = dt.getMonth() + 1;
    const iso = calendarIsoInMonth(cy, cm, dom);
    if (iso && iso >= start && iso <= end) {
      inRange.push(iso);
    }
  }
  inRange.sort();
  if (inRange.length > 0) {
    if (prevResolvedIso == null) return inRange[0]!;
    const after = inRange.find((iso) => iso > prevResolvedIso);
    if (after) return after;
    const sameOrAfter = inRange.find((iso) => iso >= prevResolvedIso);
    if (sameOrAfter) return sameOrAfter;
    return inRange[0]!;
  }
  return `${yStr}-${mStr}-${d}`;
}

function flicaRouteToAirports(route: string): { dep: string; arr: string } {
  const raw = (route ?? '').trim();
  if (!raw) return { dep: '', arr: '' };
  const n = raw.replace(/[–—−]/g, '-').replace(/\s+/g, '');
  const pair = n.match(/^([A-Z]{3,4})-([A-Z]{3,4})$/i);
  if (pair) {
    return { dep: pair[1].toUpperCase(), arr: pair[2].toUpperCase() };
  }
  const parts = n.split('-').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      dep: (parts[0] ?? '').toUpperCase(),
      arr: (parts[parts.length - 1] ?? '').toUpperCase(),
    };
  }
  if (parts.length === 1 && /^[A-Z]{6}$/i.test(parts[0]!)) {
    const p0 = parts[0]!.toUpperCase();
    return { dep: p0.slice(0, 3), arr: p0.slice(3, 6) };
  }
  return { dep: (parts[0] ?? '').toUpperCase(), arr: (parts[1] ?? '').toUpperCase() };
}

/** 0000–0559 treat as 2400+ for same-duty-day order only. */
export function departureTimeForDutyDaySortKey(raw: string | null | undefined): string {
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

/** Same ordering as the former `alignOvernightToBaseDutyDates` sort (chronological by duty + dep key). */
export function sortDutiesChronologically<T extends { duty_date?: string | null; departure_time_local?: string | null }>(
  a: T,
  b: T,
): number {
  const dd = (a.duty_date ?? '').localeCompare(b.duty_date ?? '');
  if (dd !== 0) return dd;
  return departureTimeForDutyDaySortKey(a.departure_time_local).localeCompare(
    departureTimeForDutyDaySortKey(b.departure_time_local),
  );
}

function enumerateIsoInclusive(start: string, end: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return [];
  }
  const out: string[] = [];
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  for (let t = a.getTime(); t <= b.getTime(); t += 86400000) {
    const d = new Date(t);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  }
  return out;
}

function toLegFromFlica(
  pairing: FlicaPairing,
  leg: FlicaLeg,
  monthKey: string,
  dutyDateIso: string,
  actualDepDateIso: string,
): NormalizedLeg {
  const { dep, arr } = flicaRouteToAirports(leg.route);
  return {
    dutyDateIso,
    actualDepDateIso,
    flightNumber: leg.flightNumber,
    depAirport: dep,
    arrAirport: arr,
    depTimeLocal: leg.departLocal,
    arrTimeLocal: leg.arriveLocal,
    blockTime: leg.blockTime,
    crossesMidnight: isOvernightArrivalInRow(leg.departLocal, leg.arriveLocal),
    isDeadhead: leg.isDeadhead,
    equipment: leg.equipment,
  };
}

/**
 * Layover city/time from the last same-day, non–midnight-crossing leg with layover data;
 * hotel from the last such leg with a D-END hotel line.
 */
function findLayoverAndHotel(
  sortedLegs: { leg: FlicaLeg; n: NormalizedLeg }[],
): { layoverCity: string | null; layoverTime: string | null; hotelName: string | null } {
  const nonCrossing = sortedLegs.filter(
    (o) => !isOvernightArrivalInRow(o.leg.departLocal, o.leg.arriveLocal),
  );
  let hotelName: string | null = null;
  for (let i = nonCrossing.length - 1; i >= 0; i--) {
    const h = String(nonCrossing[i]!.leg.hotel ?? '').trim();
    if (h) {
      hotelName = h;
      break;
    }
  }
  for (let i = nonCrossing.length - 1; i >= 0; i--) {
    const o = nonCrossing[i]!;
    const c = String(o.leg.layoverCity ?? '').trim();
    if (c) {
      const t = String(o.leg.layoverTime ?? '').trim();
      return { layoverCity: c, layoverTime: t || null, hotelName };
    }
  }
  return { layoverCity: null, layoverTime: null, hotelName };
}

export function normalizeFlicaParsedPairing(pairing: FlicaPairing): NormalizedTrip {
  const startDateIso = pairing.startDate;
  const endDateIso = pairing.endDate;
  const monthKey = startDateIso.length >= 7 ? startDateIso.slice(0, 7) : '2026-04';
  const touchedDays = enumerateIsoInclusive(startDateIso, endDateIso);
  if (touchedDays.length === 0 && startDateIso) {
    touchedDays.push(startDateIso);
  }

  const legs = pairing.legs ?? [];
  const dutyByIso = new Map<string, FlicaLeg[]>();
  const orderedDutyIso: string[] = [];
  const seen = new Set<string>();
  let prev: string | null = null;
  for (const L of legs) {
    const dutyIso = resolveFlicaLegIsoInPairing(pairing, L, monthKey, 'dutyPeriod', prev);
    prev = dutyIso;
    if (!seen.has(dutyIso)) {
      seen.add(dutyIso);
      orderedDutyIso.push(dutyIso);
    }
    if (!dutyByIso.has(dutyIso)) dutyByIso.set(dutyIso, []);
    dutyByIso.get(dutyIso)!.push(L);
  }

  const dutyDays: NormalizedDutyDay[] = [];
  for (let di = 0; di < orderedDutyIso.length; di++) {
    const dutyDateIso = orderedDutyIso[di]!;
    const dayLegs = dutyByIso.get(dutyDateIso) ?? [];
    let prevA: string | null = null;
    const withActual: { leg: FlicaLeg; actualDepDateIso: string }[] = [];
    for (const leg of dayLegs) {
      const actualDepDateIso = resolveFlicaLegIsoInPairing(pairing, leg, monthKey, 'row', prevA);
      prevA = actualDepDateIso;
      withActual.push({ leg, actualDepDateIso });
    }
    const lastLegFlica = withActual.length ? withActual[withActual.length - 1]!.leg : null;
    const nLegs: NormalizedLeg[] = withActual.map((w) =>
      toLegFromFlica(pairing, w.leg, monthKey, dutyDateIso, w.actualDepDateIso),
    );
    const pairs = withActual.map((w, i) => ({
      leg: w.leg,
      n: nLegs[i]!,
    }));
    const { layoverCity, layoverTime, hotelName } = findLayoverAndHotel(pairs);
    const lastN = nLegs.length ? nLegs[nLegs.length - 1]! : null;
    const isOvernightDuty = lastN != null && lastN.crossesMidnight;
    const dutyOffRaw = lastLegFlica?.dutyOffTime?.trim() ?? '';
    const dutyOffTime = dutyOffRaw.length > 0 ? dutyOffRaw : null;
    const nextR = String(lastLegFlica?.nextReportTime ?? '').trim();
    const nextReportTime = nextR.length > 0 ? lastLegFlica?.nextReportTime ?? null : null;
    const isContinuation = di > 0;
    dutyDays.push({
      dutyDateIso,
      reportTime: di === 0 ? pairing.baseReport : null,
      dutyOffTime,
      nextReportTime,
      legs: nLegs,
      layoverCity,
      layoverTime,
      hotelName,
      isContinuation,
      isOvernightDuty,
    });
  }

  return {
    pairingId: pairing.id,
    startDateIso,
    endDateIso,
    baseAirport: pairing.base,
    reportTime: pairing.baseReport,
    touchedDays,
    dutyDays,
    tafb: pairing.tafb,
    tripBlock: pairing.totalBlock,
  };
}
