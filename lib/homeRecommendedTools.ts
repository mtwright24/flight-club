import type { ToolEntry } from './toolsRegistry';
import { toolsRegistry } from './toolsRegistry';

type ProfileLite = { base: string | null; fleet: string | null } | null | undefined;

/**
 * Pick tools for Home "Recommended" using profile keywords (no ML).
 * Excludes ids already shown as user shortcuts when provided.
 */
export function pickRecommendedTools(
  profile: ProfileLite,
  excludeIds?: Set<string>,
): ToolEntry[] {
  const base = (profile?.base || '').toLowerCase().trim();
  const fleet = (profile?.fleet || '').toLowerCase().trim();
  const ex = excludeIds ?? new Set<string>();

  const scored = toolsRegistry
    .filter((t) => !ex.has(t.id))
    .map((t) => {
      const hay = `${t.title} ${t.keywords.join(' ')} ${t.description}`.toLowerCase();
      let score = 0;
      if (base.length >= 2 && hay.includes(base)) score += 3;
      if (fleet.length >= 2 && hay.includes(fleet)) score += 3;
      if (t.keywords.some((k) => base && k.includes(base))) score += 1;
      if (t.keywords.some((k) => fleet && k.includes(fleet))) score += 1;
      return { t, score };
    });

  scored.sort((a, b) => b.score - a.score || a.t.title.localeCompare(b.t.title));
  return scored.slice(0, 6).map((s) => s.t);
}
