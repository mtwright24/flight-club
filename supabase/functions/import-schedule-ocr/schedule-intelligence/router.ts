/**
 * Template router — selects schedule_templates.parser_key using strict priority:
 * 1) last successful template (user memory)
 * 2) airline + role + software + view match strength
 * 3) generic fallback template
 *
 * Template list always comes from DB — never hardcode the catalog here.
 */

import type { ClassificationResult, TemplateRow } from './types.ts';
import { SEED_IDS } from './seedIds.ts';

function scoreTemplate(
  t: TemplateRow,
  c: ClassificationResult,
  profileLastTemplateId: string | null
): number {
  let s = 0;
  if (profileLastTemplateId && t.id === profileLastTemplateId) s += 100;
  if (c.airline_guess_id && t.airline_id === c.airline_guess_id) s += 40;
  if (c.role_guess_id && t.role_id === c.role_guess_id) s += 20;
  if (c.software_guess_id && t.software_id === c.software_guess_id) s += 30;
  if (c.view_guess_id && t.view_type_id === c.view_guess_id) s += 25;
  if (!t.airline_id) s -= 5;
  if (!t.role_id) s -= 2;
  return s;
}

export function pickTemplate(
  templates: TemplateRow[],
  classification: ClassificationResult,
  profileLastTemplateId: string | null
): TemplateRow {
  const active = templates.filter((t) => t.active !== false);
  if (active.length === 0) {
    return {
      id: SEED_IDS.templateGenericFallback,
      parser_key: 'generic_fallback_v1',
      airline_id: null,
      role_id: null,
      software_id: SEED_IDS.softwareGeneric,
      view_type_id: SEED_IDS.viewGenericFallback,
      active: true,
    };
  }

  const ranked = [...active].sort(
    (a, b) =>
      scoreTemplate(b, classification, profileLastTemplateId) -
      scoreTemplate(a, classification, profileLastTemplateId)
  );

  return ranked[0] ?? active[0]!;
}
