/**
 * Extract 3-letter IATA station codes from a line (conservative).
 */

const STATION = /\b([A-Z]{3})\b/g;

export function extractStationCodes(line: string, max = 20): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(STATION.source, 'g');
  while ((m = re.exec(line)) !== null) {
    const code = m[1];
    if (!out.includes(code)) out.push(code);
    if (out.length >= max) break;
  }
  return out;
}

/** Single station token if the whole string is a 3-letter code. */
export function parseStationToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const t = token.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(t) ? t : null;
}
