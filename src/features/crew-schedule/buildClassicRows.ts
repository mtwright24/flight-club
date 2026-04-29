/**
 * Normalized Classic row builder (schedule_duties + schedule_pairings) — display pipeline Step 7.
 * Does not replace existing Classic UI; used for verification logging first.
 */
import { supabase } from '../../lib/supabaseClient';

export type RowType =
  | 'EMPTY_DAY'
  | 'TRIP_START'
  | 'TRIP_CONTINUATION'
  | 'TRIP_END'
  | 'CARRY_IN'
  | 'CARRY_OUT'
  | 'NON_FLIGHT_DUTY';

export interface ClassicScheduleRow {
  dateIso: string;
  pairingText: string | null;
  reportText: string | null;
  cityText: string | null;
  dutyEndText: string | null;
  layoverText: string | null;
  rowType: RowType;
  /** Stable FLICA pairing id for this duty trip (every row includes for dedupe + matching). */
  sourcePairingId: string;
  /**
   * True when this row is a duty-less enumerated gap (no `schedule_duties` row for this date).
   * Layer-8 may treat as blank for PTV/entry overlay while still showing "-" in the grid when rendered as TRIP_CONTINUATION.
   */
  syntheticGapNoDuty?: boolean;
}

/** One row from `schedule_duties` (shape matches persisted columns). */
export type ScheduleDuty = {
  id?: string;
  user_id?: string;
  import_id: string;
  pairing_id: string;
  duty_date: string;
  report_time: string | null;
  duty_off_time: string | null;
  next_report_time: string | null;
  layover_city: string | null;
  layover_time: string | null;
  hotel_name: string | null;
  is_continuation?: boolean;
  is_overnight_duty?: boolean;
};

/** Subset of `schedule_pairings` for base / FLICA id join + trip window for synthetic arrival row. */
export type SchedulePairing = {
  /** schedule_pairings.id (uuid); used for pairing_legs lookup */
  id?: string;
  import_id: string;
  /** FLICA public id e.g. J3H95 */
  pairing_id: string;
  base_code: string | null;
  operate_start_date?: string | null;
  pairing_start_date?: string | null;
  operate_end_date?: string | null;
  pairing_end_date?: string | null;
};

/** Non-enumerable tag on `duties` arrays returned by `fetchScheduleDutiesAndPairingsForMonth` (view month for Rule 4 carry-in/out). */
export type ClassicViewMonthTag = { year: number; month: number };

export type SchedulePairingLegLite = {
  id?: string;
  pairing_id: string;
  duty_date: string | null;
  flight_number?: string | null;
  segment_type?: string | null;
  departure_station?: string | null;
  arrival_station?: string | null;
  scheduled_departure_local?: string | null;
  scheduled_arrival_local?: string | null;
  release_time_local?: string | null;
  is_deadhead?: boolean | null;
  normalized_json: Record<string, unknown>;
  created_at?: string | null;
};

function sliceDutyIso(raw: unknown): string | null {
  const s = String(raw ?? '')
    .trim()
    .slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function pairingEndDateIso(pairing: SchedulePairing | undefined): string | null {
  if (!pairing) return null;
  const raw = pairing.operate_end_date ?? pairing.pairing_end_date;
  if (raw == null || typeof raw !== 'string') return null;
  return sliceDutyIso(raw);
}

function pairingStartDateIso(pairing: SchedulePairing | undefined): string | null {
  if (!pairing) return null;
  const raw = pairing.operate_start_date ?? pairing.pairing_start_date;
  if (raw == null || typeof raw !== 'string') return null;
  return sliceDutyIso(raw);
}

function monthFirstIso(year: number, month1to12: number): string {
  const m = String(month1to12).padStart(2, '0');
  return `${year}-${m}-01`;
}

function monthLastIso(year: number, month1to12: number): string {
  const m = String(month1to12).padStart(2, '0');
  const lastDom = new Date(year, month1to12, 0).getDate();
  return `${year}-${m}-${String(lastDom).padStart(2, '0')}`;
}

function readClassicViewTag(duties: ScheduleDuty[]): ClassicViewMonthTag | null {
  const tag = (duties as ScheduleDuty[] & { __classicViewMonth?: ClassicViewMonthTag }).__classicViewMonth;
  if (!tag || !Number.isFinite(tag.year) || !Number.isFinite(tag.month)) return null;
  return { year: tag.year, month: tag.month };
}

function tagDutiesWithClassicViewMonth(duties: ScheduleDuty[], year: number, month1to12: number): ScheduleDuty[] {
  Object.defineProperty(duties, '__classicViewMonth', {
    value: { year, month: month1to12 },
    enumerable: false,
    configurable: true,
  });
  return duties;
}

/** Rule 4: keep classic rows whose trip touches the viewed month and date lies in the full trip calendar window. */
function filterClassicRowsForTouchedMonth(
  rows: ClassicScheduleRow[],
  tripCalendarByPairingId: Map<string, { startIso: string; endIso: string }>,
  pairings: SchedulePairing[],
  viewYear: number,
  viewMonth: number,
): ClassicScheduleRow[] {
  return rows.filter((r) => {
    const pid = String(r.sourcePairingId).trim().toUpperCase();
    const pairing = mergePairingsForFlicaId(pairings, pid);
    if (!pairing || !pairingOverlapsCalendarMonth(pairing, viewYear, viewMonth)) return false;
    const bounds = tripCalendarByPairingId.get(pid);
    if (!bounds) return false;
    const d = String(r.dateIso).trim().slice(0, 10);
    return d >= bounds.startIso && d <= bounds.endIso;
  });
}

/** Trip window overlaps [monthFirst, monthLast]. Used by trip list filters (tripMapper). */
export function pairingOverlapsCalendarMonth(p: SchedulePairing, year: number, month1to12: number): boolean {
  const ms = monthFirstIso(year, month1to12);
  const me = monthLastIso(year, month1to12);
  const st = pairingStartDateIso(p);
  const en = pairingEndDateIso(p);
  if (!st || !en) return true;
  return st <= me && en >= ms;
}

/**
 * Crew “Day 3” arrival when last leg departs after midnight (actualDep calendar day after last duty_day row).
 * Same signal as Crewline / FCV: normalized_json.actualDepDateIso > last duty_date in pairing.
 */
/** Increment YYYY-MM-DD by one calendar day (local noon anchor). */
function addOneCalendarDayIso(dateIso: string): string | null {
  const s = String(dateIso).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [ys, ms, ds] = s.split('-');
  const d = new Date(Number(ys), Number(ms) - 1, Number(ds), 12, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

/**
 * D-OFF tokens from schedule_duties (`0840`, `08:40`, `0840L`) → minutes since midnight [0..1439].
 */
function dutyOffTimeToMinutesSinceMidnight(raw: string): number | null {
  const t = String(raw)
    .trim()
    .toUpperCase()
    .replace(/\s+L$/i, '')
    .replace(/L$/i, '');
  const mColon = t.match(/^(\d{1,2}):(\d{2})\b/);
  if (mColon) {
    const h = Number(mColon[1]);
    const mi = Number(mColon[2]);
    if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  const digits = t.replace(/\D/g, '').padStart(4, '0');
  if (digits.length < 3) return null;
  const tail = digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, '0');
  const h = Number(tail.slice(0, -2));
  const mi = Number(tail.slice(-2));
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * Overnight release next calendar morning → trip calendar ends the following day (Classic TRIP_END row).
 * Rule: duty_off_time strictly before 12:00 local → synthetic row on last_duty_date + 1 calendar day @ base.
 */
function syntheticEndIsoFromMorningDutyOff(lastDuty: ScheduleDuty, lastDutyIso: string): string | null {
  const raw = lastDuty.duty_off_time;
  if (raw == null || typeof raw !== 'string' || !String(raw).trim()) return null;
  const mins = dutyOffTimeToMinutesSinceMidnight(String(raw));
  if (mins == null || mins < 0) return null;
  if (mins >= 12 * 60) return null;
  return addOneCalendarDayIso(lastDutyIso);
}

/** HHMM-style D-OFF in 0001–1159 = next-morning release after last leg crossed midnight (T23 / J3H95 city column). */
function isMorningDutyOff(dutyOffTime: string | null | undefined): boolean {
  if (!dutyOffTime) return false;
  const n = parseInt(String(dutyOffTime).replace(/\D/g, '').slice(0, 4), 10);
  return !Number.isNaN(n) && n >= 1 && n <= 1159;
}

function syntheticEndIsoFromLegs(
  legs: SchedulePairingLegLite[],
  lastDutyIso: string,
  pairingUuids: string[],
): string | null {
  const set = new Set(pairingUuids);
  let best: string | null = null;
  for (const leg of legs) {
    if (!set.has(String(leg.pairing_id))) continue;
    const nj = leg.normalized_json ?? {};
    const ad = typeof nj.actualDepDateIso === 'string' ? sliceDutyIso(nj.actualDepDateIso) : null;
    if (!ad || ad <= lastDutyIso) continue;
    if (!best || ad > best) best = ad;
  }
  return best;
}

function dutyPairKey(d: Pick<ScheduleDuty, 'import_id' | 'pairing_id'>): string {
  return `${d.import_id}|${d.pairing_id}`;
}

function findPairing(
  p: Pick<ScheduleDuty, 'import_id' | 'pairing_id'>,
  pairings: SchedulePairing[],
): SchedulePairing | undefined {
  return pairings.find((x) => x.import_id === p.import_id && x.pairing_id === p.pairing_id);
}

/** Drop stray `schedule_duties` rows outside the pairing calendar window (fixes phantom carry-in rows). */
function filterDutiesToPairingWindow(dutyList: ScheduleDuty[], pairing: SchedulePairing | undefined): ScheduleDuty[] {
  const ps = pairingStartDateIso(pairing);
  const pe = pairingEndDateIso(pairing);
  if (ps == null && pe == null) return dutyList;
  return dutyList.filter((d) => {
    const iso = sliceDutyIso(d.duty_date);
    if (!iso) return false;
    if (ps != null && iso < ps) return false;
    if (pe != null && iso > pe) return false;
    return true;
  });
}

/** Step 7 debug: duties for a FLICA pairing id (e.g. J3H95). */
export function filterDutiesByPairingId(duties: ScheduleDuty[], pairingId: string): ScheduleDuty[] {
  const id = pairingId.trim().toUpperCase();
  return duties.filter((d) => String(d.pairing_id).trim().toUpperCase() === id);
}

/** Step 7 debug: first matching `schedule_pairings` row for a FLICA pairing id. */
export function findPairingByPairingId(pairings: SchedulePairing[], pairingId: string): SchedulePairing | undefined {
  const id = pairingId.trim().toUpperCase();
  return pairings.find((p) => String(p.pairing_id).trim().toUpperCase() === id);
}

/** Prefer one winner per calendar `dateIso` (global dedupe across pairings): TRIP_START > … > EMPTY_DAY. */
function rowPriorityDedupeGlobally(t: RowType): number {
  switch (t) {
    case 'TRIP_START':
      return 60;
    case 'TRIP_CONTINUATION':
      return 50;
    case 'TRIP_END':
      return 45;
    case 'CARRY_IN':
      return 40;
    case 'CARRY_OUT':
      return 35;
    case 'NON_FLIGHT_DUTY':
      return 20;
    case 'EMPTY_DAY':
      return 10;
    default:
      return -1;
  }
}

function hasReportText(r: ClassicScheduleRow): boolean {
  return Boolean(r.reportText && String(r.reportText).trim());
}

/** When priorities tie, prefer the row with real report time (e.g. W01 carry-in vs same-day duty). */
function classicRowWinsDedupe(next: ClassicScheduleRow, prev: ClassicScheduleRow): boolean {
  const pn = rowPriorityDedupeGlobally(next.rowType);
  const pp = rowPriorityDedupeGlobally(prev.rowType);
  if (pn !== pp) return pn > pp;
  const nHas = hasReportText(next);
  const pHas = hasReportText(prev);
  if (nHas !== pHas) return nHas;
  return false;
}

/** Final pass: exactly one Layer-7 row per `dateIso`; higher priority row type wins (same trip may merge). */
function dedupeClassicRowsGlobally(rows: ClassicScheduleRow[]): ClassicScheduleRow[] {
  const m = new Map<string, ClassicScheduleRow>();
  for (const r of rows) {
    const dateKey = String(r.dateIso).trim().slice(0, 10);
    const prev = m.get(dateKey);
    if (!prev) {
      m.set(dateKey, r);
      continue;
    }
    if (classicRowWinsDedupe(r, prev)) m.set(dateKey, r);
  }
  return [...m.values()].sort((a, b) =>
    String(a.dateIso).trim().slice(0, 10).localeCompare(String(b.dateIso).trim().slice(0, 10)),
  );
}

/**
 * Persisted imports may repeat `duty_date` for one pairing; canonical display is one Classic row per distinct date.
 * Rule 1: same-day double duty → **first duty period only** = row with lowest numeric report_time (`L`/colons stripped);
 * prefer a row that has report_time when the other does not.
 */
function reportTimeDigitsForSort(raw: string | null | undefined): number | null {
  if (raw == null || typeof raw !== 'string') return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits.length) return null;
  const head = digits.length >= 4 ? digits.slice(0, 4) : digits.padStart(4, '0');
  const n = parseInt(head, 10);
  return Number.isFinite(n) ? n : null;
}

function pickDutyForDuplicateDate(prev: ScheduleDuty, next: ScheduleDuty): ScheduleDuty {
  const pr = reportTimeDigitsForSort(prev.report_time);
  const nr = reportTimeDigitsForSort(next.report_time);
  if (pr == null && nr != null) return next;
  if (nr == null && pr != null) return prev;
  if (pr != null && nr != null) {
    if (pr < nr) return prev;
    if (nr < pr) return next;
  }
  return prev;
}

function uniqDutiesByDutyDateAscending(duties: ScheduleDuty[]): ScheduleDuty[] {
  const byIso = new Map<string, ScheduleDuty>();
  const ordered = [...duties].sort((a, b) => String(a.duty_date).localeCompare(String(b.duty_date)));
  for (const d of ordered) {
    const iso = sliceDutyIso(d.duty_date);
    if (!iso) continue;
    const prev = byIso.get(iso);
    byIso.set(iso, prev ? pickDutyForDuplicateDate(prev, d) : d);
  }
  return Array.from(byIso.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, duty]) => duty);
}

/** Every calendar ISO from startIso through endIso inclusive. */
function eachIsoInclusive(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = String(startIso).trim().slice(0, 10);
  const end = String(endIso).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cur) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return out;
  while (cur <= end) {
    out.push(cur);
    const nx = addOneCalendarDayIso(cur);
    if (!nx || nx === cur) break;
    cur = nx;
    if (out.length > 400) break;
  }
  return out;
}

/**
 * When `operate_end_date` is far beyond the last persisted duty, do not walk the full pairing window — that produces
 * months of phantom "-" gap rows (e.g. J3920 / J3F39). Cap enumeration at last duty + synthetic arrival only.
 */
function safeEnumerateEnd(
  opEnd: string | null,
  lastDutyIso: string,
  syntheticArrival: string | null,
): string {
  const candidates = [String(lastDutyIso).trim().slice(0, 10)];
  if (syntheticArrival) candidates.push(String(syntheticArrival).trim().slice(0, 10));
  const naturalEnd = [...candidates].sort((a, b) => a.localeCompare(b)).reverse()[0]!;

  if (!opEnd) return naturalEnd;

  const opEndS = String(opEnd).trim().slice(0, 10);
  const lastS = String(lastDutyIso).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opEndS) || !/^\d{4}-\d{2}-\d{2}$/.test(lastS)) return naturalEnd;

  const opEndDate = new Date(`${opEndS}T12:00:00`);
  const lastDutyDate = new Date(`${lastS}T12:00:00`);
  const diffDays = Math.round((opEndDate.getTime() - lastDutyDate.getTime()) / 86400000);

  if (diffDays > 7) return naturalEnd;
  return opEndS > naturalEnd ? opEndS : naturalEnd;
}

/** Layer-8: same as ClassicListView `isDutyClassicBlank` plus duty-less gap dashes (PTV can overlay). */
export function classicRowIsBlankForEntryOverlay(c: ClassicScheduleRow | undefined): boolean {
  if (!c) return true;
  if (c.rowType === 'EMPTY_DAY') return true;
  if (c.syntheticGapNoDuty === true && c.cityText === '-') {
    return (
      !String(c.pairingText ?? '').trim() &&
      !String(c.reportText ?? '').trim() &&
      !String(c.dutyEndText ?? '').trim() &&
      !String(c.layoverText ?? '').trim()
    );
  }
  return (
    !String(c.pairingText ?? '').trim() &&
    !String(c.reportText ?? '').trim() &&
    !String(c.cityText ?? '').trim() &&
    !String(c.dutyEndText ?? '').trim() &&
    !String(c.layoverText ?? '').trim()
  );
}

/** Drop stray duty rows dated before merged pairing operate start (handles stale imports without hard-coded ids). */
function filterDutiesNotBeforePairingOperateStart(duties: ScheduleDuty[], pairings: SchedulePairing[]): ScheduleDuty[] {
  return duties.filter((d) => {
    const pid = String(d.pairing_id).trim().toUpperCase();
    const pairing = mergePairingsForFlicaId(pairings, pid);
    if (!pairing) return true;
    const pStart = pairingStartDateIso(pairing);
    if (pStart == null) return true;
    const dutyIso = sliceDutyIso(d.duty_date);
    if (!dutyIso) return false;
    return dutyIso >= pStart;
  });
}

function mergePairingsForFlicaId(pairings: SchedulePairing[], pidUpper: string): SchedulePairing | undefined {
  const matches = pairings.filter((p) => String(p.pairing_id).trim().toUpperCase() === pidUpper);
  if (!matches.length) return undefined;
  if (matches.length === 1) return matches[0];
  let minS: string | null = null;
  let maxE: string | null = null;
  for (const p of matches) {
    const s = pairingStartDateIso(p);
    const e = pairingEndDateIso(p);
    if (s != null && (minS == null || s < minS)) minS = s;
    if (e != null && (maxE == null || e > maxE)) maxE = e;
  }
  const base = { ...matches[0] };
  if (minS != null) {
    base.operate_start_date = minS;
    base.pairing_start_date = minS;
  }
  if (maxE != null) {
    base.operate_end_date = maxE;
    base.pairing_end_date = maxE;
  }
  return base;
}

function pairingUuidListForFlica(pairings: SchedulePairing[], pidUpper: string): string[] {
  const u: string[] = [];
  for (const p of pairings) {
    if (String(p.pairing_id).trim().toUpperCase() !== pidUpper) continue;
    const id = p.id != null && String(p.id).trim() ? String(p.id) : null;
    if (id) u.push(id);
  }
  return u;
}

/** Viewed-month rows first by date; carry-over dates (outside month ISO) appended at bottom — Rule 3. */
function partitionRowsForClassicViewMonth(
  rows: ClassicScheduleRow[],
  viewYear: number,
  viewMonth: number,
): ClassicScheduleRow[] {
  const vl = monthLastIso(viewYear, viewMonth);
  const inMonth: ClassicScheduleRow[] = [];
  const spill: ClassicScheduleRow[] = [];
  for (const r of rows) {
    const d = String(r.dateIso).trim().slice(0, 10);
    if (d > vl) spill.push(r);
    else inMonth.push(r);
  }
  const sortAsc = (a: ClassicScheduleRow, b: ClassicScheduleRow) =>
    a.dateIso.localeCompare(b.dateIso) || a.sourcePairingId.localeCompare(b.sourcePairingId);
  inMonth.sort(sortAsc);
  spill.sort(sortAsc);
  return [...inMonth, ...spill];
}

/**
 * Group duties by trip (schedule_pairings), sort by duty_date, fill every calendar operate day.
 */
export function buildClassicRowsFromDuties(
  duties: ScheduleDuty[],
  pairings: SchedulePairing[],
  pairingLegs: SchedulePairingLegLite[],
): ClassicScheduleRow[] {
  const flicaSeen = new Set<string>();
  for (const d of duties) {
    const k = String(d.pairing_id).trim().toUpperCase();
    if (k) flicaSeen.add(k);
  }
  for (const p of pairings) {
    const k = String(p.pairing_id).trim().toUpperCase();
    if (k) flicaSeen.add(k);
  }

  const rows: ClassicScheduleRow[] = [];
  const tripCalendarByPairingId = new Map<string, { startIso: string; endIso: string }>();

  for (const pidUpper of [...flicaSeen].sort()) {
    const pairing = mergePairingsForFlicaId(pairings, pidUpper);
    const rawTripDuties = duties.filter((d) => String(d.pairing_id).trim().toUpperCase() === pidUpper);
    if (!rawTripDuties.length && !pairing) continue;
    let pairingEffective = pairing;
    if (!pairingEffective && rawTripDuties.length) {
      pairingEffective = findPairing(rawTripDuties[0]!, pairings);
    }
    if (!pairingEffective) continue;

    /** Merge wins over import-scoped pairing rows so May carry-out duties survive filtering (FIX 4). */
    const windowed = filterDutiesToPairingWindow(rawTripDuties, pairingEffective);
    const tripDutiesSorted = uniqDutiesByDutyDateAscending(windowed);

    const flicaPairingKey = String(pairingEffective.pairing_id ?? pidUpper).trim();
    const uuidsForLegs = pairingUuidListForFlica(pairings, pidUpper);

    const baseCity =
      (pairingEffective.base_code && String(pairingEffective.base_code).trim()) ||
      (pairingEffective as { baseAirport?: string }).baseAirport?.trim() ||
      'JFK';

    let opStart = pairingStartDateIso(pairingEffective);
    let opEnd = pairingEndDateIso(pairingEffective);
    if (opStart == null && tripDutiesSorted.length) opStart = sliceDutyIso(tripDutiesSorted[0]!.duty_date);
    if (opEnd == null && tripDutiesSorted.length) opEnd = sliceDutyIso(tripDutiesSorted[tripDutiesSorted.length - 1]!.duty_date);
    if (opStart == null || opEnd == null || opEnd < opStart) continue;

    /** FIX 3: never enumerate phantom days before the first persisted duty when merged pairing dates are stale. */
    const firstDutyIsoFromDuties = tripDutiesSorted.length ? sliceDutyIso(tripDutiesSorted[0]!.duty_date)! : null;
    if (tripDutiesSorted.length && firstDutyIsoFromDuties != null && firstDutyIsoFromDuties > opStart!) {
      opStart = firstDutyIsoFromDuties;
    }
    const firstDutyIso = firstDutyIsoFromDuties ?? opStart!;

    const pairingEndOnlyIso = sliceDutyIso(pairingEffective.pairing_end_date);

    const dutyByIso = new Map<string, ScheduleDuty>();
    for (const d of tripDutiesSorted) {
      const iso = sliceDutyIso(d.duty_date);
      if (!iso) continue;
      dutyByIso.set(iso, d);
    }

    let lastDutyIso = tripDutiesSorted.length ? sliceDutyIso(tripDutiesSorted[tripDutiesSorted.length - 1]!.duty_date)! : opStart!;
    let lastDutyRow = tripDutiesSorted.length ? tripDutiesSorted[tripDutiesSorted.length - 1]! : null;

    let endIsoFromPairing = pairingEndDateIso(pairingEffective);
    let endIsoFromLeg = syntheticEndIsoFromLegs(pairingLegs, lastDutyIso, uuidsForLegs);
    const endIsoFromMorningDutyOff =
      lastDutyRow != null ? syntheticEndIsoFromMorningDutyOff(lastDutyRow, lastDutyIso) : null;

    let syntheticArrivalCalendar: string | null = null;
    if (endIsoFromPairing != null && endIsoFromPairing > lastDutyIso) syntheticArrivalCalendar = endIsoFromPairing;
    if (endIsoFromLeg != null) {
      if (syntheticArrivalCalendar == null || endIsoFromLeg > syntheticArrivalCalendar)
        syntheticArrivalCalendar = endIsoFromLeg;
    }
    if (endIsoFromMorningDutyOff != null) {
      if (syntheticArrivalCalendar == null || endIsoFromMorningDutyOff > syntheticArrivalCalendar) {
        syntheticArrivalCalendar = endIsoFromMorningDutyOff;
      }
    }

    /** Real trip calendar end (last duty + synthetic arrival) — trip bounds / TRIP_END. */
    let tripVisualEnd = lastDutyIso;
    if (syntheticArrivalCalendar != null && syntheticArrivalCalendar > tripVisualEnd) tripVisualEnd = syntheticArrivalCalendar;
    const enumerateEnd = safeEnumerateEnd(
      opEnd != null ? String(opEnd).trim().slice(0, 10) : null,
      lastDutyIso,
      syntheticArrivalCalendar,
    );

    /** Align with enumerated window start after FIX 3 clamp (avoids stale pairing_start vs first duty). */
    const tripLabelIso = opStart!;
    const viewTag = readClassicViewTag(duties);
    const monthLastForCarry =
      viewTag != null ? monthLastIso(viewTag.year, viewTag.month) : null;

    const calendarDays = eachIsoInclusive(opStart!, enumerateEnd);

    const pushDutyOrGapRow = (dateIso: string) => {
      const dutyRow = dutyByIso.get(dateIso);

      if (dutyRow) {
        const isLabelDay = dateIso === tripLabelIso;
        let rowType: RowType = isLabelDay ? 'TRIP_START' : 'TRIP_CONTINUATION';
        if (monthLastForCarry != null && dateIso > monthLastForCarry && rowType !== 'TRIP_START') {
          rowType = 'CARRY_OUT';
        }

        const lay =
          dutyRow.layover_city != null && String(dutyRow.layover_city).trim()
            ? String(dutyRow.layover_city).trim()
            : null;
        const hasLay = lay != null;
        const hasDutyTimes =
          Boolean(dutyRow.report_time && String(dutyRow.report_time).trim()) ||
          Boolean(dutyRow.duty_off_time && String(dutyRow.duty_off_time).trim());

        let cityText: string;
        if (rowType === 'TRIP_START') {
          cityText = hasLay ? lay! : '-';
        } else {
          const isCont = Boolean(dutyRow.is_continuation);
          /** DB flag sometimes missing on overnight return leg; duty-backed non-start with times + no lay still reads as continuation for city. */
          const treatAsContinuation = isCont || (!hasLay && hasDutyTimes);
          const notOnPairingEnd = pairingEndOnlyIso == null || dateIso !== pairingEndOnlyIso;
          const notSyntheticArrivalDay =
            syntheticArrivalCalendar == null || dateIso !== syntheticArrivalCalendar;
          /**
           * Continuation duty with no layover_city shows "-" unless it falls on pairing end or synthetic arrival
           * (don’t tie to operate_end_date — bad DB mirror of last duty date would force JFK instead of "-" on T23).
           * J3H95-style overnight return leg: continuation, no lay, morning D-OFF → "-" (LAS-JFK 0009; next day synthetic JFK).
           */
          if (
            isCont &&
            !hasLay &&
            isMorningDutyOff(dutyRow.duty_off_time) &&
            notSyntheticArrivalDay
          ) {
            cityText = '-';
          } else if (treatAsContinuation && !hasLay && notOnPairingEnd && notSyntheticArrivalDay) {
            cityText = '-';
          } else if ((!hasLay || lay === baseCity) && hasDutyTimes) {
            /**
             * This branch used to always set CITY = base (JFK). That duplicates the synthetic TRIP_END row and ignores Crewline
             * “-” on non–trip-start duty days. Do not use DB `is_continuation` here — it is often unset; `rowType` is already
             * TRIP_CONTINUATION / CARRY_OUT for every day after trip label.
             */
            cityText =
              notOnPairingEnd && notSyntheticArrivalDay ? '-' : baseCity;
          } else if (!hasLay || lay === baseCity) {
            cityText = '-';
          } else {
            cityText = lay!;
          }

          if (String(dutyRow?.pairing_id) === 'J3H95') {
            const layover_city = dutyRow?.layover_city;
            console.log('[J3H95_CITY_DEBUG]', {
              dateIso,
              isCont: Boolean(dutyRow?.is_continuation),
              hasLay: Boolean(layover_city),
              dutyOff: dutyRow?.duty_off_time,
              isMorning: isMorningDutyOff(dutyRow?.duty_off_time),
              notPairingEnd: notOnPairingEnd,
              notSynthetic: notSyntheticArrivalDay,
              resultCity: cityText,
            });
          }
        }

        const layoverRaw =
          dutyRow.layover_time != null && String(dutyRow.layover_time).trim() ? String(dutyRow.layover_time).trim() : null;
        const layoverText =
          rowType === 'TRIP_START' || rowType === 'TRIP_CONTINUATION' || rowType === 'CARRY_OUT' ? layoverRaw : null;

        rows.push({
          dateIso,
          pairingText: isLabelDay ? flicaPairingKey || null : null,
          reportText: dutyRow.report_time != null && String(dutyRow.report_time).trim() ? dutyRow.report_time : null,
          cityText,
          dutyEndText:
            dutyRow.duty_off_time != null && String(dutyRow.duty_off_time).trim() ? dutyRow.duty_off_time : null,
          layoverText,
          rowType,
          sourcePairingId: flicaPairingKey,
        });
        return;
      }

      /** No duty: in-trip rest “-” only inside [firstDuty, enumerateEnd]; never for dates outside real trip span (off days stay absent). */
      if (dateIso < firstDutyIso || dateIso > enumerateEnd) return;

      if (dateIso < enumerateEnd) {
        let rowType: RowType = 'TRIP_CONTINUATION';
        if (monthLastForCarry != null && dateIso > monthLastForCarry) rowType = 'CARRY_OUT';
        rows.push({
          dateIso,
          pairingText: null,
          reportText: null,
          cityText: '-',
          dutyEndText: null,
          layoverText: null,
          rowType,
          sourcePairingId: flicaPairingKey,
          syntheticGapNoDuty: true,
        });
        return;
      }

      if (dateIso === enumerateEnd) {
        rows.push({
          dateIso,
          pairingText: null,
          reportText: null,
          cityText: baseCity,
          dutyEndText: null,
          layoverText: null,
          rowType: 'TRIP_END',
          sourcePairingId: flicaPairingKey,
        });
      }
    };

    for (const dIso of calendarDays) pushDutyOrGapRow(dIso);

    if (
      syntheticArrivalCalendar != null &&
      syntheticArrivalCalendar > enumerateEnd &&
      !dutyByIso.has(syntheticArrivalCalendar)
    ) {
      rows.push({
        dateIso: syntheticArrivalCalendar,
        pairingText: null,
        reportText: null,
        cityText: baseCity,
        dutyEndText: null,
        layoverText: null,
        rowType: 'TRIP_END',
        sourcePairingId: flicaPairingKey,
      });
    }

    tripCalendarByPairingId.set(String(flicaPairingKey).trim().toUpperCase(), {
      startIso: opStart!,
      endIso: tripVisualEnd,
    });
  }

  let out = dedupeClassicRowsGlobally(rows);
  const viewTag = readClassicViewTag(duties);
  if (viewTag != null) {
    out = filterClassicRowsForTouchedMonth(out, tripCalendarByPairingId, pairings, viewTag.year, viewTag.month);
    out = partitionRowsForClassicViewMonth(out, viewTag.year, viewTag.month);
  }
  return out;
}

/**
 * Load normalized duties + their pairings for a calendar month (current user).
 * Includes pairing legs (for synthetic arrival calendar day via `normalized_json.actualDepDateIso`).
 */
export async function fetchScheduleDutiesAndPairingsForMonth(
  year: number,
  month1to12: number,
): Promise<{
  duties: ScheduleDuty[];
  pairings: SchedulePairing[];
  pairingLegs: SchedulePairingLegLite[];
}> {
  const m = String(month1to12).padStart(2, '0');
  const start = `${year}-${m}-01`;
  const lastDom = new Date(year, month1to12, 0).getDate();
  const end = `${year}-${m}-${String(lastDom).padStart(2, '0')}`;

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) {
    return { duties: [], pairings: [], pairingLegs: [] };
  }
  const uid = u.user.id;

  /** One batch per persisted month repeat; newest `schedule_import_batches` wins so duties aren't duplicated in UI. */
  const monthKeyFilter = `${year}-${m}`;
  const { data: batchPick, error: bErr } = await supabase
    .from('schedule_import_batches')
    .select('id')
    .eq('user_id', uid)
    .eq('month_key', monthKeyFilter)
    .order('created_at', { ascending: false })
    .limit(1);

  if (bErr) throw bErr;
  const latestImportId = batchPick?.[0]?.id ?? null;
  if (!latestImportId) {
    return { duties: [], pairings: [], pairingLegs: [] };
  }

  const { data: pRows, error: pErr } = await supabase
    .from('schedule_pairings')
    .select(
      'id, import_id, pairing_id, base_code, operate_start_date, pairing_start_date, operate_end_date, pairing_end_date',
    )
    .eq('user_id', uid)
    .eq('import_id', latestImportId);

  if (pErr) throw pErr;
  let pairingsMerged = (pRows ?? []) as SchedulePairing[];

  /** Rule 4 carry-out/in: widen duty fetch to full trip tails/heads that bracket the viewed calendar month (Crewline-style). */
  let dutyRangeGte = start;
  let dutyRangeLte = end;
  const overlapping = pairingsMerged.filter((p) => pairingOverlapsCalendarMonth(p, year, month1to12));
  const pool = overlapping.length ? overlapping : pairingsMerged;
  for (const p of pool) {
    const st = pairingStartDateIso(p);
    const en = pairingEndDateIso(p);
    if (st != null && st < dutyRangeGte) dutyRangeGte = st;
    if (en != null && en > dutyRangeLte) dutyRangeLte = en;
  }

  const { data: dutyRows, error: dErr } = await supabase
    .from('schedule_duties')
    .select('*')
    .eq('user_id', uid)
    .eq('import_id', latestImportId)
    .gte('duty_date', dutyRangeGte)
    .lte('duty_date', dutyRangeLte);

  if (dErr) throw dErr;
  let mergedDuties = (dutyRows ?? []) as ScheduleDuty[];

  /** Pairings ending after the viewed month: pull continuation duties from next month’s latest batch (e.g. J4195 Apr trip → May 1–2). */
  const nxYear = month1to12 === 12 ? year + 1 : year;
  const nxMon = month1to12 === 12 ? 1 : month1to12 + 1;
  const nextMonthKey = `${nxYear}-${String(nxMon).padStart(2, '0')}`;
  const tailFlicaUpper = new Set<string>();
  let maxPairingEndBeyondView = end;
  for (const hp of pairingsMerged) {
    const en = pairingEndDateIso(hp);
    if (en != null && en > end) {
      tailFlicaUpper.add(String(hp.pairing_id).trim().toUpperCase());
      if (en > maxPairingEndBeyondView) maxPairingEndBeyondView = en;
    }
  }
  if (tailFlicaUpper.size > 0 && maxPairingEndBeyondView > end) {
    const { data: nextBatchPick } = await supabase
      .from('schedule_import_batches')
      .select('id')
      .eq('user_id', uid)
      .eq('month_key', nextMonthKey)
      .order('created_at', { ascending: false })
      .limit(1);
    const nextImportId = nextBatchPick?.[0]?.id ?? null;
    const tailPidList = [...tailFlicaUpper];
    const firstDayAfterMonth = addOneCalendarDayIso(end)!;
    if (nextImportId) {
      const { data: nextPairRows, error: npe } = await supabase
        .from('schedule_pairings')
        .select(
          'id, import_id, pairing_id, base_code, operate_start_date, pairing_start_date, operate_end_date, pairing_end_date',
        )
        .eq('user_id', uid)
        .eq('import_id', nextImportId)
        .in('pairing_id', tailPidList);
      if (!npe && nextPairRows?.length) {
        pairingsMerged = [...pairingsMerged, ...(nextPairRows as SchedulePairing[])];
      }
      const { data: nextDutyRows, error: nde } = await supabase
        .from('schedule_duties')
        .select('*')
        .eq('user_id', uid)
        .eq('import_id', nextImportId)
        .in('pairing_id', tailPidList)
        .gte('duty_date', firstDayAfterMonth)
        .lte('duty_date', maxPairingEndBeyondView);
      if (!nde && nextDutyRows?.length) {
        mergedDuties = [...mergedDuties, ...(nextDutyRows as ScheduleDuty[])];
      }
    }
  }

  mergedDuties = filterDutiesNotBeforePairingOperateStart(mergedDuties, pairingsMerged);

  const duties = tagDutiesWithClassicViewMonth(mergedDuties, year, month1to12);
  if (!duties.length) {
    return { duties: [], pairings: [], pairingLegs: [] };
  }

  const pairingUuidList = pairingsMerged.map((p) => p.id).filter((x): x is string => Boolean(x && String(x).trim().length));
  let pairingLegs: SchedulePairingLegLite[] = [];

  if (pairingUuidList.length) {
    const { data: legRows, error: legErr } = await supabase
      .from('schedule_pairing_legs')
      .select(
        'id,pairing_id,duty_date,flight_number,segment_type,departure_station,arrival_station,scheduled_departure_local,scheduled_arrival_local,release_time_local,is_deadhead,normalized_json,created_at',
      )
      .in('pairing_id', pairingUuidList)
      .order('created_at', { ascending: true });
    if (!legErr && legRows) {
      pairingLegs = legRows as SchedulePairingLegLite[];
    }
  }

  return { duties, pairings: pairingsMerged, pairingLegs };
}
