import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../../lib/supabaseClient';

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

export async function fetchScheduleEntriesForMonth(
  year: number,
  month: number
): Promise<ScheduleEntryRow[]> {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('schedule_entries')
    .select(
      'id,user_id,trip_group_id,month_key,date,day_of_week,pairing_code,report_time,city,d_end_time,layover,wx,status_code,notes,source_type,source_batch_id,is_user_confirmed'
    )
    .eq('month_key', monthKey)
    .order('date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ScheduleEntryRow[];
}

export async function fetchTripGroupEntries(tripGroupId: string): Promise<ScheduleEntryRow[]> {
  const { data, error } = await supabase
    .from('schedule_entries')
    .select(
      'id,user_id,trip_group_id,month_key,date,day_of_week,pairing_code,report_time,city,d_end_time,layover,wx,status_code,notes,source_type,source_batch_id,is_user_confirmed'
    )
    .eq('trip_group_id', tripGroupId)
    .order('date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ScheduleEntryRow[];
}

export async function createImportBatch(params: {
  monthKey: string;
  sourceType: 'screenshot' | 'photo' | 'pdf';
  sourceFilePath: string;
  sourceFileUrl?: string | null;
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

  const d = parsed as { ok?: boolean; error?: string; row_count?: number; warning_count?: number; pdf_weak?: boolean };
  if (d?.error) throw new Error(d.error);
  return {
    row_count: d.row_count ?? 0,
    warning_count: d.warning_count ?? 0,
    pdf_weak: d.pdf_weak,
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
    .order('date', { ascending: true, nullsFirst: false });

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
      | 'wx'
      | 'status_code'
      | 'notes'
    >
  >
): Promise<void> {
  const { error } = await supabase.from('schedule_import_candidates').update(patch).eq('id', id);
  if (error) throw error;
}

export type ApplyRow = {
  date: string;
  day_of_week?: string | null;
  pairing_code?: string | null;
  report_time?: string | null;
  city?: string | null;
  d_end_time?: string | null;
  layover?: string | null;
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

export function candidatesToApplyRows(candidates: ScheduleImportCandidateRow[]): ApplyRow[] {
  return candidates
    .filter((c) => c.date && !c.ignored_flag)
    .map((c) => ({
      date: c.date as string,
      day_of_week: c.day_of_week,
      pairing_code: c.pairing_code,
      report_time: c.report_time,
      city: c.city,
      d_end_time: c.d_end_time,
      layover: c.layover,
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
