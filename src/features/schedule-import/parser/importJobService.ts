/**
 * Supabase persistence for normalized import pipeline — wire to client in app layer.
 * (Skeleton: types align with schedule_import_jobs and child tables.)
 */

import type {
  NormalizedScheduleMonthRow,
  RawScheduleExtractionRow,
  ScheduleImportAssetRow,
  ScheduleImportJobRow,
} from '../types';

export type CreateImportJobInput = {
  userId: string;
  sourceMonthLabel: string | null;
  sourceYear: number | null;
  parserVersion?: string;
  legacyScheduleImportId?: string | null;
  rawMetadata?: Record<string, unknown>;
};

/** Returns shape expected after insert — implement with supabase.from('schedule_import_jobs').insert(...) */
export function buildImportJobRow(input: CreateImportJobInput): Omit<ScheduleImportJobRow, 'id' | 'created_at' | 'updated_at'> {
  return {
    user_id: input.userId,
    airline_code: 'B6',
    source_type: 'jetblue_flica_monthly_screenshot',
    source_month_label: input.sourceMonthLabel,
    source_year: input.sourceYear,
    import_status: 'draft',
    parser_version: input.parserVersion ?? '1.0.0',
    raw_metadata_json: input.rawMetadata ?? {},
    notes: null,
    legacy_schedule_import_id: input.legacyScheduleImportId ?? null,
  };
}

export function buildRawExtractionRow(params: {
  importJobId: string;
  assetId: string | null;
  rawText: string;
  structuredBlocks: unknown[];
  confidence: number | null;
}): Omit<RawScheduleExtractionRow, 'id' | 'created_at'> {
  return {
    import_job_id: params.importJobId,
    asset_id: params.assetId,
    extraction_engine: 'ocr',
    raw_text: params.rawText,
    structured_blocks_json: params.structuredBlocks,
    confidence_overall: params.confidence,
  };
}

export function buildAssetRow(params: {
  importJobId: string;
  userId: string;
  originalPath: string;
  sortOrder: number;
}): Omit<ScheduleImportAssetRow, 'id' | 'created_at'> {
  return {
    import_job_id: params.importJobId,
    user_id: params.userId,
    original_file_path: params.originalPath,
    processed_file_path: null,
    sort_order: params.sortOrder,
    width: null,
    height: null,
    source_device_type: null,
    content_hash: null,
  };
}

export type InsertNormalizedMonthInput = Omit<
  NormalizedScheduleMonthRow,
  'id' | 'created_at' | 'updated_at'
>;
