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

function syntheticEndIsoFromLegs(
  legs: SchedulePairingLegLite[],
  lastDutyIso: string,
  pairingUuid: string,
): string | null {
  const mine = legs.filter((l) => l.pairing_id === pairingUuid);
  let best: string | null = null;
  for (const leg of mine) {
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
      return 6;
    case 'TRIP_CONTINUATION':
      return 5;
    case 'TRIP_END':
      return 4;
    case 'CARRY_IN':
      return 3;
    case 'CARRY_OUT':
      return 2;
    case 'EMPTY_DAY':
      return 1;
    case 'NON_FLIGHT_DUTY':
      return 0;
    default:
      return -1;
  }
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
    const pr = rowPriorityDedupeGlobally(r.rowType);
    const px = rowPriorityDedupeGlobally(prev.rowType);
    if (pr > px) m.set(dateKey, r);
  }
  return [...m.values()].sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.sourcePairingId.localeCompare(b.sourcePairingId));
}

/**
 * Persisted imports may repeat `duty_date` for one pairing; canonical display is one Classic row per distinct date.
 */
function pickDutyForDuplicateDate(prev: ScheduleDuty, next: ScheduleDuty): ScheduleDuty {
  const pCont = !!prev.is_continuation;
  const nCont = !!next.is_continuation;
  if (pCont !== nCont) return nCont ? prev : next;
  const prevScore =
    (prev.report_time ? 2 : 0) +
    (prev.duty_off_time ? 1 : 0) +
    ((prev.layover_city != null && String(prev.layover_city).trim()) ? 1 : 0);
  const nextScore =
    (next.report_time ? 2 : 0) +
    (next.duty_off_time ? 1 : 0) +
    ((next.layover_city != null && String(next.layover_city).trim()) ? 1 : 0);
  return nextScore > prevScore ? next : prev;
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
 * Group duties by trip (import + FLICA pairing id), sort by duty_date, map to one Classic row per duty day.
 */
export function buildClassicRowsFromDuties(
  duties: ScheduleDuty[],
  pairings: SchedulePairing[],
  pairingLegs: SchedulePairingLegLite[],
): ClassicScheduleRow[] {
  const byTrip = new Map<string, ScheduleDuty[]>();
  for (const d of duties) {
    const k = dutyPairKey(d);
    if (!byTrip.has(k)) byTrip.set(k, []);
    byTrip.get(k)!.push(d);
  }
  for (const list of byTrip.values()) {
    list.sort((a, b) => String(a.duty_date).localeCompare(String(b.duty_date)));
  }

  const uuidByTripKey = new Map<string, string>();
  for (const p of pairings) {
    if (!p?.id) continue;
    uuidByTripKey.set(`${p.import_id}|${p.pairing_id}`, p.id);
  }

  const rows: ClassicScheduleRow[] = [];

  for (const [, rawTripDuties] of byTrip) {
    const tripDuties = uniqDutiesByDutyDateAscending(rawTripDuties);
    if (!tripDuties.length) continue;

    const sample = tripDuties[0]!;
    const flicaPairingKey = String(sample.pairing_id).trim();
    const pairing = findPairing(sample, pairings);
    const pairingUuid =
      pairing?.id ??
      uuidByTripKey.get(dutyPairKey(sample)) ??
      '';

    const baseCity =
      (pairing?.base_code && String(pairing.base_code).trim()) ||
      (pairing as { baseAirport?: string } | undefined)?.baseAirport?.trim() ||
      'JFK';

    const n = tripDuties.length;
    const lastDutyIso = sliceDutyIso(tripDuties[n - 1]!.duty_date)!;

    const lastDutyRow = tripDuties[n - 1]!;

    let endIsoFromPairing = pairingEndDateIso(pairing);
    let endIsoFromLeg = syntheticEndIsoFromLegs(pairingLegs, lastDutyIso, pairingUuid);
    const endIsoFromMorningDutyOff = syntheticEndIsoFromMorningDutyOff(lastDutyRow, lastDutyIso);

    let syntheticArrivalIso: string | null = null;
    if (endIsoFromPairing != null && endIsoFromPairing > lastDutyIso) syntheticArrivalIso = endIsoFromPairing;
    if (endIsoFromLeg != null) {
      if (syntheticArrivalIso == null || endIsoFromLeg > syntheticArrivalIso) syntheticArrivalIso = endIsoFromLeg;
    }
    if (endIsoFromMorningDutyOff != null) {
      if (syntheticArrivalIso == null || endIsoFromMorningDutyOff > syntheticArrivalIso) {
        syntheticArrivalIso = endIsoFromMorningDutyOff;
      }
    }

    const needsSyntheticEnd = syntheticArrivalIso != null && syntheticArrivalIso > lastDutyIso;

    for (let i = 0; i < n; i++) {
      const duty = tripDuties[i]!;
      const dateIso = sliceDutyIso(duty.duty_date)!;
      const isFirst = i === 0;
      const isLastDutyIndex = i === n - 1;

      let rowType: RowType;
      if (needsSyntheticEnd) {
        rowType = isFirst ? 'TRIP_START' : 'TRIP_CONTINUATION';
      } else {
        rowType = isFirst ? 'TRIP_START' : isLastDutyIndex ? 'TRIP_END' : 'TRIP_CONTINUATION';
      }

      const lay =
        duty.layover_city != null && String(duty.layover_city).trim() ? String(duty.layover_city).trim() : null;

      const hasLay = lay != null;

      let cityText: string | null;
      /** TRIP_END (non-synthetic arrival day): show base; START/CONTINUATION use layover city or "-". */
      if (!needsSyntheticEnd && isLastDutyIndex) {
        cityText = baseCity;
      } else {
        cityText = hasLay ? lay : '-';
      }

      const pairingText = isFirst ? flicaPairingKey || null : null;
      const reportText = duty.report_time != null && String(duty.report_time).trim() ? duty.report_time : null;
      const dutyEndText =
        duty.duty_off_time != null && String(duty.duty_off_time).trim() ? duty.duty_off_time : null;
      const layoverRaw = duty.layover_time != null && String(duty.layover_time).trim() ? duty.layover_time : null;
      const layoverText = rowType === 'TRIP_START' ? layoverRaw : null;

      rows.push({
        dateIso,
        pairingText,
        reportText,
        cityText,
        dutyEndText,
        layoverText,
        rowType,
        sourcePairingId: flicaPairingKey,
      });
    }

    if (needsSyntheticEnd && syntheticArrivalIso) {
      rows.push({
        dateIso: syntheticArrivalIso,
        pairingText: null,
        reportText: null,
        cityText: baseCity,
        dutyEndText: null,
        layoverText: null,
        rowType: 'TRIP_END',
        sourcePairingId: flicaPairingKey,
      });
    }
  }

  return dedupeClassicRowsGlobally(rows);
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

  const { data: dutyRows, error: dErr } = await supabase
    .from('schedule_duties')
    .select('*')
    .eq('user_id', uid)
    .eq('import_id', latestImportId)
    .gte('duty_date', start)
    .lte('duty_date', end);

  if (dErr) throw dErr;
  const duties = (dutyRows ?? []) as ScheduleDuty[];
  if (duties.length === 0) {
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
  const pairings = (pRows ?? []) as SchedulePairing[];

  const pairingUuidList = pairings.map((p) => p.id).filter((x): x is string => Boolean(x && String(x).trim().length));
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

  return { duties, pairings, pairingLegs };
}
