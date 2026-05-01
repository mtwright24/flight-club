/**
 * Normalized Classic row builder (schedule_duties + schedule_pairings) — display pipeline Step 7.
 * Does not replace existing Classic UI; used for verification logging first.
 */
import { supabase } from '../../lib/supabaseClient';
import { isFlicaNonFlyingActivityId } from '../../services/flicaScheduleHtmlParser';

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
  calendar_day?: number | null;
  flight_number?: string | null;
  segment_type?: string | null;
  departure_station?: string | null;
  arrival_station?: string | null;
  scheduled_departure_local?: string | null;
  scheduled_arrival_local?: string | null;
  release_time_local?: string | null;
  block_time?: number | null;
  layover_city?: string | null;
  hotel_name?: string | null;
  hotel_phone?: string | null;
  aircraft_position_code?: string | null;
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

/** Whole calendar days from startIso → firstDutyIso (e.g. Mar 8 → Mar 9 = 1). */
function calendarDaysFromStartToFirstDuty(startIso: string, firstDutyIso: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${firstDutyIso}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
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

function legCalendarIsoCandidates(leg: SchedulePairingLegLite): string[] {
  const out: string[] = [];
  const d = sliceDutyIso(leg.duty_date);
  if (d) out.push(d);
  const nj = (leg.normalized_json ?? {}) as Record<string, unknown>;
  for (const k of ['dutyDateIso', 'operatingDateIso', 'calendarDateIso', 'actualDepDateIso', 'actualArrDateIso']) {
    const v = nj[k];
    if (typeof v === 'string') {
      const s = sliceDutyIso(v);
      if (s) out.push(s);
    }
  }
  return [...new Set(out)];
}

function classicStationHintFromLegs(
  legs: SchedulePairingLegLite[],
  pairingUuidSet: Set<string>,
  dateIso: string,
): string | null {
  let arrivalFallback: string | null = null;
  for (const leg of legs) {
    if (!pairingUuidSet.has(String(leg.pairing_id))) continue;
    if (!legCalendarIsoCandidates(leg).includes(dateIso)) continue;
    const ly = leg.layover_city != null && String(leg.layover_city).trim() ? String(leg.layover_city).trim() : null;
    if (ly) return ly;
    const arr = leg.arrival_station != null && String(leg.arrival_station).trim() ? String(leg.arrival_station).trim() : null;
    if (arr) arrivalFallback = arr;
  }
  return arrivalFallback;
}

/** REPORT / D-OFF / layover rest (Crewline column) from legs when duty row missing or synthetic gap. */
function classicDutyFieldsFromLegs(
  legs: SchedulePairingLegLite[],
  pairingUuidSet: Set<string>,
  dateIso: string,
): { report: string | null; dEnd: string | null; layoverCity: string | null; layoverRest: string | null } {
  let report: string | null = null;
  let dEnd: string | null = null;
  let layoverCity: string | null = null;
  let layoverRest: string | null = null;
  for (const leg of legs) {
    if (!pairingUuidSet.has(String(leg.pairing_id))) continue;
    if (!legCalendarIsoCandidates(leg).includes(dateIso)) continue;
    const dep = leg.scheduled_departure_local != null && String(leg.scheduled_departure_local).trim() ? String(leg.scheduled_departure_local).trim() : null;
    const rel = leg.release_time_local != null && String(leg.release_time_local).trim() ? String(leg.release_time_local).trim() : null;
    if (dep && !report) report = dep;
    if (rel && !dEnd) dEnd = rel;
    const ly = leg.layover_city != null && String(leg.layover_city).trim() ? String(leg.layover_city).trim() : null;
    if (ly && !layoverCity) layoverCity = ly;
    const nj = leg.normalized_json as Record<string, unknown> | undefined;
    const restStr =
      nj != null && typeof nj.layover_rest_display === 'string' && String(nj.layover_rest_display).trim()
        ? String(nj.layover_rest_display).trim()
        : null;
    if (restStr && !layoverRest) layoverRest = restStr;
  }
  return { report, dEnd, layoverCity, layoverRest };
}

function pairingHasDutyOrLegOnOrAfter(
  fromIsoExclusive: string,
  throughIsoInclusive: string,
  dutyByIso: Map<string, ScheduleDuty>,
  legs: SchedulePairingLegLite[],
  legUuids: Set<string>,
): boolean {
  let cur = addOneCalendarDayIso(fromIsoExclusive);
  const end = String(throughIsoInclusive).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  let guard = 0;
  while (cur && cur <= end && guard < 160) {
    guard += 1;
    if (dutyByIso.has(cur)) return true;
    for (const leg of legs) {
      if (!legUuids.has(String(leg.pairing_id))) continue;
      if (legCalendarIsoCandidates(leg).includes(cur)) return true;
    }
    if (cur === end) break;
    const nx = addOneCalendarDayIso(cur);
    if (!nx || nx === cur) break;
    cur = nx;
  }
  return false;
}

function dutyPairKey(d: Pick<ScheduleDuty, 'import_id' | 'pairing_id'>): string {
  return `${d.import_id}|${d.pairing_id}`;
}

function calendarDiffDays(prevIso: string, nextIso: string): number {
  const d0 = new Date(`${String(prevIso).trim().slice(0, 10)}T12:00:00`).getTime();
  const d1 = new Date(`${String(nextIso).trim().slice(0, 10)}T12:00:00`).getTime();
  if (!Number.isFinite(d0) || !Number.isFinite(d1)) return 0;
  return Math.round((d1 - d0) / 86400000);
}

/**
 * Same FLICA id may repeat in a month (e.g. J1028 Mar 12–14 vs Mar 21–23). Merged schedule_pairings min/max
 * must NOT drive one continuous synthetic span: if actual duties gap by more than this many calendar days,
 * start a new occurrence (no gap-fill between clusters).
 */
const MAX_CAL_DAYS_BETWEEN_CONSECUTIVE_DUTIES_SAME_OCCURRENCE = 3;

function splitDutiesByOccurrenceGap(sortedAsc: ScheduleDuty[]): ScheduleDuty[][] {
  if (!sortedAsc.length) return [];
  const clusters: ScheduleDuty[][] = [];
  let cur: ScheduleDuty[] = [sortedAsc[0]!];
  for (let i = 1; i < sortedAsc.length; i++) {
    const prevIso = sliceDutyIso(sortedAsc[i - 1]!.duty_date);
    const thisIso = sliceDutyIso(sortedAsc[i]!.duty_date);
    if (!prevIso || !thisIso) {
      cur.push(sortedAsc[i]!);
      continue;
    }
    const gap = calendarDiffDays(prevIso, thisIso);
    if (gap > MAX_CAL_DAYS_BETWEEN_CONSECUTIVE_DUTIES_SAME_OCCURRENCE) {
      clusters.push(cur);
      cur = [sortedAsc[i]!];
    } else {
      cur.push(sortedAsc[i]!);
    }
  }
  clusters.push(cur);
  return clusters;
}

/** Pick the schedule_pairings row whose operate window covers this duty (not merged min/max across blocks). */
function findPairingCoveringDuty(d: ScheduleDuty, pairings: SchedulePairing[]): SchedulePairing | undefined {
  const imp = String(d.import_id ?? '').trim();
  const pidU = String(d.pairing_id ?? '').trim().toUpperCase();
  const iso = sliceDutyIso(d.duty_date);
  if (!imp || !pidU) return undefined;
  const candidates = pairings.filter(
    (p) => String(p.import_id).trim() === imp && String(p.pairing_id).trim().toUpperCase() === pidU,
  );
  if (!candidates.length) return undefined;
  if (!iso) return candidates[0];
  for (const p of candidates) {
    const ps = pairingStartDateIso(p);
    const pe = pairingEndDateIso(p);
    if (ps != null && pe != null && iso >= ps && iso <= pe) return p;
  }
  return candidates[0];
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

/** Prefer one winner per calendar day **within the same pairing** (`dateIso` + `sourcePairingId`). */
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

function pairingKeyForClassicDedupe(r: ClassicScheduleRow): string {
  const raw = String(r.sourcePairingId ?? '').trim();
  return raw ? raw.toUpperCase() : '__no_pid__';
}

/** One row per `dateIso` per pairing; different pairings on the same day both kept. */
function dedupeClassicRowsGlobally(rows: ClassicScheduleRow[]): ClassicScheduleRow[] {
  const m = new Map<string, ClassicScheduleRow>();
  for (const r of rows) {
    const dateKey = String(r.dateIso).trim().slice(0, 10);
    const dedupeKey = `${dateKey}::${pairingKeyForClassicDedupe(r)}`;
    const prev = m.get(dedupeKey);
    if (!prev) {
      m.set(dedupeKey, r);
      continue;
    }
    if (classicRowWinsDedupe(r, prev)) m.set(dedupeKey, r);
  }
  return [...m.values()].sort((a, b) => {
    const da = String(a.dateIso).trim().slice(0, 10).localeCompare(String(b.dateIso).trim().slice(0, 10));
    if (da !== 0) return da;
    return pairingKeyForClassicDedupe(a).localeCompare(pairingKeyForClassicDedupe(b));
  });
}

/**
 * FCV-style: when trip B **starts** on a calendar day, drop **TRIP_END** from another pairing on that day
 * (e.g. Mar 8 J1030 LHR vs J3920 JFK end).
 */
function suppressForeignTripEndWhenAnotherTripStartsSameDay(rows: ClassicScheduleRow[]): ClassicScheduleRow[] {
  const byDate = new Map<string, ClassicScheduleRow[]>();
  for (const r of rows) {
    const d = String(r.dateIso).trim().slice(0, 10);
    const arr = byDate.get(d) ?? [];
    arr.push(r);
    byDate.set(d, arr);
  }
  const drop = new Set<string>();
  for (const arr of byDate.values()) {
    const starterPids = new Set(
      arr
        .filter((r) => r.rowType === 'TRIP_START')
        .map((r) => String(r.sourcePairingId).trim().toUpperCase()),
    );
    if (starterPids.size === 0) continue;
    for (const r of arr) {
      if (r.rowType !== 'TRIP_END') continue;
      const pid = String(r.sourcePairingId).trim().toUpperCase();
      if (!starterPids.has(pid)) {
        drop.add(`${String(r.dateIso).trim().slice(0, 10)}::${pid}::TRIP_END`);
      }
    }
  }
  return rows.filter((r) => {
    if (r.rowType !== 'TRIP_END') return true;
    const k = `${String(r.dateIso).trim().slice(0, 10)}::${String(r.sourcePairingId).trim().toUpperCase()}::TRIP_END`;
    return !drop.has(k);
  });
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

/**
 * Latest `duty_date` per `import_id` for this FLICA pairing id — identifies the calendar row that is the true
 * final duty of the pairing (CITY = base, not continuation “-”).
 */
function buildLastDutyIsoByImportId(duties: ScheduleDuty[], pairingIdUpper: string): Map<string, string> {
  const out = new Map<string, string>();
  const pid = pairingIdUpper.trim().toUpperCase();
  const byImport = new Map<string, ScheduleDuty[]>();
  for (const d of duties) {
    if (String(d.pairing_id).trim().toUpperCase() !== pid) continue;
    const imp = String(d.import_id ?? '').trim();
    if (!imp) continue;
    const arr = byImport.get(imp) ?? [];
    arr.push(d);
    byImport.set(imp, arr);
  }
  for (const [imp, arr] of byImport) {
    const sorted = [...arr].sort((a, b) => String(a.duty_date).localeCompare(String(b.duty_date)));
    const last = sorted[sorted.length - 1];
    const iso = last ? sliceDutyIso(last.duty_date) : null;
    if (iso) out.set(imp, iso);
  }
  return out;
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
 * Never extend into `operate_end_date` tail unless this pairing has a duty or leg on a calendar day in that tail
 * (FCV placement — no phantom JFK/base rows from DB end date alone).
 */
function safeEnumerateEnd(
  opEnd: string | null,
  lastDutyIso: string,
  syntheticArrival: string | null,
  dutyByIso: Map<string, ScheduleDuty>,
  legs: SchedulePairingLegLite[],
  legUuids: Set<string>,
): string {
  const candidates = [String(lastDutyIso).trim().slice(0, 10)];
  if (syntheticArrival) candidates.push(String(syntheticArrival).trim().slice(0, 10));
  const naturalEnd = [...candidates].sort((a, b) => a.localeCompare(b)).reverse()[0]!;

  if (!opEnd) return naturalEnd;

  const opEndS = String(opEnd).trim().slice(0, 10);
  const lastS = String(lastDutyIso).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opEndS) || !/^\d{4}-\d{2}-\d{2}$/.test(lastS)) return naturalEnd;

  if (opEndS <= naturalEnd) return naturalEnd;

  const hasActivityInOpTail = pairingHasDutyOrLegOnOrAfter(naturalEnd, opEndS, dutyByIso, legs, legUuids);
  if (!hasActivityInOpTail) return naturalEnd;

  const opEndDate = new Date(`${opEndS}T12:00:00`);
  const lastDutyDate = new Date(`${lastS}T12:00:00`);
  const diffDays = Math.round((opEndDate.getTime() - lastDutyDate.getTime()) / 86400000);

  if (diffDays > 7) return naturalEnd;
  return opEndS;
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

function maxIsoYmd(cands: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const raw of cands) {
    const s = raw != null ? String(raw).trim().slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) continue;
    if (best == null || s > best) best = s;
  }
  return best;
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
 * Crewline non-flying row: `pairing_id` is either a plain activity code (`PTV`) or a calendar-grid key (`PTV·cal·…`).
 * When set, Classic **city** column shows this code — never base-return / synthetic arrival airport.
 */
function classicNonFlyingActivityDisplayCode(pairingId: string | null | undefined): string | null {
  const raw = String(pairingId ?? '').trim();
  if (!raw) return null;
  if (isFlicaNonFlyingActivityId(raw)) return raw.toUpperCase();
  const u = raw.toUpperCase();
  const i = u.indexOf('·CAL·');
  if (i > 0) {
    const prefix = raw.slice(0, i).trim();
    if (isFlicaNonFlyingActivityId(prefix)) return prefix.toUpperCase();
  }
  return null;
}

/**
 * Group duties by trip (schedule_pairings), sort by duty_date, fill every calendar operate day.
 */
export function buildClassicRowsFromDuties(
  duties: ScheduleDuty[],
  pairings: SchedulePairing[],
  pairingLegs: SchedulePairingLegLite[],
): ClassicScheduleRow[] {
  /** Dates with any persisted duty (any pairing) — next day cannot host this pairing’s synthetic row. */
  const datesWithAnyDutyGlobal = new Set<string>();
  for (const d of duties) {
    const iso = sliceDutyIso(d.duty_date);
    if (iso) datesWithAnyDutyGlobal.add(iso);
  }

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
    const pairingMerged = mergePairingsForFlicaId(pairings, pidUpper);
    const rawTripDuties = duties.filter((d) => String(d.pairing_id).trim().toUpperCase() === pidUpper);
    if (!rawTripDuties.length && !pairingMerged) continue;

    const sortedAllRaw = uniqDutiesByDutyDateAscending(rawTripDuties);
    const dutyClusters = sortedAllRaw.length > 0 ? splitDutiesByOccurrenceGap(sortedAllRaw) : [];
    const clustersToProcess: ScheduleDuty[][] =
      dutyClusters.length > 0 ? dutyClusters : [[]];

    const uuidsForLegs = pairingUuidListForFlica(pairings, pidUpper);

    for (const clusterDutiesSorted of clustersToProcess) {
      let pairingForCluster: SchedulePairing | undefined =
        clusterDutiesSorted.length > 0
          ? findPairingCoveringDuty(clusterDutiesSorted[0]!, pairings) ?? pairingMerged
          : pairingMerged;
      if (!pairingForCluster && clusterDutiesSorted.length > 0) {
        pairingForCluster = findPairing(clusterDutiesSorted[0]!, pairings);
      }
      if (!pairingForCluster) continue;

      const windowed = filterDutiesToPairingWindow(clusterDutiesSorted, pairingForCluster);
      const tripDutiesSorted = uniqDutiesByDutyDateAscending(windowed);
      if (!tripDutiesSorted.length && clusterDutiesSorted.length > 0) continue;

      const pairingEffective = pairingForCluster;

      const flicaPairingKey = String(pairingEffective.pairing_id ?? pidUpper).trim();

      const baseCity =
        (pairingEffective.base_code && String(pairingEffective.base_code).trim()) ||
        (pairingEffective as { baseAirport?: string }).baseAirport?.trim() ||
        'JFK';

      const activityCityCode = classicNonFlyingActivityDisplayCode(flicaPairingKey);

      let opStart = pairingStartDateIso(pairingEffective);
      let opEnd = pairingEndDateIso(pairingEffective);
      if (opStart == null && tripDutiesSorted.length) opStart = sliceDutyIso(tripDutiesSorted[0]!.duty_date);
      if (opEnd == null && tripDutiesSorted.length) opEnd = sliceDutyIso(tripDutiesSorted[tripDutiesSorted.length - 1]!.duty_date);
      if (opStart == null || opEnd == null || opEnd < opStart) continue;

      /**
       * When pairing operate/header start is **one calendar day** before the first persisted duty, keep that
       * date so Classic can emit a single header-lead TRIP_START (Crewline positioning before day-1 duty).
       * If the gap is longer, treat pairing_start as stale vs duties and clamp to first duty (legacy FIX 3).
       */
      const firstDutyIsoFromDuties = tripDutiesSorted.length ? sliceDutyIso(tripDutiesSorted[0]!.duty_date)! : null;
      let headerLeadBeforeFirstDuty = false;
      if (tripDutiesSorted.length && firstDutyIsoFromDuties != null && firstDutyIsoFromDuties > opStart!) {
        const gapDays = calendarDaysFromStartToFirstDuty(opStart!, firstDutyIsoFromDuties);
        if (gapDays === 1) headerLeadBeforeFirstDuty = true;
        else if (gapDays > 1) opStart = firstDutyIsoFromDuties;
      }
      const firstDutyIso = firstDutyIsoFromDuties ?? opStart!;

      const pairingEndOnlyIso = sliceDutyIso(pairingEffective.pairing_end_date);

      const dutyByIso = new Map<string, ScheduleDuty>();
      for (const d of tripDutiesSorted) {
        const iso = sliceDutyIso(d.duty_date);
        if (!iso) continue;
        dutyByIso.set(iso, d);
      }

      let lastDutyIso = tripDutiesSorted.length
        ? sliceDutyIso(tripDutiesSorted[tripDutiesSorted.length - 1]!.duty_date)!
        : (opEnd ?? opStart!);
      let lastDutyRow = tripDutiesSorted.length ? tripDutiesSorted[tripDutiesSorted.length - 1]! : null;

      const endIsoFromLeg = syntheticEndIsoFromLegs(pairingLegs, lastDutyIso, uuidsForLegs);
      const endIsoFromMorningDutyOff =
        lastDutyRow != null ? syntheticEndIsoFromMorningDutyOff(lastDutyRow, lastDutyIso) : null;

      /** Crew/Fleet Calendar: synthetic arrival from legs / morning D-OFF only — never `operate_end_date` alone. */
      let syntheticArrivalCalendar: string | null = null;
      if (endIsoFromLeg != null) {
        syntheticArrivalCalendar = endIsoFromLeg;
      }
      if (endIsoFromMorningDutyOff != null) {
        if (syntheticArrivalCalendar == null || endIsoFromMorningDutyOff > syntheticArrivalCalendar) {
          syntheticArrivalCalendar = endIsoFromMorningDutyOff;
        }
      }

      const legUuidSet = new Set(uuidsForLegs);

      /** Real trip calendar end (last duty + synthetic arrival) — trip bounds / filter hint. */
      let tripVisualEnd = lastDutyIso;
      if (syntheticArrivalCalendar != null && syntheticArrivalCalendar > tripVisualEnd) tripVisualEnd = syntheticArrivalCalendar;
      const enumerateEnd = safeEnumerateEnd(
        opEnd != null ? String(opEnd).trim().slice(0, 10) : null,
        lastDutyIso,
        syntheticArrivalCalendar,
        dutyByIso,
        pairingLegs,
        legUuidSet,
      );

      /** Trip label day matches calendar enumerate start (header lead allowed one day before first duty). */
      const tripLabelIso = opStart!;
      const viewTag = readClassicViewTag(duties);
      const monthLastForCarry =
        viewTag != null ? monthLastIso(viewTag.year, viewTag.month) : null;

      const calendarDays = eachIsoInclusive(opStart!, enumerateEnd);
      const lastDutyIsoByImportId = buildLastDutyIsoByImportId(windowed, pidUpper);

      const pushDutyOrGapRow = (dateIso: string) => {
      const dutyRow = dutyByIso.get(dateIso);

      if (dutyRow) {
        const legFields = classicDutyFieldsFromLegs(pairingLegs, legUuidSet, dateIso);
        const legHintStation = classicStationHintFromLegs(pairingLegs, legUuidSet, dateIso);

        const isLabelDay = dateIso === tripLabelIso;
        /** Mar 8 header TRIP_START → Mar 9 first duty must stay city "-" (no leg-hint promotion to LHR). */
        const isFirstDutyDayImmediatelyAfterHeaderLead =
          headerLeadBeforeFirstDuty &&
          firstDutyIsoFromDuties != null &&
          dateIso === firstDutyIsoFromDuties;
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

        const dutyDateIso = sliceDutyIso(dutyRow.duty_date);
        const impKey = String(dutyRow.import_id ?? '').trim();
        const lastIsoForThisImport = impKey ? lastDutyIsoByImportId.get(impKey) : undefined;
        const fallbackLastDutyIso = tripDutiesSorted.length
          ? sliceDutyIso(tripDutiesSorted[tripDutiesSorted.length - 1]!.duty_date)
          : null;
        const effectiveLastDutyIso = lastIsoForThisImport ?? fallbackLastDutyIso;
        const isLastLeg =
          Boolean(dutyDateIso) &&
          Boolean(effectiveLastDutyIso) &&
          dutyDateIso === effectiveLastDutyIso &&
          !activityCityCode;

        const nextCalendarIso =
          dutyDateIso != null ? addOneCalendarDayIso(dutyDateIso) : null;
        const nextDateOccupiedByAnyDuty =
          nextCalendarIso != null && datesWithAnyDutyGlobal.has(nextCalendarIso);
        /**
         * Next calendar day can host this pairing’s synthetic gap / TRIP_END row: in-window, no duty for this pairing,
         * and no other pairing’s duty on that date (otherwise the synthetic is not renderable and this duty is the true end).
         */
        const hasSyntheticNextDay =
          nextCalendarIso != null &&
          nextCalendarIso >= firstDutyIso &&
          nextCalendarIso <= enumerateEnd &&
          !dutyByIso.has(nextCalendarIso) &&
          !nextDateOccupiedByAnyDuty;

        const baseU = String(baseCity).trim().toUpperCase();
        const layU = lay != null ? String(lay).trim().toUpperCase() : null;
        const hintU =
          legHintStation != null && String(legHintStation).trim()
            ? String(legHintStation).trim().toUpperCase()
            : null;
        /** Duty DB + same-day leg hint: real outstation to show (not base). Used to avoid forcing '-' before synthetic JFK when LAS is real (J4173). */
        const hasRealOutstationLayoverForThisDuty =
          (layU != null && layU !== baseU) || (hintU != null && hintU !== baseU);

        const isTrueEndOfTrip = isLastLeg && !hasSyntheticNextDay;

        let cityText: string;

        if (isTrueEndOfTrip) {
          if (!isLabelDay) {
            rowType = 'TRIP_END';
          }
          cityText = baseCity;
        } else if (isLastLeg && hasSyntheticNextDay && !hasRealOutstationLayoverForThisDuty) {
          /** Last persisted duty before synthetic/base next day: dash only when no real non-base outstation (J3H95). */
          cityText = '-';
        } else if (rowType === 'TRIP_START') {
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

        }

        const clusterDutyCount = tripDutiesSorted.length;
        const dutyIdxInCluster = clusterDutyCount
          ? tripDutiesSorted.findIndex((d) => sliceDutyIso(d.duty_date) === dateIso)
          : -1;
        const firstDutyCluster = tripDutiesSorted[0];
        const firstDutyIsoCluster = firstDutyCluster ? sliceDutyIso(firstDutyCluster.duty_date) : null;
        const firstLayCluster =
          firstDutyCluster?.layover_city != null && String(firstDutyCluster.layover_city).trim()
            ? String(firstDutyCluster.layover_city).trim()
            : null;
        let firstDutyOutstation =
          firstLayCluster != null &&
          firstLayCluster.toUpperCase() !== String(baseCity).toUpperCase();
        const lastDutyCluster = clusterDutyCount > 0 ? tripDutiesSorted[clusterDutyCount - 1]! : null;
        const lastDutyIsoCluster = lastDutyCluster ? sliceDutyIso(lastDutyCluster.duty_date) : null;
        const lastLayCluster =
          lastDutyCluster?.layover_city != null && String(lastDutyCluster.layover_city).trim()
            ? String(lastDutyCluster.layover_city).trim()
            : null;
        const lastHintCluster =
          lastDutyIsoCluster != null
            ? classicStationHintFromLegs(pairingLegs, legUuidSet, lastDutyIsoCluster)
            : null;
        const lastDutyAnchorsBase =
          (lastLayCluster != null && lastLayCluster.toUpperCase() === String(baseCity).toUpperCase()) ||
          (lastHintCluster != null && lastHintCluster.toUpperCase() === String(baseCity).toUpperCase());
        if (
          !firstDutyOutstation &&
          clusterDutyCount >= 3 &&
          lastDutyAnchorsBase &&
          firstDutyIsoCluster
        ) {
          const hintFirst = classicStationHintFromLegs(pairingLegs, legUuidSet, firstDutyIsoCluster);
          if (hintFirst != null && hintFirst.toUpperCase() !== String(baseCity).toUpperCase()) {
            firstDutyOutstation = true;
          }
        }
        const isStrictMiddleDuty =
          clusterDutyCount >= 3 &&
          dutyIdxInCluster > 0 &&
          dutyIdxInCluster < clusterDutyCount - 1;
        /** BOS/LHR → "-" → JFK: middle continuation days stay "-"; do not promote leg hint to base. */
        let suppressMiddleOutstationLegHint = false;
        if (
          firstDutyOutstation &&
          isStrictMiddleDuty &&
          !hasLay &&
          !activityCityCode &&
          rowType !== 'TRIP_START' &&
          rowType !== 'TRIP_END'
        ) {
          cityText = '-';
          suppressMiddleOutstationLegHint = true;
        }

        /** When we force dash before synthetic JFK, block leg-hint promotion to arrival (JFK); if real outstation exists, allow normal hint path. */
        const suppressSynthBaseLegHint =
          isLastLeg && hasSyntheticNextDay && !hasRealOutstationLayoverForThisDuty;

        if (activityCityCode && cityText === baseCity) cityText = '-';

        if (
          !activityCityCode &&
          cityText === '-' &&
          legHintStation &&
          rowType !== 'TRIP_END' &&
          !suppressMiddleOutstationLegHint &&
          !suppressSynthBaseLegHint
        ) {
          cityText = legHintStation;
        }

        if (isFirstDutyDayImmediatelyAfterHeaderLead) {
          cityText = '-';
        }

        const reportMerged =
          dutyRow.report_time != null && String(dutyRow.report_time).trim()
            ? String(dutyRow.report_time).trim()
            : legFields.report;
        const dutyEndMerged =
          dutyRow.duty_off_time != null && String(dutyRow.duty_off_time).trim()
            ? String(dutyRow.duty_off_time).trim()
            : legFields.dEnd;

        const layoverRaw =
          dutyRow.layover_time != null && String(dutyRow.layover_time).trim() ? String(dutyRow.layover_time).trim() : null;
        const dutyHadReport = Boolean(dutyRow.report_time != null && String(dutyRow.report_time).trim());
        const dutyHadDEnd = Boolean(dutyRow.duty_off_time != null && String(dutyRow.duty_off_time).trim());
        const usedLegTimes =
          (!dutyHadReport && Boolean(legFields.report)) || (!dutyHadDEnd && Boolean(legFields.dEnd));
        const cityMatchesLegStation =
          Boolean(legHintStation) && String(cityText).trim().toUpperCase() === String(legHintStation).trim().toUpperCase();
        const layoverMerged =
          layoverRaw ??
          (legFields.layoverRest && (usedLegTimes || cityMatchesLegStation) ? legFields.layoverRest : null);
        const layoverText =
          rowType === 'TRIP_START' || rowType === 'TRIP_CONTINUATION' || rowType === 'CARRY_OUT' || rowType === 'TRIP_END'
            ? layoverMerged
            : null;

        /** J1030: first persisted duty shifts display onto header-lead day — clear duplicate report/d-end/lay on that duty row. */
        const pushDutyReport = isFirstDutyDayImmediatelyAfterHeaderLead ? null : reportMerged;
        const pushDutyEnd = isFirstDutyDayImmediatelyAfterHeaderLead ? null : dutyEndMerged;
        const pushLayover = isFirstDutyDayImmediatelyAfterHeaderLead ? null : layoverText;

        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          const pk = String(flicaPairingKey).trim().toUpperCase();
          if (pk === 'J4173' && dateIso >= '2026-04-06' && dateIso <= '2026-04-09') {
            console.log('[J4173_CITY_CHECK]', {
              dateIso,
              hasRealOutstationLayoverForThisDuty,
              isLastLeg,
              hasSyntheticNextDay,
              lay,
              legHintStation,
              cityText,
              rowType,
            });
          }
          if (pk === 'J3H95' && dateIso >= '2026-04-22' && dateIso <= '2026-04-24') {
            console.log('[J3H95_DASH_CHECK]', {
              dateIso,
              hasRealOutstationLayoverForThisDuty,
              isLastLeg,
              hasSyntheticNextDay,
              lay,
              legHintStation,
              cityText,
              rowType,
            });
          }
        }

        rows.push({
          dateIso,
          pairingText: activityCityCode
            ? activityCityCode
            : isLabelDay
              ? flicaPairingKey || null
              : null,
          reportText: pushDutyReport,
          cityText,
          dutyEndText: pushDutyEnd,
          layoverText: pushLayover,
          rowType,
          sourcePairingId: flicaPairingKey,
        });
        return;
      }

      /**
       * No duty: gap rows inside [enumerate start, enumerateEnd]; allow exactly one header-lead calendar day at opStart
       * when it precedes first persisted duty by one day (off days outside the trip window stay absent).
       */
      if (dateIso > enumerateEnd) return;
      if (dateIso < firstDutyIso) {
        const allowHeaderOnly =
          headerLeadBeforeFirstDuty && dateIso === opStart && firstDutyIsoFromDuties != null;
        if (!allowHeaderOnly) return;
      }

      if (dateIso < enumerateEnd) {
        const legAttachIso =
          headerLeadBeforeFirstDuty &&
          dateIso === opStart &&
          firstDutyIsoFromDuties != null &&
          tripDutiesSorted.length > 0
            ? firstDutyIsoFromDuties
            : dateIso;
        const legF = classicDutyFieldsFromLegs(pairingLegs, legUuidSet, legAttachIso);
        const gapStationRaw = classicStationHintFromLegs(pairingLegs, legUuidSet, dateIso);
        let gapCity = gapStationRaw != null ? gapStationRaw : '-';
        /** Header-lead (opStart): show first duty report / city / D-end / layover on pairing label row — not blanks from wrong-calendar legs. */
        let gapReport = legF.report;
        let gapDEnd = legF.dEnd;
        let gapLayoverRest = legF.layoverRest;
        if (headerLeadBeforeFirstDuty && dateIso === opStart && tripDutiesSorted.length) {
          const fd = tripDutiesSorted[0]!;
          const fdIso = sliceDutyIso(fd.duty_date);
          const lay0 =
            fd.layover_city != null && String(fd.layover_city).trim()
              ? String(fd.layover_city).trim()
              : null;
          const legHintStationLead = fdIso ? classicStationHintFromLegs(pairingLegs, legUuidSet, fdIso) : null;
          if (lay0 && lay0.toUpperCase() !== baseCity.toUpperCase()) gapCity = lay0;
          else if (legHintStationLead && legHintStationLead.toUpperCase() !== baseCity.toUpperCase()) gapCity = legHintStationLead;
          const legFields = classicDutyFieldsFromLegs(pairingLegs, legUuidSet, fdIso ?? dateIso);
          gapReport =
            fd.report_time != null && String(fd.report_time).trim()
              ? String(fd.report_time).trim()
              : legFields.report;
          gapDEnd =
            fd.duty_off_time != null && String(fd.duty_off_time).trim()
              ? String(fd.duty_off_time).trim()
              : legFields.dEnd;
          const layoverRawLead =
            fd.layover_time != null && String(fd.layover_time).trim() ? String(fd.layover_time).trim() : null;
          const dutyHadRep = Boolean(fd.report_time != null && String(fd.report_time).trim());
          const dutyHadDEnd = Boolean(fd.duty_off_time != null && String(fd.duty_off_time).trim());
          const usedLegTimesLead =
            (!dutyHadRep && Boolean(legFields.report)) || (!dutyHadDEnd && Boolean(legFields.dEnd));
          const cityMatchesLegLead =
            Boolean(legHintStationLead) && String(gapCity).trim().toUpperCase() === String(legHintStationLead).trim().toUpperCase();
          gapLayoverRest =
            layoverRawLead ??
            (legFields.layoverRest && (usedLegTimesLead || cityMatchesLegLead) ? legFields.layoverRest : null);
        }
        let rowType: RowType = dateIso === tripLabelIso ? 'TRIP_START' : 'TRIP_CONTINUATION';
        if (monthLastForCarry != null && dateIso > monthLastForCarry && rowType !== 'TRIP_START') rowType = 'CARRY_OUT';
        const gapPairing =
          dateIso === tripLabelIso ? (activityCityCode ? activityCityCode : flicaPairingKey || null) : activityCityCode ?? null;
        rows.push({
          dateIso,
          pairingText: gapPairing,
          reportText: gapReport,
          cityText: gapCity,
          dutyEndText: gapDEnd,
          layoverText: gapLayoverRest,
          rowType,
          sourcePairingId: flicaPairingKey,
          syntheticGapNoDuty: true,
        });
        return;
      }

      if (dateIso === enumerateEnd) {
        const legF = classicDutyFieldsFromLegs(pairingLegs, legUuidSet, dateIso);
        const gapStationRaw = classicStationHintFromLegs(pairingLegs, legUuidSet, dateIso);
        rows.push({
          dateIso,
          pairingText: activityCityCode ?? null,
          reportText: legF.report,
          cityText: activityCityCode ? '-' : gapStationRaw ?? baseCity,
          dutyEndText: legF.dEnd,
          layoverText: legF.layoverRest,
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
      const legF = classicDutyFieldsFromLegs(pairingLegs, legUuidSet, syntheticArrivalCalendar);
      const gapStationRaw = classicStationHintFromLegs(pairingLegs, legUuidSet, syntheticArrivalCalendar);
      rows.push({
        dateIso: syntheticArrivalCalendar,
        pairingText: activityCityCode ?? null,
        reportText: legF.report,
        cityText: activityCityCode ? '-' : gapStationRaw ?? baseCity,
        dutyEndText: legF.dEnd,
        layoverText: legF.layoverRest,
        rowType: 'TRIP_END',
        sourcePairingId: flicaPairingKey,
      });
    }

      const pidKey = String(flicaPairingKey).trim().toUpperCase();
      const occEnd =
        maxIsoYmd([opEnd, enumerateEnd, tripVisualEnd, syntheticArrivalCalendar, lastDutyIso]) ?? tripVisualEnd;
      const prevBounds = tripCalendarByPairingId.get(pidKey);
      if (!prevBounds) {
        tripCalendarByPairingId.set(pidKey, { startIso: opStart!, endIso: occEnd });
      } else {
        tripCalendarByPairingId.set(pidKey, {
          startIso: prevBounds.startIso.localeCompare(opStart!) <= 0 ? prevBounds.startIso : opStart!,
          endIso: prevBounds.endIso.localeCompare(occEnd) >= 0 ? prevBounds.endIso : occEnd,
        });
      }
    }
  }

  let out = dedupeClassicRowsGlobally(rows);
  out = suppressForeignTripEndWhenAnotherTripStartsSameDay(out);
  const viewTag = readClassicViewTag(duties);
  if (viewTag != null) {
    out = filterClassicRowsForTouchedMonth(out, tripCalendarByPairingId, pairings, viewTag.year, viewTag.month);
    out = partitionRowsForClassicViewMonth(out, viewTag.year, viewTag.month);
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const j1030Final = out.filter(
      (r) =>
        String(r.sourcePairingId).trim().toUpperCase() === 'J1030' &&
        r.dateIso >= '2026-03-08' &&
        r.dateIso <= '2026-03-10',
    );
    console.log(
      '[J1030_SHIFT_CHECK]',
      j1030Final.map((r) => ({
        dateIso: r.dateIso,
        pairingText: r.pairingText,
        reportText: r.reportText,
        cityText: r.cityText,
        dutyEndText: r.dutyEndText,
        layoverText: r.layoverText,
        rowType: r.rowType,
        syntheticGapNoDuty: r.syntheticGapNoDuty ?? false,
      })),
    );
    const j3h95Final = out.filter(
      (r) =>
        String(r.sourcePairingId).trim().toUpperCase() === 'J3H95' &&
        r.dateIso >= '2026-04-22' &&
        r.dateIso <= '2026-04-24',
    );
    console.log(
      '[J3H95_DASH_CHECK]',
      j3h95Final.map((r) => ({
        dateIso: r.dateIso,
        pairingText: r.pairingText,
        reportText: r.reportText,
        cityText: r.cityText,
        dutyEndText: r.dutyEndText,
        layoverText: r.layoverText,
        rowType: r.rowType,
        syntheticGapNoDuty: r.syntheticGapNoDuty ?? false,
      })),
    );
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
        'id,pairing_id,duty_date,calendar_day,flight_number,segment_type,departure_station,arrival_station,scheduled_departure_local,scheduled_arrival_local,release_time_local,block_time,layover_city,hotel_name,hotel_phone,is_deadhead,aircraft_position_code,normalized_json,created_at',
      )
      .in('pairing_id', pairingUuidList)
      .order('created_at', { ascending: true });
    if (!legErr && legRows) {
      pairingLegs = legRows as SchedulePairingLegLite[];
    }
  }

  return { duties, pairings: pairingsMerged, pairingLegs };
}
