/**
 * JetBlue FLICA guided import sessions — schedule_imports / images / issues.
 */

import { supabase } from '../../lib/supabaseClient';

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
};

/** View `schedule_pairing_duties` — leg rows under a pairing (pairing_row_id = schedule_pairings.id). */
export type SchedulePairingDutyRow = {
  id: string;
  pairing_row_id: string;
  duty_date: string | null;
  from_airport: string | null;
  to_airport: string | null;
  departure_time_local: string | null;
  arrival_time_local: string | null;
  layover_city: string | null;
  hotel_name: string | null;
  release_time_local: string | null;
  row_confidence: number | null;
  requires_review: boolean;
  raw_text: string | null;
};

export function buildRouteSummaryFromDuties(
  legs: Pick<SchedulePairingDutyRow, 'from_airport' | 'to_airport'>[]
): string {
  if (!legs.length) return '—';
  const segs: string[] = [];
  for (const l of legs) {
    const a = (l.from_airport ?? '').trim();
    const b = (l.to_airport ?? '').trim();
    if (a && b) segs.push(`${a}→${b}`);
  }
  return segs.length ? segs.join(' · ') : '—';
}

export function buildLayoverSummaryFromDuties(legs: Pick<SchedulePairingDutyRow, 'layover_city'>[]): string {
  const cities = [...new Set(legs.map((l) => (l.layover_city ?? '').trim()).filter(Boolean))];
  return cities.length ? cities.join(', ') : '—';
}

export async function fetchPairingsForScheduleImport(importId: string): Promise<SchedulePairingRow[]> {
  const { data, error } = await supabase
    .from('schedule_pairings')
    .select('*')
    .eq('schedule_import_id', importId);

  if (error) throw error;
  return (data ?? []) as SchedulePairingRow[];
}

export async function fetchPairingById(pairingUuid: string): Promise<SchedulePairingRow | null> {
  const { data, error } = await supabase.from('schedule_pairings').select('*').eq('id', pairingUuid).maybeSingle();
  if (error) throw error;
  return data as SchedulePairingRow | null;
}

function mapLegRowToDuty(l: Record<string, unknown>): SchedulePairingDutyRow {
  return {
    id: l.id as string,
    pairing_row_id: l.pairing_id as string,
    duty_date: (l.duty_date as string) ?? null,
    from_airport: (l.departure_station as string) ?? null,
    to_airport: (l.arrival_station as string) ?? null,
    departure_time_local: (l.scheduled_departure_local as string) ?? null,
    arrival_time_local: (l.scheduled_arrival_local as string) ?? null,
    layover_city: (l.layover_city as string) ?? null,
    hotel_name: (l.hotel_name as string) ?? null,
    release_time_local: ((l.release_time_local ?? l.release_time) as string) ?? null,
    row_confidence: (l.row_confidence as number) ?? null,
    requires_review: Boolean(l.requires_review),
    raw_text: (l.raw_text as string) ?? null,
  };
}

/** Duty rows for a pairing (table `schedule_pairing_legs`). */
export async function fetchDutiesForPairing(pairingUuid: string): Promise<SchedulePairingDutyRow[]> {
  const { data, error } = await supabase
    .from('schedule_pairing_legs')
    .select('*')
    .eq('pairing_id', pairingUuid)
    .order('duty_date', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []).map((row) => mapLegRowToDuty(row as Record<string, unknown>));
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
