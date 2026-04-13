/**
 * Stage 6: segment classification — operating flight vs deadhead vs markers.
 * Never hallucinate legs; uncertain → segment_type marker + low confidence.
 */

import type { FieldConfidence, NormalizedSegmentType, ParsedSegmentDraft } from '../types';

const DH_MARKERS = /\b(DH|DEAD\s*HEAD|D\/H)\b/i;

function emptyConf(tier: FieldConfidence['tier'] = 'low', score: number | null = null): FieldConfidence {
  return { tier, score, notes: null };
}

/**
 * Heuristic: if line strongly suggests deadhead, flag isDeadhead.
 * Full FLICA column alignment parsing comes with structured OCR blocks.
 */
export function classifySegmentLine(line: string): {
  segmentType: NormalizedSegmentType;
  isDeadhead: boolean;
} {
  const isDh = DH_MARKERS.test(line);
  if (isDh) return { segmentType: 'deadhead', isDeadhead: true };
  if (/\b\d{3,4}\b/.test(line) && /\b[A-Z]{3}\b.*\b[A-Z]{3}\b/.test(line)) {
    return { segmentType: 'operating_flight', isDeadhead: false };
  }
  return { segmentType: 'marker', isDeadhead: false };
}

export function lineToSegmentDraft(line: string, sequenceIndex: number): ParsedSegmentDraft {
  const c = classifySegmentLine(line);
  return {
    sequenceIndex,
    segmentType: c.segmentType,
    flightNumber: null,
    departureStation: null,
    arrivalStation: null,
    departureTimeLocal: null,
    arrivalTimeLocal: null,
    blockMinutes: null,
    equipmentCode: null,
    layoverStationAfterSegment: null,
    isDeadhead: c.isDeadhead,
    confidence: emptyConf('low'),
    rawSegmentText: line,
  };
}
