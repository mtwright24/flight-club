/**
 * Parser module registry — Schedule Intelligence Platform.
 *
 * New airline/software layouts:
 * 1. Add a row to schedule_templates (parser_key, airline_id, …).
 * 2. Register a ParserModule here OR reuse an existing parser_key.
 *
 * Do not add one-off branches in index.ts — extend this registry.
 */

import { parseScheduleText } from '../parser.ts';
import type { ParserModule } from './types.ts';
import { preprocessFlicaMonthly } from './parsers/flica_preprocess.ts';

export const GENERIC_FALLBACK_PARSER_KEY = 'generic_fallback_v1';

const modules = new Map<string, ParserModule>();

function register(m: ParserModule): void {
  modules.set(m.parser_key, m);
}

register({
  parser_key: GENERIC_FALLBACK_PARSER_KEY,
  parse: (text, monthHint) => parseScheduleText(text, monthHint),
});

register({
  parser_key: 'flica_jetblue_fa_monthly_v1',
  preprocess: preprocessFlicaMonthly,
  parse: (text, monthHint) => parseScheduleText(text, monthHint),
});

/** Future: classic_list_v1, pdf_report_v1 — register when implemented */
// register({ parser_key: 'classic_list_v1', parse: parseClassicList, });

export function getParserModule(parserKey: string): ParserModule {
  return modules.get(parserKey) ?? modules.get(GENERIC_FALLBACK_PARSER_KEY)!;
}

export function parseWithRegisteredModule(parserKey: string, rawText: string, monthHint: string) {
  const mod = getParserModule(parserKey);
  let text = rawText;
  if (mod.preprocess) text = mod.preprocess(text);
  return mod.parse(text, monthHint);
}
