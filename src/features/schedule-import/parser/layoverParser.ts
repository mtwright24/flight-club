/**
 * Stage 7: layover / hotel lines — FD, PLAYOVER, hotel names (conservative extraction).
 */

import type { FieldConfidence, ParsedLayoverDraft } from '../types';

const HOTEL_HINT = /\b(HOTEL|INN|SUITES|HYATT|HILTON|MARRIOTT)\b/i;

export function lineMightBeLayover(line: string): boolean {
  return /\b(FD|PLAYOVER|LAYOVER|D-END|R\/N|REPT)\b/i.test(line) || HOTEL_HINT.test(line);
}

export function lineToLayoverDraft(line: string): ParsedLayoverDraft | null {
  if (!lineMightBeLayover(line)) return null;
  return {
    stationCode: null,
    hotelName: HOTEL_HINT.test(line) ? line.trim() : null,
    arrivalContextTimeLocal: null,
    releaseTimeLocal: null,
    nextReportTimeLocal: null,
    notes: null,
    confidence: { tier: 'low', score: null, notes: 'Heuristic layover detection' },
    rawLayoverText: line,
  };
}
