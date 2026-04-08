/**
 * Schedule Intelligence Platform — shared types.
 * OCR/extraction is an input stage only; parsing is template-driven and dictionary-aware.
 */

import type { ParsedCandidate } from '../parser.ts';

export type { ParsedCandidate };

/** Row from public.user_schedule_profiles (subset used at import time). */
export type UserScheduleProfileRow = {
  airline_id: string | null;
  role_id: string | null;
  software_id: string | null;
  default_view_type_id: string | null;
  last_successful_template_id: string | null;
  last_successful_month_key: string | null;
} | null;

/** Output of the classifier — stored on schedule_import_batches. */
export type ClassificationResult = {
  airline_guess_id: string | null;
  role_guess_id: string | null;
  software_guess_id: string | null;
  view_guess_id: string | null;
  detected_month_key: string | null;
  confidence: number;
  signals: string[];
};

/** Row from public.schedule_templates (routing). */
export type TemplateRow = {
  id: string;
  parser_key: string;
  airline_id: string | null;
  role_id: string | null;
  software_id: string | null;
  view_type_id: string;
  active: boolean;
};

/** Row from public.schedule_code_dictionary (active only). */
export type DictionaryRow = {
  code: string;
  meaning: string;
  priority: number;
  airline_id: string | null;
  role_id: string | null;
  software_id: string | null;
};

/** Context for dictionary resolution (narrower match wins over global). */
export type DictionaryContext = {
  airline_id: string | null;
  role_id: string | null;
  software_id: string | null;
};

/**
 * A pluggable parser module — register in registry.ts.
 * Add new airlines/software by adding DB rows + registering the same parser_key or a new module.
 */
export type ParserModule = {
  /** Must match schedule_templates.parser_key */
  parser_key: string;
  /** Optional layout-specific cleanup before shared line parsing */
  preprocess?: (raw: string) => string;
  /** Required: produces normalized candidates */
  parse: (text: string, monthHint: string) => ParsedCandidate[];
};
