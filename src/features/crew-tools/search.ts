import type { CrewBundle, CrewTool } from './types';

export function matchesToolQuery(tool: CrewTool, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    tool.title.toLowerCase().includes(s) ||
    (tool.subtitle?.toLowerCase().includes(s) ?? false) ||
    (tool.categories?.some((c) => c.toLowerCase().includes(s)) ?? false) ||
    tool.id.replace(/-/g, ' ').includes(s)
  );
}

export function matchesBundleQuery(bundle: CrewBundle, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return bundle.title.toLowerCase().includes(s) || bundle.blurb.toLowerCase().includes(s);
}
