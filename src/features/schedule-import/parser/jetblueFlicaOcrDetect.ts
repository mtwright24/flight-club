/**
 * Heuristic: JetBlue FLICA monthly line-view screenshot (dense pairing blocks).
 * Used to route generic schedule imports away from one-line-per-OCR candidates.
 *
 * Phone screenshots of jetblue.flica.net often OCR as noisy text; keep patterns loose.
 */

/** Pairing codes: J1016, JC58, J3C58 — not only J\d+. Detail view uses ddMMM; list view often M/D. OCR may drop `:` or use `/`. */
const FLICA_PAIRING_HEAD = /\bJ[A-Z0-9]{3,6}\s*[:/.]?\s*\d{1,2}\s*[A-Za-z]{3}\b/gi;
const FLICA_PAIRING_HEAD_SLASH = /\bJ[A-Z0-9]{3,6}\s*[:/.]?\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi;

function pairHeadCount(text: string): number {
  const a = text.match(FLICA_PAIRING_HEAD)?.length ?? 0;
  const b = text.match(FLICA_PAIRING_HEAD_SLASH)?.length ?? 0;
  return a + b;
}

/** Broad FLICA / JetBlue screenshot (URL + product name, or FLICA table columns). */
export function looksLikeFlicaRawText(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.slice(0, 120_000);
  if (/\bflica\.net\b/i.test(t)) return true;
  if (/\bFLICA\b/i.test(t) && /\bJ[A-Z0-9]{3,6}\s*[:/.]?\s*\d/i.test(t)) return true;
  if (/DPS[- ]?ARS|ODPS[- ]?ARS/i.test(t)) return true;
  if (/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+Schedule\b/i.test(t) && /\bBlock\b/i.test(t) && /\b(Credit|YTD)\b/i.test(t)) {
    return true;
  }
  if (pairHeadCount(t) >= 1 && /\b(Base\/Equip|BSE\s*REPT|Operates)\b/i.test(t)) return true;
  return false;
}

export function ocrLooksLikeJetBlueFlicaMonthly(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.slice(0, 100_000);

  const pairingHeaders = t.match(FLICA_PAIRING_HEAD);
  if (pairingHeaders && pairingHeaders.length >= 2) return true;

  if (/\bflica\.net\b/i.test(t) && /\bJ[A-Z0-9]{3,6}\s*[:/.]?\s*\d/i.test(t)) return true;
  if (/\bjetblue\b/i.test(t) && /\bflica\b/i.test(t) && /\bJ[A-Z0-9]{3,6}\s*[:/.]?\s*\d/i.test(t)) return true;

  const hasSchedule =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+Schedule\b/i.test(
      t
    );
  const hasBlockCredit =
    /\bBlock\b[\s\S]{0,200}\d+[.:]\d{2}[\s\S]{0,200}\bCredit\b|\bCredit\b[\s\S]{0,200}\d+[.:]\d{2}/i.test(t);
  const hasTableHeader = /DY\s+DD\s+DHC|FLTNO\s+.*DEPL|DPS-ARS|DEPL\s+ARRL/i.test(t);

  if (hasSchedule && hasBlockCredit && hasTableHeader) return true;
  if (hasSchedule && hasTableHeader && pairingHeaders && pairingHeaders.length >= 1) return true;

  return false;
}
