/**
 * PostgREST rejects the entire batch update if any column is missing from the schema cache.
 * Remote projects sometimes have not applied `20260415120000_schedule_intelligence_platform.sql`.
 *
 * Strategy: try full patch → on "column not found" / schema cache error, persist core OCR fields
 * (`raw_extracted_text`, etc.) then optionally apply extended Schedule Intelligence columns in a second update.
 */

/** Columns present on the original `schedule_import_batches` table (crew_schedule_import migration). */
const CORE_BATCH_KEYS = [
  'raw_extracted_text',
  'parse_status',
  'row_count',
  'warning_count',
  'parse_error',
  'updated_at',
] as const;

function pickCore(patch: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of CORE_BATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) o[k] = patch[k];
  }
  return o;
}

function pickExtended(patch: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    if (!(CORE_BATCH_KEYS as readonly string[]).includes(k)) o[k] = patch[k];
  }
  return o;
}

function isMissingColumnError(message: string): boolean {
  return /could not find .* column|schema cache|column .* does not exist/i.test(message);
}

export type ScheduleBatchUpdateResult = {
  error: { message: string } | null;
  /** True if we had to split core vs extended because the full patch failed */
  used_core_fallback: boolean;
  /** Set when extended patch failed (core still saved if fallback ran) */
  extended_error: { message: string } | null;
};

type MinimalSupabase = {
  from: (table: string) => {
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

/**
 * Updates `schedule_import_batches`. If optional columns are missing in the DB, still saves OCR text via core columns.
 */
export async function updateScheduleImportBatchRow(
  supabase: MinimalSupabase,
  batchId: string,
  patch: Record<string, unknown>
): Promise<ScheduleBatchUpdateResult> {
  const { error } = await supabase.from('schedule_import_batches').update(patch).eq('id', batchId);
  if (!error) {
    return { error: null, used_core_fallback: false, extended_error: null };
  }

  const msg = error.message ?? '';
  if (!isMissingColumnError(msg)) {
    return { error, used_core_fallback: false, extended_error: null };
  }

  const core = pickCore(patch);
  const ext = pickExtended(patch);

  console.warn('[import-schedule-ocr] schedule_batch_update_schema_mismatch', {
    batch_id: batchId,
    original_error: msg,
    retrying_with_core_then_extended: true,
  });

  const { error: coreErr } = await supabase.from('schedule_import_batches').update(core).eq('id', batchId);
  if (coreErr) {
    return { error: coreErr, used_core_fallback: true, extended_error: null };
  }

  if (Object.keys(ext).length === 0) {
    return { error: null, used_core_fallback: true, extended_error: null };
  }

  const { error: extErr } = await supabase.from('schedule_import_batches').update(ext).eq('id', batchId);
  if (extErr) {
    console.warn('[import-schedule-ocr] schedule_batch_extended_columns_skipped', {
      batch_id: batchId,
      message: extErr.message,
      hint: 'Apply supabase/migrations/20260415120000_schedule_intelligence_platform.sql (or newer) on this project.',
    });
    return { error: null, used_core_fallback: true, extended_error: extErr };
  }

  return { error: null, used_core_fallback: true, extended_error: null };
}
