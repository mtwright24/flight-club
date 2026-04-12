/**
 * FLICA / monthly-table noise stripping — reusable preprocessor for any FLICA-* template.
 */

const NOISE_LINE = /^(last\s+updated|pto\s+hours|refrigerator\s+list|©|copyright)/i;

/** Column header / chrome lines — not schedule rows. */
function isFlicaChromeLine(t: string): boolean {
  if (/^DY\s+DD\s+DHC/i.test(t)) return true;
  if (/^pairing\s*$/i.test(t)) return true;
  if (/jetblue\.flica/i.test(t)) return true;
  return false;
}

export function preprocessFlicaMonthly(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line.replace(/\s+/g, ' ').trim();
    if (t.length < 2) continue;
    if (NOISE_LINE.test(t)) continue;
    if (isFlicaChromeLine(t)) continue;
    out.push(t);
  }
  return out.join('\n');
}
