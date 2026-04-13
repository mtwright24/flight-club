/**
 * Stage 3–4: pairing header detection and pairing body grouping.
 * Pairing boundaries drive hierarchy — do not flatten to a single blob.
 */

import { PAIRING_CODE_REGEX } from './constants';
import type { FieldConfidence, ParsedPairingDraft } from '../types';

export type PairingBlock = {
  headerLine: string;
  bodyLines: string[];
  pairingCode: string | null;
};

const emptyConfidence = (): FieldConfidence => ({
  tier: 'low',
  score: null,
  notes: null,
});

/**
 * Split OCR lines into blocks starting at lines that look like "J1007 : 03APR" or leading pairing code.
 */
export function splitPairingBlocks(lines: string[]): PairingBlock[] {
  const blocks: PairingBlock[] = [];
  let current: PairingBlock | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const headerMatch = PAIRING_CODE_REGEX.exec(trimmed);
    const looksLikeHeader =
      headerMatch && (/:/.test(trimmed) || /\b\d{1,2}[A-Z]{3}\b/i.test(trimmed));

    if (looksLikeHeader) {
      if (current) blocks.push(current);
      current = {
        headerLine: trimmed,
        bodyLines: [],
        pairingCode: headerMatch ? headerMatch[1].toUpperCase() : null,
      };
    } else if (current) {
      current.bodyLines.push(trimmed);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

/**
 * Skeleton: map a block to ParsedPairingDraft — full FLICA body parsing lands in duty/segment stages.
 */
export function pairingBlockToDraft(block: PairingBlock): ParsedPairingDraft {
  return {
    pairingCode: block.pairingCode,
    pairingStartDate: null,
    pairingEndDate: null,
    baseCode: null,
    baseReportTimeLocal: null,
    operateWindowText: null,
    operateStartDate: null,
    operateEndDate: null,
    operatePatternText: null,
    equipmentSummary: null,
    totals: {
      blockMinutes: null,
      deadheadMinutes: null,
      creditMinutes: null,
      dutyMinutes: null,
      tafbMinutes: null,
      tripRigMinutes: null,
    },
    deadheadSummaryMinutes: null,
    crewListRaw: null,
    dutyDays: [],
    confidence: emptyConfidence(),
    rawPairingText: [block.headerLine, ...block.bodyLines].join('\n'),
  };
}
