/**
 * Parser → persist → validation handoff for concrete import review issues (PDF + OCR).
 */
import type { ValidationReasonCode } from './jetblueFlicaImportReasonCopy';

/** Persisted under `schedule_pairings.normalized_json.import_review_issues`. */
export type StoredImportReviewIssue = {
  field_key: 'pairing_id' | 'operate_start_date' | 'operate_end_date' | 'report_time_local' | 'base_code' | string;
  /** e.g. `leg:flight_number`, `leg:layover_city` — matched to a leg row by `duty_date_iso` after insert. */
  validation_state: 'needs_review';
  reason_code: ValidationReasonCode;
  reason_display: string;
  duty_date_iso: string | null;
  candidates?: { value: string; label?: string }[];
  /** Disambiguate same-day multi-leg flight_number issues (screenshot / PDF). */
  leg_route_from?: string;
  leg_route_to?: string;
  reconstructed_row_text?: string;
  candidate_flight_numbers?: string[];
  row_confidence?: number;
  suggestion_source?: 'reconstructed_row' | 'external_flight_match' | 'manual';
};
