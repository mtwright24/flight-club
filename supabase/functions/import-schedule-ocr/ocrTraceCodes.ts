/**
 * Machine-readable OCR / import handoff reason codes (Edge logs + classification_json + invoke JSON).
 */
export const OcrTraceReason = {
  STORAGE_FETCH_FAILED: 'STORAGE_FETCH_FAILED',
  STORAGE_FETCH_EMPTY: 'STORAGE_FETCH_EMPTY',
  /** Downloaded object missing or not a Blob */
  STORAGE_FETCH_NO_BLOB: 'STORAGE_FETCH_NO_BLOB',
  IMAGE_DECODE_FAILED: 'IMAGE_DECODE_FAILED',
  /** sharp / pipeline could not produce a JPEG variant */
  IMAGE_PREPROCESS_SHARP_FAILED: 'IMAGE_PREPROCESS_SHARP_FAILED',
  OCR_NOT_INVOKED: 'OCR_NOT_INVOKED',
  /** Google Vision HTTP non-OK or thrown */
  OCR_ENGINE_ERROR: 'OCR_ENGINE_ERROR',
  /** PDF text engine (unpdf/pdf.js) failed to load or threw — not user file quality */
  PDF_EXTRACTION_ENGINE_ERROR: 'PDF_EXTRACTION_ENGINE_ERROR',
  /** PDF parsed but extracted string below usable threshold (may be scanned/image-only) */
  PDF_EXTRACTED_NO_USABLE_TEXT: 'PDF_EXTRACTED_NO_USABLE_TEXT',
  OCR_RETURNED_EMPTY: 'OCR_RETURNED_EMPTY',
  OCR_TEXT_DISCARDED_BY_THRESHOLD: 'OCR_TEXT_DISCARDED_BY_THRESHOLD',
  /** After trim / marker strip, string stored on batch is empty */
  PARSER_RECEIVED_EMPTY_RAW_TEXT: 'PARSER_RECEIVED_EMPTY_RAW_TEXT',
  /** batch update failed after OCR succeeded */
  BATCH_UPDATE_FAILED: 'BATCH_UPDATE_FAILED',
} as const;

export type OcrTraceReasonCode = (typeof OcrTraceReason)[keyof typeof OcrTraceReason];

export type OcrImportInstrumentation = {
  reason_codes: OcrTraceReasonCode[];
  storage_path: string;
  storage_download_bytes: number;
  storage_fetch_ok: boolean;
  storage_error_message: string | null;
  file_kind: 'image' | 'pdf' | 'unknown';
  mime_from_extension: string;
  ocr_provider: 'google_cloud_vision';
  google_auth_mode: 'api_key' | 'oauth';
  /** Preprocess (sharp) stage */
  preprocess_sharp_used: boolean;
  preprocess_decode_ok: boolean;
  preprocess_output_width: number;
  preprocess_output_height: number;
  preprocess_logs: string[];
  /** First Vision pass on primary buffer */
  primary_document_text_len: number;
  primary_text_detection_len: number;
  primary_merged_len: number;
  primary_doc_sample_300: string;
  /** Full pipeline merged before final trim rules */
  merged_before_final_trim_len: number;
  merged_after_trim_len: number;
  weak_ocr_marker_appended: boolean;
  discarded_by_threshold: boolean;
  threshold_detail: string | null;
  /** Final string written to raw_extracted_text (before slice) */
  raw_text_len_for_db: number;
  handoff_reason_code: OcrTraceReasonCode | null;
};
