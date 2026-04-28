/**
 * JetBlue FLICA guided import sessions — schedule_imports / images / issues.
 * Semantic source type for JetBlue monthly screenshots: `JETBLUE_FLICA_MONTHLY_SOURCE_TYPE` (see `jetblueFlicaUnderstanding.ts`).
 */

import { supabase } from '../../lib/supabaseClient';
import { extractLayoverRestFourDigits } from './scheduleTime';
import { tryInferFlightNumberFromLegRaw } from '../schedule-import/parser/jetblueFlicaStructuredParser';
import { JETBLUE_FLICA_MONTHLY_SOURCE_TYPE } from './jetblueFlicaUnderstanding';
import { JETBLUE_FLICA_TEMPLATE_KEY } from './jetblueFlicaTemplate';
import type { CrewScheduleLeg } from './types';
export { JETBLUE_FLICA_MONTHLY_SOURCE_TYPE };

export type ScheduleImportStatus = 'draft' | 'processing' | 'review' | 'partial' | 'saved' | 'failed';

export type ScheduleImportRow = {
  id: string;
  user_id: string;
  airline_code: string;
  crew_role: string;
  source_type: string;
  schedule_system: string;
  template_key: string;
  import_month: number;
  import_year: number;
  overall_confidence: number | null;
  status: ScheduleImportStatus;
  needs_review: boolean;
  raw_ocr_text: string | null;
  created_at: string;
  updated_at: string;
};

/** When true, row is a JetBlue FLICA monthly line-view import; use semantic source type for analytics / downstream. */
export function isJetBlueFlicaMonthlyScheduleImport(
  row: Pick<ScheduleImportRow, 'template_key' | 'schedule_system'>
): boolean {
  return row.schedule_system === 'FLICA' && row.template_key === JETBLUE_FLICA_TEMPLATE_KEY;
}

/** Stable string for JetBlue FLICA monthly screenshot imports (`raw_source_type` in specs; DB may still store `source_type` = screenshot). */
export function semanticScheduleSourceType(
  row: Pick<ScheduleImportRow, 'template_key' | 'schedule_system'>
): typeof JETBLUE_FLICA_MONTHLY_SOURCE_TYPE | 'screenshot' {
  return isJetBlueFlicaMonthlyScheduleImport(row) ? JETBLUE_FLICA_MONTHLY_SOURCE_TYPE : 'screenshot';
}

export type ScheduleImportImageRow = {
  id: string;
  import_id: string;
  storage_path: string;
  image_order: number;
  ocr_text: string | null;
  template_detected: boolean | null;
  image_confidence: number | null;
  width: number | null;
  height: number | null;
  legacy_batch_id: string | null;
  created_at: string;
};

export type ScheduleImportIssueRow = {
  id: string;
  import_id: string;
  pairing_id: string | null;
  issue_type: string;
  field_name: string | null;
  severity: string | null;
  message: string | null;
  resolution_status: string;
  created_at: string;
};

export async function createScheduleImport(params: {
  importMonth: number;
  importYear: number;
}): Promise<string> {
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('schedule_imports')
    .insert({
      user_id: u.user.id,
      airline_code: 'B6',
      crew_role: 'flight_attendant',
      source_type: 'screenshot',
      schedule_system: 'FLICA',
      template_key: 'jetblue_fa_flica_month_detail',
      import_month: params.importMonth,
      import_year: params.importYear,
      status: 'draft',
      needs_review: false,
    })
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('createScheduleImport failed');
  return data.id as string;
}

export async function fetchScheduleImport(importId: string): Promise<ScheduleImportRow | null> {
  const { data, error } = await supabase.from('schedule_imports').select('*').eq('id', importId).maybeSingle();
  if (error) throw error;
  return data as ScheduleImportRow | null;
}

export async function updateScheduleImport(
  importId: string,
  patch: Partial<
    Pick<
      ScheduleImportRow,
      | 'status'
      | 'needs_review'
      | 'overall_confidence'
      | 'raw_ocr_text'
    >
  >
): Promise<void> {
  const { error } = await supabase.from('schedule_imports').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', importId);
  if (error) throw error;
}

export async function insertScheduleImportImage(params: {
  importId: string;
  storagePath: string;
  imageOrder: number;
  legacyBatchId?: string | null;
  ocrText?: string | null;
  templateDetected?: boolean | null;
  imageConfidence?: number | null;
  width?: number | null;
  height?: number | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('schedule_import_images')
    .insert({
      import_id: params.importId,
      storage_path: params.storagePath,
      image_order: params.imageOrder,
      legacy_batch_id: params.legacyBatchId ?? null,
      ocr_text: params.ocrText ?? null,
      template_detected: params.templateDetected ?? null,
      image_confidence: params.imageConfidence ?? null,
      width: params.width ?? null,
      height: params.height ?? null,
    })
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('insertScheduleImportImage failed');
  return data.id as string;
}

export async function fetchScheduleImportImages(importId: string): Promise<ScheduleImportImageRow[]> {
  const { data, error } = await supabase
    .from('schedule_import_images')
    .select('*')
    .eq('import_id', importId)
    .order('image_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ScheduleImportImageRow[];
}

export async function fetchBatchesForScheduleImport(importId: string): Promise<{ id: string }[]> {
  const { data, error } = await supabase
    .from('schedule_import_batches')
    .select('id')
    .eq('schedule_import_id', importId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as { id: string }[];
}

export type SchedulePairingRow = {
  id: string;
  schedule_import_id: string | null;
  pairing_id: string;
  operate_start_date: string | null;
  operate_end_date: string | null;
  report_time_local: string | null;
  base_code: string | null;
  equipment_code: string | null;
  trip_rig: string | null;
  pairing_total_tafb: number | null;
  pairing_total_block: number | null;
  pairing_total_credit: number | null;
  pairing_confidence: number | null;
  needs_review: boolean | null;
  pairing_requires_review: boolean;
  raw_text: string | null;
  normalized_json?: Record<string, unknown> | null;
};

/** Parse YYYY-MM-DD start for chronological sort; missing/invalid dates sort last. */
function operateStartSortKey(iso: string | null | undefined): number {
  const s = (iso ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
  }
  return Number.MAX_SAFE_INTEGER;
}

/** Earliest trip start first — import review, JetBlue review, and batch helpers. */
export function sortPairingsByOperateStartDate(pairings: SchedulePairingRow[]): SchedulePairingRow[] {
  return [...pairings].sort((a, b) => {
    const da = operateStartSortKey(a.operate_start_date);
    const db = operateStartSortKey(b.operate_start_date);
    if (da !== db) return da - db;
    return (a.pairing_id ?? '').localeCompare(b.pairing_id ?? '', undefined, { sensitivity: 'base', numeric: true });
  });
}

/** View `schedule_pairing_duties` — leg rows under a pairing (pairing_row_id = schedule_pairings.id). */
export type SchedulePairingDutyRow = {
  id: string;
  pairing_row_id: string;
  duty_date: string | null;
  flight_number: string | null;
  from_airport: string | null;
  to_airport: string | null;
  departure_time_local: string | null;
  arrival_time_local: string | null;
  /** Block duration display (HH:MM), from `normalized_json` or derived from `block_time`. */
  block_time_local: string | null;
  layover_city: string | null;
  hotel_name: string | null;
  release_time_local: string | null;
  is_deadhead?: boolean | null;
  /** Equipment / aircraft position from parser (E190, 32N, …). */
  equipment_code?: string | null;
  /** Layover rest duration display (duty-day metadata on last leg). */
  layover_rest_display?: string | null;
  /** From FLICA D-END row `REPT:` — next report (Crewline REPORT on the following duty day). */
  flica_rept_local?: string | null;
  /** From FLICA `D-END:` line (same row as REPT), if also in `normalized_json`. */
  flica_d_end_local?: string | null;
  /** Parsed duty-day bundle (JSON) for D-END / layover context. */
  duty_day?: Record<string, unknown> | null;
  /** FLICA `DPS-ARS` string from `normalized_json.flica_route` — preferred for apply-row city. */
  flica_route?: string | null;
  row_confidence: number | null;
  requires_review: boolean;
  raw_text: string | null;
  /** From `schedule_pairing_legs.normalized_json` — screenshot table reconstruction + FLTNO candidates. */
  parser_leg_meta?: {
    candidate_flight_numbers?: string[];
    reconstructed_row_text?: string;
    fltno_suggestion_source?: string;
    fltno_row_confidence?: number | null;
  } | null;
};

export function buildRouteSummaryFromDuties(
  legs: Pick<SchedulePairingDutyRow, 'from_airport' | 'to_airport'>[]
): string {
  if (!legs.length) return '—';
  const seq: string[] = [];
  for (const l of legs) {
    const a = (l.from_airport ?? '').trim().toUpperCase();
    const b = (l.to_airport ?? '').trim().toUpperCase();
    if (a && b) {
      seq.push(a, b);
    }
  }
  if (seq.length < 2) return '—';
  const collapsed: string[] = [];
  for (const s of seq) {
    if (collapsed.length === 0 || collapsed[collapsed.length - 1] !== s) collapsed.push(s);
  }
  return collapsed.join('-');
}

function collapseConsecutiveDuplicateStations(stations: string[]): string[] {
  const out: string[] = [];
  for (const s of stations) {
    if (out.length === 0 || out[out.length - 1] !== s) out.push(s);
  }
  return out;
}

/**
 * Aviation-style **compact** trip line: layover pattern + return base — not a full leg-by-leg chain.
 *
 * - When **multiple duty dates** are present on all legs: one station per duty day = last arrival
 *   of that day (overnight / release city before the next duty day).
 * - Otherwise (single duty day or missing dates): strip implied **base** from the front of the
 *   collapsed station chain, then space-separate (same-day multi-segment trips).
 *
 * Does **not** include arrows; use {@link buildRouteSummaryFromDuties} + arrows only in expanded detail.
 */
export function formatTripCompactShorthand(
  legs: Pick<SchedulePairingDutyRow, 'from_airport' | 'to_airport' | 'duty_date'>[],
  baseCode: string | null | undefined
): string {
  if (!legs.length) return '—';
  const base = (baseCode ?? '').trim().toUpperCase();

  const isoDateOk = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());

  const dated = legs.filter((l) => isoDateOk(l.duty_date));
  const uniqueDates = [...new Set(dated.map((l) => (l.duty_date as string).trim()))].sort();

  if (dated.length === legs.length && uniqueDates.length >= 2) {
    const points: string[] = [];
    for (const d of uniqueDates) {
      const dayLegs = legs.filter((l) => (l.duty_date ?? '').trim() === d);
      if (!dayLegs.length) continue;
      const last = dayLegs[dayLegs.length - 1];
      const to = (last.to_airport ?? '').trim().toUpperCase();
      if (to) points.push(to);
    }
    const deduped = collapseConsecutiveDuplicateStations(points);
    return deduped.length ? deduped.join(' ') : '—';
  }

  const dash = buildRouteSummaryFromDuties(legs);
  if (dash === '—') return '—';
  const chain = dash.split('-').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!chain.length) return '—';
  let start = 0;
  if (base && chain[0] === base) start = 1;
  else if (!base && chain.length >= 3 && chain[0] === chain[chain.length - 1]) {
    start = 1;
  }
  const slice = chain.slice(start);
  if (!slice.length) return base || chain[0] || '—';
  return slice.join(' ');
}

/** Compact display from a stored dash chain (e.g. parser `routeSummary`) when leg rows are unavailable. */
export function formatTripCompactFromDashChain(
  dashChain: string | null | undefined,
  baseCode: string | null | undefined
): string {
  const base = (baseCode ?? '').trim().toUpperCase();
  const raw = (dashChain ?? '').trim();
  if (!raw || raw === '—') return '—';
  const normalized = raw.replace(/\s*→\s*/g, '-').replace(/→/g, '-').trim();
  const parts = normalized.split('-').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (parts.length < 2) return '—';
  let start = 0;
  if (base && parts[0] === base) start = 1;
  else if (!base && parts.length >= 3 && parts[0] === parts[parts.length - 1]) start = 1;
  const slice = parts.slice(start);
  if (!slice.length) return base || parts[0] || '—';
  return slice.join(' ');
}

/**
 * Classic list / apply rows: `schedule_entries.layover` stores the FLICA layover **time** token only
 * (4-digit), not station codes — city lives in `city`. Values from parser `layoverRestDisplay`.
 */
export function buildLayoverSummaryFromDuties(
  legs: Pick<SchedulePairingDutyRow, 'layover_rest_display' | 'layover_city' | 'raw_text'>[]
): string | null {
  for (const l of legs) {
    const r = (l.layover_rest_display ?? '').trim();
    let x = extractLayoverRestFourDigits(r);
    if (x) return x;
    const withCity = `${(l.layover_city ?? '').trim()} ${r}`.trim();
    x = extractLayoverRestFourDigits(withCity);
    if (x) return x;
    if (l.raw_text) {
      x = extractLayoverRestFourDigits(String(l.raw_text));
      if (x) return x;
    }
  }
  return null;
}

export async function fetchPairingsForScheduleImport(importId: string): Promise<SchedulePairingRow[]> {
  const { data, error } = await supabase
    .from('schedule_pairings')
    .select('*')
    .eq('schedule_import_id', importId);

  if (error) throw error;
  return sortPairingsByOperateStartDate((data ?? []) as SchedulePairingRow[]);
}

/** Pairings stored against a generic `schedule_import_batches` row (no guided session). */
export async function fetchPairingsForBatch(batchId: string): Promise<SchedulePairingRow[]> {
  const { data, error } = await supabase.from('schedule_pairings').select('*').eq('import_id', batchId);

  if (error) throw error;
  return sortPairingsByOperateStartDate((data ?? []) as SchedulePairingRow[]);
}

export async function fetchPairingById(pairingUuid: string): Promise<SchedulePairingRow | null> {
  const { data, error } = await supabase.from('schedule_pairings').select('*').eq('id', pairingUuid).maybeSingle();
  if (error) throw error;
  return data as SchedulePairingRow | null;
}

/** Normalize known OCR slips when reading legs (keeps UI/validation aligned without requiring re-import). */
function coerceLegAirportCode(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim().toUpperCase();
  if (!t) return null;
  if (t === 'JHR') return 'LHR';
  if (t === 'JAS') return 'LAS';
  return t;
}

/** Maps a `schedule_pairing_legs` row to the duty DTO (also used by canonical pairing-day builder). */
export function mapLegRowToDuty(l: Record<string, unknown>): SchedulePairingDutyRow {
  const nj = l.normalized_json as {
    segment_confidence?: number;
    block_time_local?: string;
    duty_day?: Record<string, unknown>;
    reconstructed_row_text?: string;
    candidate_flight_numbers?: unknown;
    fltno_suggestion_source?: string;
    fltno_row_confidence?: number | null;
    flica_route?: string;
    layover_rest_display?: string;
    flica_rept_local?: string;
    flica_d_end_local?: string;
  } | null | undefined;
  const dd = nj?.duty_day;
  const blockNum = l.block_time as number | null | undefined;
  let blockLocal = nj?.block_time_local ?? null;
  if (!blockLocal && blockNum != null && Number.isFinite(blockNum)) {
    const h = Math.floor(blockNum);
    const m = Math.round((blockNum - h) * 60);
    blockLocal = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const equip = (l.aircraft_position_code as string) ?? null;
  const rawNj = typeof nj?.layover_rest_display === 'string' ? nj.layover_rest_display.trim() : '';
  const rawDd = typeof dd?.layover_rest_display === 'string' ? String(dd.layover_rest_display).trim() : '';
  const rawLay = rawNj || rawDd;
  const layRest =
    extractLayoverRestFourDigits(rawLay) || (/^\d{4}$/.test(rawLay) ? rawLay : null);
  const fr = typeof nj?.flica_rept_local === 'string' ? nj.flica_rept_local.replace(/\D/g, '').slice(0, 4) : '';
  const fd = typeof nj?.flica_d_end_local === 'string' ? nj.flica_d_end_local.replace(/\D/g, '').slice(0, 4) : '';
  const flicaRept = /^\d{3,4}$/.test(fr) ? fr : null;
  const flicaDend = /^\d{3,4}$/.test(fd) ? fd : null;
  const fromA = coerceLegAirportCode(l.departure_station as string | null | undefined);
  const toA = coerceLegAirportCode(l.arrival_station as string | null | undefined);
  const depL = (l.scheduled_departure_local as string) ?? null;
  const arrL = (l.scheduled_arrival_local as string) ?? null;
  let flightNum = ((l.flight_number as string) ?? '').trim() || null;
  if (!flightNum) {
    const inferred = tryInferFlightNumberFromLegRaw(l.raw_text as string | null | undefined, fromA, toA, depL, arrL);
    if (inferred) flightNum = inferred;
  }
  return {
    id: l.id as string,
    pairing_row_id: l.pairing_id as string,
    duty_date: (l.duty_date as string) ?? null,
    flight_number: flightNum,
    from_airport: fromA,
    to_airport: toA,
    departure_time_local: depL,
    arrival_time_local: arrL,
    block_time_local: blockLocal,
    layover_city: coerceLegAirportCode(l.layover_city as string | null | undefined),
    hotel_name: (l.hotel_name as string) ?? null,
    release_time_local: ((l.release_time_local ?? l.release_time) as string) ?? null,
    is_deadhead: (l.is_deadhead as boolean | null | undefined) ?? null,
    equipment_code: equip,
    layover_rest_display: layRest ?? null,
    flica_rept_local: flicaRept,
    flica_d_end_local: flicaDend,
    flica_route: typeof nj?.flica_route === 'string' && nj.flica_route.trim() ? nj.flica_route.trim() : null,
    duty_day: dd ?? null,
    row_confidence: (l.row_confidence as number) ?? nj?.segment_confidence ?? null,
    requires_review: Boolean(l.requires_review),
    raw_text: (l.raw_text as string) ?? null,
    parser_leg_meta: nj
      ? {
          candidate_flight_numbers: Array.isArray(nj.candidate_flight_numbers)
            ? (nj.candidate_flight_numbers as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            : undefined,
          reconstructed_row_text:
            typeof nj.reconstructed_row_text === 'string' && nj.reconstructed_row_text.trim()
              ? nj.reconstructed_row_text.trim()
              : undefined,
          fltno_suggestion_source:
            typeof nj.fltno_suggestion_source === 'string' ? nj.fltno_suggestion_source : undefined,
          fltno_row_confidence: nj.fltno_row_confidence ?? null,
        }
      : null,
  };
}

function formatDutyTimeForUi(t: string | null | undefined): string | undefined {
  if (t == null || !String(t).trim()) return undefined;
  const s = String(t).trim();
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  return s;
}

/**
 * Flattens stored pairing duties into {@link CrewScheduleLeg} (trip detail, quick preview, trackers).
 * Uses the same `schedule_pairing_legs` fields as the canonical pairing-day model — no import-path changes.
 */
export function dutiesToCrewScheduleLegs(
  duties: SchedulePairingDutyRow[],
  tripGroupId: string,
  _baseCode: string = 'JFK',
): CrewScheduleLeg[] {
  return duties.map((d, i) => ({
    id: d.id && String(d.id).length > 0 ? String(d.id) : `${tripGroupId}-duty-${i}`,
    scheduleEntryId: undefined,
    dutyDate: d.duty_date ?? undefined,
    departureAirport: (d.from_airport ?? '').trim() || '—',
    arrivalAirport: (d.to_airport ?? '').trim() || '—',
    reportLocal: undefined,
    departLocal: formatDutyTimeForUi(d.departure_time_local),
    arriveLocal: formatDutyTimeForUi(d.arrival_time_local),
    releaseLocal: d.release_time_local ?? undefined,
    isDeadhead: d.is_deadhead === true,
    flightNumber: d.flight_number ?? undefined,
    blockTimeLocal: d.block_time_local ?? undefined,
    equipmentCode: d.equipment_code ?? undefined,
  }));
}

/** Duty rows for a pairing (table `schedule_pairing_legs`). */
export async function fetchDutiesForPairing(pairingUuid: string): Promise<SchedulePairingDutyRow[]> {
  const { data, error } = await supabase
    .from('schedule_pairing_legs')
    .select('*')
    .eq('pairing_id', pairingUuid)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => mapLegRowToDuty(row as Record<string, unknown>));
}

/** All legs for many pairings (e.g. batch validation). Grouped by `schedule_pairings.id`. */
export async function fetchDutiesGroupedByPairingIds(
  pairingUuids: string[]
): Promise<Map<string, SchedulePairingDutyRow[]>> {
  const out = new Map<string, SchedulePairingDutyRow[]>();
  if (!pairingUuids.length) return out;
  const { data, error } = await supabase
    .from('schedule_pairing_legs')
    .select('*')
    .in('pairing_id', pairingUuids)
    .order('pairing_id', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  for (const row of data ?? []) {
    const duty = mapLegRowToDuty(row as Record<string, unknown>);
    const pid = duty.pairing_row_id;
    const arr = out.get(pid) ?? [];
    arr.push(duty);
    out.set(pid, arr);
  }
  return out;
}

export async function updateSchedulePairing(
  pairingUuid: string,
  patch: Partial<
    Pick<
      SchedulePairingRow,
      | 'operate_start_date'
      | 'operate_end_date'
      | 'report_time_local'
      | 'base_code'
      | 'equipment_code'
      | 'pairing_id'
      | 'needs_review'
      | 'pairing_confidence'
    >
  >
): Promise<void> {
  const { error } = await supabase
    .from('schedule_pairings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', pairingUuid);
  if (error) throw error;
}

export async function updateSchedulePairingLeg(
  legId: string,
  patch: Partial<{
    duty_date: string | null;
    flight_number: string | null;
    departure_station: string | null;
    arrival_station: string | null;
    scheduled_departure_local: string | null;
    scheduled_arrival_local: string | null;
    block_time: number | null;
    layover_city: string | null;
    release_time_local: string | null;
    is_deadhead: boolean;
    aircraft_position_code: string | null;
    raw_text: string | null;
    requires_review: boolean;
    normalized_json: Record<string, unknown>;
  }>
): Promise<void> {
  const { normalized_json: njIn, ...rest } = patch;
  let mergedNj: Record<string, unknown> | undefined;
  if (njIn !== undefined) {
    const { data: row } = await supabase
      .from('schedule_pairing_legs')
      .select('normalized_json')
      .eq('id', legId)
      .maybeSingle();
    const prev = (row?.normalized_json as Record<string, unknown> | null) ?? {};
    mergedNj = { ...prev, ...njIn };
  }
  const { error } = await supabase
    .from('schedule_pairing_legs')
    .update({
      ...rest,
      ...(mergedNj !== undefined ? { normalized_json: mergedNj } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', legId);
  if (error) throw error;
}

export async function fetchScheduleImportIssues(importId: string): Promise<ScheduleImportIssueRow[]> {
  const { data, error } = await supabase.from('schedule_import_issues').select('*').eq('import_id', importId);
  if (error) throw error;
  return (data ?? []) as ScheduleImportIssueRow[];
}

export async function updateScheduleImportImage(
  imageId: string,
  patch: Partial<Pick<ScheduleImportImageRow, 'ocr_text' | 'template_detected' | 'image_confidence' | 'legacy_batch_id'>>
): Promise<void> {
  const { error } = await supabase
    .from('schedule_import_images')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', imageId);
  if (error) throw error;
}

export async function createScheduleImportIssue(params: {
  importId: string;
  pairingId?: string | null;
  issueType: string;
  fieldName?: string | null;
  severity?: string | null;
  message: string;
}): Promise<void> {
  const { error } = await supabase.from('schedule_import_issues').insert({
    import_id: params.importId,
    pairing_id: params.pairingId ?? null,
    issue_type: params.issueType,
    field_name: params.fieldName ?? null,
    severity: params.severity ?? 'medium',
    message: params.message,
    resolution_status: 'open',
  });
  if (error) throw error;
}
