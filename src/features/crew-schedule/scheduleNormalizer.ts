/**
 * Layers 3–5 — trip normalization from FLICA `FlicaPairing` (parser output).
 * dutyPeriodDate is the only duty-date source of truth; no post-import alignment.
 */
import type { FlicaLeg, FlicaPairing } from '../../services/flicaScheduleHtmlParser';
import { isOvernightArrivalInRow } from './overnightArrivalInRow';

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
 * Prefer dates on/after **pairing.startDate** when the same DOM falls in multiple months (carry-out May 1 vs April 1).
 */
function pickResolvedDutyIsoFromCandidates(
  start: string,
  end: string,
  uniqSorted: string[],
  prevResolvedIso: string | null,
): string | null {
  if (!uniqSorted.length) return null;
  let pool = uniqSorted.filter((iso) => iso >= start && iso <= end);
  if (!pool.length) pool = [...uniqSorted];
  if (prevResolvedIso === null) {
    const aftStart = pool.filter((iso) => iso >= start);
    return (aftStart.length ? aftStart : pool)[0] ?? null;
  }
  const strictLater = pool.find((iso) => iso > prevResolvedIso);
  if (strictLater !== undefined) return strictLater;
  const gtePrev = pool.find((iso) => iso >= prevResolvedIso);
  if (gtePrev !== undefined) return gtePrev;
  return pool[0] ?? null;
}

/**
 * Resolves calendar YYYY-MM-DD for a leg (dutyPeriod DOM from parser — never slips by departure time).
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
  const yStr = String(y);
  const mStr = String(fileM).padStart(2, '0');
  if (!Number.isFinite(y) || !Number.isFinite(fileM) || !start || !end) {
    return `${monthKey.slice(0, 4)}-${monthKey.slice(5, 7)}-${d}`;
  }

  const expanded: string[] = [];
  for (const dy of [-2, -1, 0, 1, 2] as const) {
    const dt = new Date(y, fileM - 1 + dy, 1);
    const cy = dt.getFullYear();
    const cm = dt.getMonth() + 1;
    const iso = calendarIsoInMonth(cy, cm, dom);
    if (iso) expanded.push(iso);
  }
  const uniq = [...new Set(expanded)].sort();
  const picked =
    pickResolvedDutyIsoFromCandidates(start, end, uniq, prevResolvedIso) ?? uniq[0] ?? null;
  return picked ?? `${yStr}-${mStr}-${d}`;
}

/** Duty periods from parser — each closes when D-END filled `dutyOffTime` on the pending leg (~4-digit token). */
function splitFlatLegsIntoDendDutySegments(legs: FlicaLeg[]): FlicaLeg[][] {
  if (!legs.length) return [];
  const out: FlicaLeg[][] = [];
  let bucket: FlicaLeg[] = [];
  for (const leg of legs) {
    bucket.push(leg);
    if (String(leg.dutyOffTime ?? '').trim().replace(/\D/g, '').length >= 4) {
      out.push(bucket);
      bucket = [];
    }
  }
  if (bucket.length) out.push(bucket);
  return out.length ? out : [legs.slice()];
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

/**
 * Same-duty-day leg order: continuation deps after midnight (next calendar morning) sort **after**
 * evening deps (e.g. LAS–JFK **0009** after BOS–LAS **1926** → key 2400+9 vs 1926).
 *
 * We **do not** shift normal morning outbound legs (e.g. JFK–LAS **0553**) — the old `n <= 559` check
 * wrongly treated **0553** as 553 ≤ 559 and bumped it past **0944**, reversing J3H95 Apr 22 order.
 * Exclude **05:00–06:59** local (typical first-wave report) from the bump.
 */
export function departureTimeForDutyDaySortKey(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().replace(':', '');
  if (!/^\d{1,4}$/.test(s)) {
    return String(raw ?? '');
  }
  const pad = s.padStart(4, '0');
  if (!/^\d{4}$/.test(pad)) {
    return String(raw ?? '');
  }
  const hh = parseInt(pad.slice(0, 2), 10);
  const mm = parseInt(pad.slice(2, 4), 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) {
    return pad;
  }
  const minutesFromMidnight = hh * 60 + mm;
  if (minutesFromMidnight >= 0 && minutesFromMidnight < 6 * 60) {
    if (minutesFromMidnight >= 5 * 60 && minutesFromMidnight < 7 * 60) {
      return pad;
    }
    return String(2400 + minutesFromMidnight);
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
  /** International / red-eye: last leg often crosses local midnight; layover city/time still live on that leg row. */
  for (let i = sortedLegs.length - 1; i >= 0; i--) {
    const o = sortedLegs[i]!;
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

  const segments = splitFlatLegsIntoDendDutySegments(pairing.legs ?? []);
  const dutyDays: NormalizedDutyDay[] = [];

  /** Chains DD resolver across successive D-END duty periods (same pairing, carry-out month picks). */
  let betweenSegRowAnchor: string | null = null;

  for (let si = 0; si < segments.length; si++) {
    const segment = segments[si]!;
    const firstLeg = segment[0]!;
    const dutyDateIso = resolveFlicaLegIsoInPairing(
      pairing,
      firstLeg,
      monthKey,
      'dutyPeriod',
      betweenSegRowAnchor,
    );

    let prevRowA: string | null = null;
    const withActual: { leg: FlicaLeg; actualDepDateIso: string }[] = [];
    for (const leg of segment) {
      const actualDepDateIso = resolveFlicaLegIsoInPairing(pairing, leg, monthKey, 'row', prevRowA);
      prevRowA = actualDepDateIso;
      withActual.push({ leg, actualDepDateIso });
    }
    betweenSegRowAnchor = prevRowA ?? dutyDateIso;

    const lastLegFlica = segment[segment.length - 1]!;
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
    const dutyOffRaw = String(lastLegFlica.dutyOffTime ?? '').trim();
    const dutyOffTime = dutyOffRaw.length > 0 ? dutyOffRaw : null;
    const nextR = String(lastLegFlica.nextReportTime ?? '').trim();
    const nextReportTime = nextR.length > 0 ? lastLegFlica.nextReportTime : null;

    let reportForSeg: string | null = null;
    if (si === 0) {
      reportForSeg = pairing.baseReport?.trim() ? pairing.baseReport : null;
    } else {
      const closingLeg = segments[si - 1]![segments[si - 1]!.length - 1]!;
      const rept = String(closingLeg.nextReportTime ?? '').trim();
      reportForSeg = rept.length > 0 ? closingLeg.nextReportTime : null;
    }

    const dd: NormalizedDutyDay = {
      dutyDateIso,
      reportTime: reportForSeg,
      dutyOffTime,
      nextReportTime,
      legs: nLegs,
      layoverCity,
      layoverTime,
      hotelName,
      isContinuation: dutyDays.length > 0,
      isOvernightDuty,
    };
    dutyDays.push(dd);
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
