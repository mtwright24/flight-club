import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../../lib/supabaseClient';
import type { CrewScheduleTrip, ScheduleCrewMember, ScheduleMonthMetrics } from './types';
import {
  buildLayoverSummaryFromDuties,
  mapLegRowToDuty,
  fetchDutiesForPairing,
  fetchPairingsForBatch,
  type SchedulePairingDutyRow,
} from './jetblueFlicaImport';
import {
  fetchScheduleDutiesAndPairingsForMonth,
  buildClassicRowsFromDuties,
  type ClassicScheduleRow,
  type ScheduleDuty as NormScheduleDuty,
  type SchedulePairing as NormSchedulePairing,
  type SchedulePairingLegLite,
} from './buildClassicRows';
import { buildCrewScheduleTripsFromNormalizedPack } from './tripMapper';
import { isFlicaNonFlyingActivityId } from '../../services/flicaScheduleHtmlParser';

export type ScheduleEntryRow = {
  id: string;
  user_id: string;
  trip_group_id: string;
  month_key: string;
  date: string;
  day_of_week: string | null;
  pairing_code: string | null;
  report_time: string | null;
  city: string | null;
  d_end_time: string | null;
  layover: string | null;
  /** FLICA DEPL — departure local (HHMM). */
  depart_local: string | null;
  /** FLICA ARRL — arrival local (HHMM). */
  arrive_local: string | null;
  wx: string | null;
  status_code: string | null;
  notes: string | null;
  source_type: string | null;
  source_batch_id: string | null;
  is_user_confirmed: boolean;
};

export type ScheduleImportBatchRow = {
  id: string;
  user_id: string;
  month_key: string | null;
  selected_month_key?: string | null;
  detected_month_key?: string | null;
  source_type: string | null;
  source_file_path: string | null;
  source_file_url: string | null;
  raw_extracted_text: string | null;
  parse_status: string;
  row_count: number;
  warning_count: number;
  parse_error: string | null;
  airline_guess_id?: string | null;
  role_guess_id?: string | null;
  software_guess_id?: string | null;
  view_guess_id?: string | null;
  applied_template_id?: string | null;
  classification_json?: Record<string, unknown> | null;
  classification_confidence?: number | null;
  /** JetBlue FLICA guided import session (optional). */
  schedule_import_id?: string | null;
  created_at: string;
};

export type ScheduleImportCandidateRow = {
  id: string;
  batch_id: string;
  month_key?: string | null;
  date: string | null;
  day_of_week: string | null;
  pairing_code: string | null;
  report_time: string | null;
  city: string | null;
  d_end_time: string | null;
  layover: string | null;
  depart_local: string | null;
  arrive_local: string | null;
  wx: string | null;
  status_code: string | null;
  notes: string | null;
  confidence_score: number | null;
  warning_flag: boolean;
  warning_reason?: string | null;
  ignored_flag?: boolean;
  ignored_reason?: string | null;
  edited_by_user?: boolean;
  raw_row_text: string | null;
};

/** JetBlue FLICA HTML import snapshot (`crew_schedule` table). */
export type CrewScheduleFlicaRow = {
  id: string;
  month_key: string;
  pairings: unknown;
  stats: unknown;
  raw_html: string | null;
  imported_at: string;
};

export async function fetchCrewScheduleFlicaForMonth(
  year: number,
  month: number,
  airline: string = 'jetblue'
): Promise<CrewScheduleFlicaRow | null> {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return null;

  const { data, error } = await supabase
    .from('crew_schedule')
    .select('id,month_key,pairings,stats,raw_html,imported_at')
    .eq('user_id', userData.user.id)
    .eq('airline', airline)
    .eq('month_key', monthKey)
    .maybeSingle();

  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('does not exist') || msg.includes('schema cache')) return null;
    throw error;
  }
  return (data ?? null) as CrewScheduleFlicaRow | null;
}

export async function fetchScheduleEntriesForMonth(
  year: number,
  month: number
): Promise<ScheduleEntryRow[]> {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('schedule_entries')
    .select(
      'id,user_id,trip_group_id,month_key,date,day_of_week,pairing_code,report_time,city,d_end_time,layover,depart_local,arrive_local,wx,status_code,notes,source_type,source_batch_id,is_user_confirmed'
    )
    .eq('month_key', monthKey)
    .order('date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ScheduleEntryRow[];
}

/**
 * Union `month_key` and calendar-`date` month fetches (same columns). Leg-date rows win on `id` so
 * mis-keyed imports still load in Classic without changing the import RPC.
 */
export function mergeScheduleEntriesLegDatePreferring(
  monthKeyRows: ScheduleEntryRow[],
  legDateRows: ScheduleEntryRow[],
): ScheduleEntryRow[] {
  const map = new Map<string, ScheduleEntryRow>();
  for (const r of legDateRows) map.set(r.id, r);
  for (const r of monthKeyRows) {
    if (!map.has(r.id)) map.set(r.id, r);
  }
  return [...map.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export async function fetchTripGroupEntries(tripGroupId: string): Promise<ScheduleEntryRow[]> {
  const { data, error } = await supabase
    .from('schedule_entries')
    .select(
      'id,user_id,trip_group_id,month_key,date,day_of_week,pairing_code,report_time,city,d_end_time,layover,depart_local,arrive_local,wx,status_code,notes,source_type,source_batch_id,is_user_confirmed'
    )
    .eq('trip_group_id', tripGroupId)
    .order('date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ScheduleEntryRow[];
}

/**
 * Resolves `schedule_pairing_legs` rows for a trip’s schedule apply batch + pairing id (read-only; does not
 * run import/FLICA fetch). When present, trip detail should prefer these for per-leg flight numbers and times.
 */
export async function fetchPairingDutiesForScheduleEntries(
  rows: ScheduleEntryRow[],
): Promise<SchedulePairingDutyRow[] | null> {
  if (!rows.length) return null;
  const batchId = rows.find((r) => r.source_batch_id)?.source_batch_id ?? null;
  if (!batchId) return null;
  const code = rows
    .map((r) => String(r.pairing_code ?? '').trim())
    .find((p) => {
      const u = p.toUpperCase();
      return u && u !== 'CONT' && u !== '—' && !isFlicaNonFlyingActivityId(u);
    });
  if (!code) return null;
  const norm = code.toUpperCase();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return null;

  const { data: pList, error: pErr } = await supabase
    .from('schedule_pairings')
    .select('id, pairing_id')
    .eq('user_id', userData.user.id)
    .eq('import_id', batchId);
  if (pErr) return null;
  const match = (pList ?? []).find((p) => String(p.pairing_id ?? '').trim().toUpperCase() === norm);
  if (!match?.id) return null;

  const { data: legRows, error: lErr } = await supabase
    .from('schedule_pairing_legs')
    .select('*')
    .eq('pairing_id', match.id)
    .order('created_at', { ascending: true });
  if (lErr || !legRows?.length) return null;

  return (legRows as Record<string, unknown>[]).map((row) => mapLegRowToDuty(row));
}

export async function createImportBatch(params: {
  monthKey: string;
  sourceType: 'screenshot' | 'photo' | 'pdf' | 'document_scan';
  sourceFilePath: string;
  sourceFileUrl?: string | null;
  /** JetBlue FLICA guided import session (optional). */
  scheduleImportId?: string | null;
}): Promise<string> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('schedule_import_batches')
    .insert({
      user_id: userData.user.id,
      month_key: params.monthKey,
      source_type: params.sourceType,
      source_file_path: params.sourceFilePath,
      source_file_url: params.sourceFileUrl ?? null,
      parse_status: 'uploaded',
      ...(params.scheduleImportId ? { schedule_import_id: params.scheduleImportId } : {}),
    })
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('Insert failed');
  return data.id as string;
}

export async function invokeImportScheduleOcr(batchId: string): Promise<{
  row_count: number;
  warning_count: number;
  pdf_weak?: boolean;
  jetblue_flica_skip_generic_candidates?: boolean;
  parser_key?: string;
  /** From Edge OCR pipeline — compare to client upload bytes and to `fetchImportBatch().raw_extracted_text` length */
  raw_extracted_text_len?: number;
  storage_download_bytes?: number;
  ocr_handoff_reason_code?: string | null;
  batch_update_error?: string | null;
  ocr_reason_code?: string;
  batch_update_used_core_fallback?: boolean;
  batch_update_extended_skipped?: boolean;
}> {
  // Use explicit fetch + apikey + user JWT. supabase.functions.invoke uses the client fetch wrapper;
  // in some RN setups the user Bearer token may not reach the Edge Function (401 before your code runs).
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    await supabase.auth.refreshSession();
    ({
      data: { session },
    } = await supabase.auth.getSession());
  }
  console.warn('[schedule-import] invokeImportScheduleOcr', {
    batchId,
    accessTokenPresent: !!session?.access_token,
    urlHost: new URL(SUPABASE_URL).host,
  });
  if (!session?.access_token) {
    throw new Error('No active session/access token. Sign out, sign in again, then retry import.');
  }

  const url = `${SUPABASE_URL}/functions/v1/import-schedule-ocr`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ batch_id: batchId }),
  });

  const text = await res.text();
  console.warn('[schedule-import] Edge Function response', {
    status: res.status,
    ok: res.ok,
    bodyPreview: text.slice(0, 500),
    bodyLength: text.length,
  });
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Edge Function returned non-JSON (${res.status}): ${text.slice(0, 400)}`);
  }

  if (!res.ok) {
    const body = typeof text === 'string' ? text.slice(0, 1200) : '';
    throw new Error(`Edge Function HTTP ${res.status}${body ? `\n${body}` : ''}`);
  }

  const d = parsed as {
    ok?: boolean;
    error?: string;
    row_count?: number;
    warning_count?: number;
    pdf_weak?: boolean;
    jetblue_flica_skip_generic_candidates?: boolean;
    parser_key?: string;
    raw_extracted_text_len?: number;
    storage_download_bytes?: number;
    ocr_handoff_reason_code?: string | null;
    batch_update_error?: string | null;
    ocr_reason_code?: string;
    batch_update_used_core_fallback?: boolean;
    batch_update_extended_skipped?: boolean;
  };
  if (d?.error) throw new Error(d.error);
  return {
    row_count: d.row_count ?? 0,
    warning_count: d.warning_count ?? 0,
    pdf_weak: d.pdf_weak,
    jetblue_flica_skip_generic_candidates: d.jetblue_flica_skip_generic_candidates,
    parser_key: d.parser_key,
    raw_extracted_text_len: d.raw_extracted_text_len,
    storage_download_bytes: d.storage_download_bytes,
    ocr_handoff_reason_code: d.ocr_handoff_reason_code,
    batch_update_error: d.batch_update_error,
    ocr_reason_code: d.ocr_reason_code,
    batch_update_used_core_fallback: d.batch_update_used_core_fallback,
    batch_update_extended_skipped: d.batch_update_extended_skipped,
  };
}

export async function fetchImportBatch(batchId: string): Promise<ScheduleImportBatchRow | null> {
  const { data, error } = await supabase.from('schedule_import_batches').select('*').eq('id', batchId).maybeSingle();
  if (error) throw error;
  return data as ScheduleImportBatchRow | null;
}

export async function fetchCandidatesForBatch(batchId: string): Promise<ScheduleImportCandidateRow[]> {
  const { data, error } = await supabase
    .from('schedule_import_candidates')
    .select('*')
    .eq('batch_id', batchId)
    .order('date', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ScheduleImportCandidateRow[];
}

export async function updateImportCandidate(
  id: string,
  patch: Partial<
    Pick<
      ScheduleImportCandidateRow,
      | 'date'
      | 'day_of_week'
      | 'pairing_code'
      | 'report_time'
      | 'city'
      | 'd_end_time'
      | 'layover'
      | 'depart_local'
      | 'arrive_local'
      | 'wx'
      | 'status_code'
      | 'notes'
      | 'confidence_score'
      | 'warning_flag'
      | 'ignored_flag'
    >
  >
): Promise<void> {
  const { error } = await supabase.from('schedule_import_candidates').update(patch).eq('id', id);
  if (error) throw error;
}

/** User-facing buckets for import review (no UNK/BLANK jargon in UI). */
export type UserReviewCategory = 'looks_good' | 'needs_review' | 'skipped';

function bucketForCandidate(c: ScheduleImportCandidateRow): 'junk' | 'unknown' | 'ready' | 'review' {
  const st = (c.status_code ?? '').toUpperCase();
  if (c.ignored_flag || st === 'BLANK') return 'junk';
  if (st === 'UNK') return 'unknown';
  if (!c.warning_flag && (c.confidence_score ?? 0) >= 0.65) return 'ready';
  return 'review';
}

/**
 * Maps parser state to review UI: Looks Good (high confidence), Needs Review, Skipped (noise/blank).
 */
export function reviewCategoryForCandidate(c: ScheduleImportCandidateRow): UserReviewCategory {
  const st = (c.status_code ?? '').toUpperCase();
  if (c.ignored_flag || st === 'BLANK') return 'skipped';
  if (st === 'UNK') return 'needs_review';
  if (c.warning_flag) return 'needs_review';
  const conf = c.confidence_score ?? 0;
  if (conf < 0.85) return 'needs_review';
  const b = bucketForCandidate(c);
  if (b === 'junk') return 'skipped';
  if (b === 'unknown' || b === 'review') return 'needs_review';
  if (b === 'ready' && conf >= 0.85) return 'looks_good';
  return 'needs_review';
}

/** Rows eligible for “Save confirmed” — same apply rules, but only Looks Good category. */
export function candidatesToConfirmedApplyRows(candidates: ScheduleImportCandidateRow[]): ApplyRow[] {
  return candidatesToApplyRows(candidates.filter((c) => reviewCategoryForCandidate(c) === 'looks_good'));
}

export type ApplyRow = {
  date: string;
  day_of_week?: string | null;
  pairing_code?: string | null;
  report_time?: string | null;
  city?: string | null;
  d_end_time?: string | null;
  layover?: string | null;
  depart_local?: string | null;
  arrive_local?: string | null;
  wx?: string | null;
  status_code?: string | null;
  notes?: string | null;
  source_type?: string | null;
};

export async function applyReplaceMonth(monthKey: string, batchId: string, rows: ApplyRow[]): Promise<number> {
  const { data, error } = await supabase.rpc('schedule_import_replace_month', {
    p_month_key: monthKey,
    p_batch_id: batchId,
    p_rows: rows,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function applyMergeMonth(monthKey: string, batchId: string, rows: ApplyRow[]): Promise<number> {
  const { data, error } = await supabase.rpc('schedule_import_merge_month', {
    p_month_key: monthKey,
    p_batch_id: batchId,
    p_rows: rows,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

/**
 * Removes all calendar data for a month, import-derived month totals, orphaned pairing metadata,
 * and deletes import batches tagged with that month (pairing data and OCR rows cascade with batches).
 */
export async function removeMonthScheduleAndImports(monthKey: string): Promise<{
  entriesRemoved: number;
  batchesRemoved: number;
}> {
  const mk = monthKey.trim();
  if (!/^\d{4}-\d{2}$/.test(mk)) {
    throw new Error('Invalid month key (expected YYYY-MM).');
  }

  const { data: beforeRows, error: eBefore } = await supabase
    .from('schedule_entries')
    .select('trip_group_id')
    .eq('month_key', mk);
  if (eBefore) throw eBefore;
  const tripGroups = [...new Set((beforeRows ?? []).map((r) => r.trip_group_id as string))];

  const { data: deletedEntries, error: eDel } = await supabase
    .from('schedule_entries')
    .delete()
    .eq('month_key', mk)
    .select('id');
  if (eDel) throw eDel;
  const entriesRemoved = deletedEntries?.length ?? 0;

  for (const tg of tripGroups) {
    const { count, error: ec } = await supabase
      .from('schedule_entries')
      .select('id', { count: 'exact', head: true })
      .eq('trip_group_id', tg);
    if (ec) throw ec;
    if ((count ?? 0) === 0) {
      const { error: emd } = await supabase.from('schedule_trip_metadata').delete().eq('trip_group_id', tg);
      if (emd) throw emd;
    }
  }

  const { error: eMm } = await supabase.from('schedule_month_metrics').delete().eq('month_key', mk);
  if (eMm) throw eMm;

  const { data: batchRows, error: eB } = await supabase
    .from('schedule_import_batches')
    .select('id')
    .eq('month_key', mk);
  if (eB) throw eB;
  const batchIds = (batchRows ?? []).map((b) => b.id as string);

  if (batchIds.length) {
    const { error: eBatchDel } = await supabase.from('schedule_import_batches').delete().in('id', batchIds);
    if (eBatchDel) throw eBatchDel;
  }

  return { entriesRemoved, batchesRemoved: batchIds.length };
}

/** Every distinct `YYYY-MM` the user has calendar entries or import batches under (typically the three‑month snapshot). */
export async function distinctUserScheduleMonthKeys(): Promise<string[]> {
  const { data: au, error: ae } = await supabase.auth.getUser();
  if (ae || !au.user) throw new Error('Not signed in');
  const uid = au.user.id;

  const [{ data: b }, { data: e }, { data: m }] = await Promise.all([
    supabase.from('schedule_import_batches').select('month_key').eq('user_id', uid),
    supabase.from('schedule_entries').select('month_key').eq('user_id', uid),
    supabase.from('schedule_month_metrics').select('month_key').eq('user_id', uid),
  ]);

  const set = new Set<string>();
  for (const rows of [b ?? [], e ?? [], m ?? []]) {
    for (const r of rows) {
      const mk = typeof (r as { month_key?: string | null }).month_key === 'string'
        ? String((r as { month_key: string }).month_key).trim().slice(0, 7)
        : '';
      if (/^\d{4}-\d{2}$/.test(mk)) set.add(mk);
    }
  }
  return [...set].sort();
}

/** Removes imports and calendar rows for **all** months in storage — one-shot “clear my schedule snapshot”. */
export async function removeAllImportedSchedules(): Promise<{
  entriesRemoved: number;
  batchesRemoved: number;
  monthsCleared: number;
}> {
  const keys = await distinctUserScheduleMonthKeys();
  let entriesRemoved = 0;
  let batchesRemoved = 0;
  for (const mk of keys) {
    const r = await removeMonthScheduleAndImports(mk);
    entriesRemoved += r.entriesRemoved;
    batchesRemoved += r.batchesRemoved;
  }
  return { entriesRemoved, batchesRemoved, monthsCleared: keys.length };
}

const DOW3 = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function isoToDowThreeLetter(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return DOW3[d.getDay()];
}

function digitsTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length >= 3 ? digits.slice(0, 4) : null;
}

/** Calendar month before `YYYY-MM` (e.g. 2026-04 → 2026-03) for carry-in head days on apply rows. */
function previousYyyyMm(mk: string): string {
  const y = parseInt(mk.slice(0, 4), 10);
  const m = parseInt(mk.slice(5, 7), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return '';
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Builds calendar apply rows from stored pairings + legs (schedule_pairings / schedule_pairing_legs).
 * One row per duty date per pairing so merge/replace can assign trip_group_id for consecutive trip days.
 */
export async function buildApplyRowsFromPairingBatch(
  batchId: string,
  monthKey: string | null | undefined
): Promise<ApplyRow[]> {
  const pairings = await fetchPairingsForBatch(batchId);
  const out: ApplyRow[] = [];

  for (const p of pairings) {
    const pairingCode = (p.pairing_id ?? '').trim() || 'UNKNOWN';
    const startIso = (p.operate_start_date ?? '').trim();
    const legs = await fetchDutiesForPairing(p.id);

    if (legs.length === 0) {
      if (startIso) {
        out.push({
          date: startIso,
          day_of_week: isoToDowThreeLetter(startIso),
          pairing_code: pairingCode,
          report_time: digitsTime(p.report_time_local),
          d_end_time: null,
          depart_local: null,
          arrive_local: null,
          status_code: 'TRIP',
          source_type: 'import',
        });
      }
      continue;
    }

    const byDate = new Map<string, typeof legs>();
    for (const l of legs) {
      const ds = (l.duty_date ?? '').trim();
      if (!ds) continue;
      const arr = byDate.get(ds) ?? [];
      arr.push(l);
      byDate.set(ds, arr);
    }

    const sortedDates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
    for (const dateStr of sortedDates) {
      const dayLegs = byDate.get(dateStr)!;
      const segs = dayLegs.map((l) => {
        const fr = l.flica_route?.trim();
        if (fr && fr.length >= 5) {
          return fr.replace(/[–—]/g, '-');
        }
        const a = (l.from_airport ?? '?').trim() || '?';
        const b = (l.to_airport ?? '?').trim() || '?';
        return `${a}-${b}`;
      });
      const city = segs.length ? segs.join(', ') : null;
      const opStartDay = startIso.slice(0, 10);
      const firstDay = Boolean(/^\d{4}-\d{2}-\d{2}$/.test(opStartDay) && dateStr === opStartDay);
      const lastLeg = dayLegs[dayLegs.length - 1];
      const departFirst = dayLegs[0]?.departure_time_local ?? null;
      const fcvStn = (lastLeg?.layover_city ?? '').trim();
      out.push({
        date: dateStr,
        day_of_week: isoToDowThreeLetter(dateStr),
        pairing_code: pairingCode,
        report_time: firstDay ? digitsTime(p.report_time_local) : null,
        city,
        d_end_time: lastLeg ? digitsTime(lastLeg.release_time_local) : null,
        layover: buildLayoverSummaryFromDuties(dayLegs),
        depart_local: departFirst,
        arrive_local: lastLeg?.arrival_time_local ?? null,
        status_code: 'TRIP',
        source_type: 'import',
        /** Ledger FCV: Crewline city column = layover station, threaded into `CrewScheduleTrip.layoverStationByDate`. */
        notes: fcvStn ? `fcv_lo:${fcvStn.toUpperCase()}` : null,
      });
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date));

  const mk = monthKey?.trim();
  const monthPrefix = mk && mk.length >= 7 ? mk.slice(0, 7) : mk;
  /**
   * Never drop prior-calendar-month head days: `schedule_import_replace_month` stores with `p_month_key`
   * (e.g. 2026-04) and `date` (e.g. 2026-03-30) so April view can show M 30 / T 31 for carry-overs. A
   * same-month YYYY-MM filter would strip those rows and the trip disappears from the top of the ledger.
   */
  if (monthPrefix) {
    const prior = previousYyyyMm(monthPrefix);
    return out.filter((r) => {
      const rp = r.date.slice(0, 7);
      return rp === monthPrefix || (prior ? rp === prior : false);
    });
  }
  return out;
}

export function candidatesToApplyRows(candidates: ScheduleImportCandidateRow[]): ApplyRow[] {
  return candidates
    .filter((c) => c.date && !c.ignored_flag)
    .filter((c) => {
      const st = (c.status_code ?? '').toUpperCase();
      if (st === 'UNK' || st === 'BLANK') return false;
      return true;
    })
    .map((c) => ({
      date: c.date as string,
      day_of_week: c.day_of_week,
      pairing_code: c.pairing_code,
      report_time: c.report_time,
      city: c.city,
      d_end_time: c.d_end_time,
      layover: c.layover,
      depart_local: c.depart_local,
      arrive_local: c.arrive_local,
      wx: c.wx,
      status_code: c.status_code,
      notes: c.notes,
      source_type: 'import',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchLatestReviewableBatch(): Promise<ScheduleImportBatchRow | null> {
  const { data, error } = await supabase
    .from('schedule_import_batches')
    .select('*')
    .in('parse_status', ['parsed', 'reviewed', 'uploaded', 'extracting'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as ScheduleImportBatchRow | null;
}

/** Latest batch that completed parsing (ready for replace/merge from Manage). */
export async function fetchLatestParsedBatch(): Promise<ScheduleImportBatchRow | null> {
  const { data, error } = await supabase
    .from('schedule_import_batches')
    .select('*')
    .in('parse_status', ['parsed', 'reviewed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as ScheduleImportBatchRow | null;
}

/** Most recent import with a stored file (for re-run OCR). */
export async function fetchLatestBatchWithFile(): Promise<ScheduleImportBatchRow | null> {
  const { data, error } = await supabase
    .from('schedule_import_batches')
    .select('*')
    .not('source_file_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as ScheduleImportBatchRow | null;
}

export async function getSignedImportFileUrl(path: string, expiresSec = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from('schedule-imports').createSignedUrl(path, expiresSec);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export type ScheduleTripMetadataRow = {
  trip_group_id: string;
  user_id: string;
  pairing_block_hours: number | null;
  pairing_credit_hours: number | null;
  pairing_tafb_hours: number | null;
  layover_total_minutes: number | null;
  crew: ScheduleCrewMember[] | null;
  updated_at: string | null;
};

export async function fetchScheduleMonthMetrics(year: number, month: number): Promise<ScheduleMonthMetrics | null> {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const { data: au, error: authErr } = await supabase.auth.getUser();
  if (authErr || !au.user) return null;
  const { data, error } = await supabase
    .from('schedule_month_metrics')
    .select('*')
    .eq('month_key', monthKey)
    .eq('user_id', au.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const numOrNull = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };
  const monthlyTafb =
    numOrNull(row.monthly_tafb_hours) ?? numOrNull(row.tafb_hours_month);

  return {
    monthKey: data.month_key as string,
    monthlyTafbHours: monthlyTafb,
    blockHours: data.block_hours != null ? Number(data.block_hours) : null,
    creditHours: data.credit_hours != null ? Number(data.credit_hours) : null,
    ytdCreditHours: data.ytd_credit_hours != null ? Number(data.ytd_credit_hours) : null,
    daysOff: data.days_off != null ? Number(data.days_off) : null,
    layoverTotalMinutes: data.layover_total_minutes != null ? Number(data.layover_total_minutes) : null,
    updatedAt: data.updated_at ?? null,
  };
}

/**
 * True when this month was populated by FLICA direct (WebView) import — at least one `flica_direct` batch exists.
 * Used to route pull-to-refresh to the full FLICA re-auth + token + download flow instead of a silent refetch.
 */
export async function hasFlicaDirectImportForMonth(year: number, month: number): Promise<boolean> {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const { data: u, error: userErr } = await supabase.auth.getUser();
  if (userErr || !u.user) return false;
  const { data, error } = await supabase
    .from('schedule_import_batches')
    .select('id')
    .eq('user_id', u.user.id)
    .eq('month_key', monthKey)
    .eq('source_type', 'flica_direct')
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return data != null;
}

/** Normalized month load: `schedule_duties` + `schedule_pairings` + legs → trips + optional classic row audit. */
export type FetchTripsFromDutiesForMonthResult = {
  trips: CrewScheduleTrip[];
  classicRows: ClassicScheduleRow[];
  importBatchId: string | null;
};

export async function fetchTripsFromDutiesForMonth(
  year: number,
  month: number,
): Promise<FetchTripsFromDutiesForMonthResult> {
  const pack = await fetchScheduleDutiesAndPairingsForMonth(year, month);
  if (!pack.duties.length) {
    return { trips: [], classicRows: [], importBatchId: null };
  }
  const classicRows = buildClassicRowsFromDuties(pack.duties, pack.pairings, pack.pairingLegs);
  const trips = buildCrewScheduleTripsFromNormalizedPack(year, month, pack.duties, pack.pairings, pack.pairingLegs);
  const rawId = pack.duties[0]?.import_id;
  const importBatchId = typeof rawId === 'string' && rawId.length ? rawId : null;
  return { trips, classicRows, importBatchId };
}

/** Trip detail / deep links: load one pairing by `schedule_pairings.id` (same id as `CrewScheduleTrip.id`). */
export async function fetchCrewScheduleTripByPairingUuid(pairingUuid: string): Promise<CrewScheduleTrip | null> {
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return null;
  const uid = u.user.id;
  const { data: pairing, error } = await supabase
    .from('schedule_pairings')
    .select(
      'id, import_id, pairing_id, base_code, operate_start_date, pairing_start_date, operate_end_date, pairing_end_date',
    )
    .eq('id', pairingUuid)
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !pairing) return null;

  const { data: dutyRows } = await supabase
    .from('schedule_duties')
    .select('*')
    .eq('user_id', uid)
    .eq('import_id', pairing.import_id as string)
    .eq('pairing_id', pairing.pairing_id as string)
    .order('duty_date', { ascending: true });

  const { data: legRows } = await supabase
    .from('schedule_pairing_legs')
    .select(
      'id,pairing_id,duty_date,flight_number,segment_type,departure_station,arrival_station,scheduled_departure_local,scheduled_arrival_local,release_time_local,is_deadhead,normalized_json,created_at',
    )
    .eq('pairing_id', pairingUuid)
    .order('created_at', { ascending: true });

  const op = String(pairing.operate_start_date ?? pairing.pairing_start_date ?? '').slice(0, 10);
  const y = op.length >= 10 ? Number(op.slice(0, 4)) : new Date().getFullYear();
  const m = op.length >= 10 ? Number(op.slice(5, 7)) : new Date().getMonth() + 1;

  const trips = buildCrewScheduleTripsFromNormalizedPack(
    y,
    m,
    (dutyRows ?? []) as NormScheduleDuty[],
    [pairing as NormSchedulePairing],
    (legRows ?? []) as SchedulePairingLegLite[],
  );
  return trips[0] ?? null;
}

export async function fetchTripMetadataForTripGroups(tripGroupIds: string[]): Promise<ScheduleTripMetadataRow[]> {
  if (!tripGroupIds.length) return [];
  const { data, error } = await supabase
    .from('schedule_trip_metadata')
    .select(
      'trip_group_id,user_id,pairing_block_hours,pairing_credit_hours,pairing_tafb_hours,layover_total_minutes,crew,updated_at'
    )
    .in('trip_group_id', tripGroupIds);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    crew: Array.isArray(row.crew) ? (row.crew as ScheduleCrewMember[]) : [],
  })) as ScheduleTripMetadataRow[];
}

export async function fetchTripMetadataForGroup(tripGroupId: string): Promise<ScheduleTripMetadataRow | null> {
  const { data, error } = await supabase
    .from('schedule_trip_metadata')
    .select(
      'trip_group_id,user_id,pairing_block_hours,pairing_credit_hours,pairing_tafb_hours,layover_total_minutes,crew,updated_at'
    )
    .eq('trip_group_id', tripGroupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    crew: Array.isArray(data.crew) ? (data.crew as ScheduleCrewMember[]) : [],
  } as ScheduleTripMetadataRow;
}

export function mergeTripMetadataIntoTrips(
  trips: CrewScheduleTrip[],
  metaRows: ScheduleTripMetadataRow[]
): CrewScheduleTrip[] {
  const byId = new Map(metaRows.map((m) => [m.trip_group_id, m]));
  return trips.map((t) => {
    const m = byId.get(t.id);
    if (!m) return t;
    return mergeTripWithMetadataRow(t, m);
  });
}

export function mergeTripWithMetadataRow(trip: CrewScheduleTrip, m: ScheduleTripMetadataRow | null): CrewScheduleTrip {
  if (!m) return trip;
  return {
    ...trip,
    pairingBlockHours: m.pairing_block_hours ?? trip.pairingBlockHours,
    pairingCreditHours: m.pairing_credit_hours ?? trip.pairingCreditHours,
    pairingTafbHours: m.pairing_tafb_hours ?? trip.pairingTafbHours,
    tripLayoverTotalMinutes: m.layover_total_minutes ?? trip.tripLayoverTotalMinutes,
    crewMembers: m.crew?.length ? m.crew : trip.crewMembers,
  };
}
