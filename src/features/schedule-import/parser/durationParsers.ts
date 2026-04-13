/**
 * Parse FLICA duration tokens as HHMM minutes (block / credit / duty totals).
 * Examples: 4039 → 40*60+39, 0055 → 55, 0117 → 77.
 */

export function parseHhmmDurationMinutes(token: string | null | undefined): number | null {
  if (token == null || typeof token !== 'string') return null;
  const s = token.replace(/\D/g, '');
  if (s.length < 2 || s.length > 4) return null;
  const padded = s.padStart(4, '0').slice(-4);
  const hh = Number(padded.slice(0, 2));
  const mm = Number(padded.slice(2, 4));
  if (hh > 99 || mm > 59) return null;
  return hh * 60 + mm;
}
