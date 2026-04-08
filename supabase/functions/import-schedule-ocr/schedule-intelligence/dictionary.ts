/**
 * Code dictionary — schedule_code_dictionary
 * Priority: airline+software+role > airline > software > global (null FKs).
 * Used to enrich notes / future status normalization; does not replace template parsers.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { DictionaryContext, DictionaryRow, ParsedCandidate } from './types.ts';

export async function loadActiveDictionary(supabase: SupabaseClient): Promise<DictionaryRow[]> {
  const { data, error } = await supabase
    .from('schedule_code_dictionary')
    .select('code, meaning, priority, airline_id, role_id, software_id')
    .eq('active', true);
  if (error) {
    console.warn('[schedule-intelligence] dictionary load failed', error.message);
    return [];
  }
  return (data ?? []) as DictionaryRow[];
}

function scoreRow(row: DictionaryRow, ctx: DictionaryContext): number {
  let s = row.priority;
  if (row.airline_id && row.airline_id === ctx.airline_id) s += 50;
  if (row.software_id && row.software_id === ctx.software_id) s += 40;
  if (row.role_id && row.role_id === ctx.role_id) s += 30;
  return s;
}

export function resolveMeaningForCode(
  codeNorm: string,
  rows: DictionaryRow[],
  ctx: DictionaryContext
): string | null {
  const c = codeNorm.trim().toUpperCase();
  if (!c) return null;
  const matches = rows.filter((r) => r.code.trim().toUpperCase() === c);
  if (matches.length === 0) return null;
  matches.sort((a, b) => scoreRow(b, ctx) - scoreRow(a, ctx));
  return matches[0]?.meaning ?? null;
}

/**
 * Append dictionary gloss to notes for review (non-destructive).
 */
export function enrichCandidatesWithDictionary(
  candidates: ParsedCandidate[],
  dictionaryRows: DictionaryRow[],
  ctx: DictionaryContext
): ParsedCandidate[] {
  if (dictionaryRows.length === 0) return candidates;
  return candidates.map((row) => {
    const sc = (row.status_code ?? '').trim();
    if (!sc) return row;
    const meaning = resolveMeaningForCode(sc, dictionaryRows, ctx);
    if (!meaning) return row;
    const tag = `[dict:${meaning}]`;
    const notes = row.notes?.includes(tag) ? row.notes : row.notes ? `${row.notes} ${tag}` : tag;
    return { ...row, notes };
  });
}
