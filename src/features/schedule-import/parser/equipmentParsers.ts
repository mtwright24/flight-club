/**
 * Equipment codes (OAEQP column / leg): 32S, 3NL, 325, etc. — preserve as-is.
 */

const EQUIP_TOKEN = /\b(\d[A-Z0-9]{2}|[A-Z]\d{2,3})\b/g;

export function extractEquipmentTokens(line: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(EQUIP_TOKEN.source, 'g');
  while ((m = re.exec(line)) !== null) {
    const tok = m[1];
    if (!out.includes(tok)) out.push(tok);
  }
  return out;
}

export function isLikelyEquipmentCode(s: string): boolean {
  return /^(\d[A-Z0-9]{2}|[A-Z]\d{2,3}|\d{3})$/.test(s.trim());
}
