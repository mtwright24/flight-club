/**
 * FLICA-specific OCR salvage: never treat as "empty" if schedule-evidence tokens exist.
 */

const EVIDENCE =
  /\b(J[A-Z0-9]{3,6}\s*[:/.]?\s*(?:\d{1,2}\s*[A-Za-z]{3}|\d{1,2}\/\d{1,2})|BSE\s*REPT|Base\/Equip|DPS[- ]?ARS|FLTNO|D-END|T\.?\s*A\.?\s*F\.?\s*B|Operates|ONLY\s+ON|EXCEPT\s+ON|flica\.net)\b/i;

/** Month / product cues when Vision returns a tiny fragment (still worth salvage, not “empty”). */
const EVIDENCE_SHORT = /\b(J[A-Z0-9]{3,5}|FLICA|JetBlue|jetblue\.flica|April\s+Schedule|January\s+Schedule|Block\b.*\bCredit|DY\s+DD\s+DHC)\b/i;

/** True if fragmented OCR still contains enough to attempt pairing salvage. */
export function flicaOcrHasScheduleEvidence(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  if (EVIDENCE.test(t)) return true;
  if (t.length < 48 && EVIDENCE_SHORT.test(t)) return true;
  return false;
}

/** Issue codes for classification_json / debugging */
export type FlicaOcrIssueCode =
  | 'BODY_OCR_EMPTY_BUT_MONTH_FOUND'
  | 'FULL_IMAGE_OCR_TOO_WEAK'
  | 'CROPPED_BODY_OCR_PARTIAL'
  | 'PAIRING_HEADER_SALVAGE_USED'
  | 'PARTIAL_PAIRING_PARSE_ONLY'
  | 'ZERO_RESULT_SHOULD_HAVE_BEEN_PARTIAL'
  | 'FLICA_MULTI_PASS_MERGED';

export function pickOcrIssueCodes(params: {
  mergedLen: number;
  monthDetected: boolean;
  evidenceFound: boolean;
  multiPass: boolean;
  salvageParserUsed: boolean;
}): FlicaOcrIssueCode[] {
  const out: FlicaOcrIssueCode[] = [];
  if (params.multiPass) out.push('FLICA_MULTI_PASS_MERGED');
  if (params.mergedLen < 80 && params.monthDetected && params.evidenceFound) {
    out.push('FULL_IMAGE_OCR_TOO_WEAK');
    out.push('CROPPED_BODY_OCR_PARTIAL');
  }
  if (params.mergedLen < 40 && params.monthDetected) out.push('BODY_OCR_EMPTY_BUT_MONTH_FOUND');
  if (params.salvageParserUsed) out.push('PAIRING_HEADER_SALVAGE_USED');
  return out;
}
