/**
 * Display-only helpers for FLICA Layover column text.
 * Does not invent routes or legs — only normalizes whitespace for UI.
 */

export function hubLayoverRawText(layover: string | null | undefined): string {
  return String(layover ?? "").replace(/\s+/g, " ").trim();
}

/** Exact FLICA layover text, or em dash when blank (turns often have no layover). */
export function hubLayoverDisplayText(layover: string | null | undefined): string {
  const s = hubLayoverRawText(layover);
  return s.length ? s : "—";
}

/** Same tokens as FLICA, with centered dot between space-separated segments (visual only). */
export function hubLayoverDisplayWithDots(layover: string | null | undefined): string {
  const s = hubLayoverRawText(layover);
  if (!s.length) return "—";
  return s.split(/\s+/).filter(Boolean).join(" · ");
}

/** Open Time / Tradeboard list rows only — no layover shows as TURN instead of em dash. */
export function hubLayoverDisplayForHubListRow(layover: string | null | undefined): string {
  const s = hubLayoverRawText(layover);
  if (!s.length) return "TURN";
  return s.split(/\s+/).filter(Boolean).join(" · ");
}
