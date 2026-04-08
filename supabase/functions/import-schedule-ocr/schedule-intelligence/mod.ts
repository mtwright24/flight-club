/**
 * Schedule Intelligence Platform — public API for import-schedule-ocr.
 *
 * Layers (in order):
 * 1. Extraction (Vision / PDF) — see ../extract.ts
 * 2. Classification — classify.ts
 * 3. Template routing — router.ts (DB-backed schedule_templates)
 * 4. Parser registry — registry.ts (pluggable parser_key modules)
 * 5. Code dictionary — dictionary.ts (DB-backed schedule_code_dictionary)
 * 6. User memory — memory.ts (user_schedule_profiles)
 */

export type {
  ClassificationResult,
  DictionaryContext,
  DictionaryRow,
  ParsedCandidate,
  TemplateRow,
  UserScheduleProfileRow,
} from './types.ts';

export { classifyImport } from './classify.ts';
export { enrichCandidatesWithDictionary, loadActiveDictionary } from './dictionary.ts';
export { fetchUserScheduleProfile, persistUserMemoryAfterSuccessfulImport } from './memory.ts';
export { GENERIC_FALLBACK_PARSER_KEY, parseWithRegisteredModule } from './registry.ts';
export { pickTemplate } from './router.ts';
export { SEED_IDS } from './seedIds.ts';
