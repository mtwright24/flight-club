/**
 * Stage 5: duty day grouping using DOW + DD markers (MO 06, FR 03, …).
 */

import { DUTY_DAY_MARKER_REGEX } from './constants';
import type { FieldConfidence, ParsedDutyDayDraft, ParsedSegmentDraft } from '../types';

const emptyConf = (): FieldConfidence => ({ tier: 'low', score: null, notes: null });

export function splitDutyDaySections(lines: string[]): string[][] {
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (DUTY_DAY_MARKER_REGEX.test(t)) {
      if (current.length) sections.push(current);
      current = [t];
    } else if (current.length) {
      current.push(t);
    }
  }
  if (current.length) sections.push(current);
  return sections;
}

/** Skeleton duty day — wire segment parser per section. */
export function linesToDutyDayDraft(sectionLines: string[], sequenceIndex: number): ParsedDutyDayDraft {
  const head = sectionLines[0] ?? '';
  const dow = DUTY_DAY_MARKER_REGEX.exec(head);
  return {
    dutyDate: null,
    dayOfWeek: dow ? dow[1].toUpperCase() : null,
    sequenceIndex,
    dutyEndTimeLocal: null,
    nextReportTimeLocal: null,
    overnightStation: null,
    layoverHotelName: null,
    releaseContextText: null,
    notes: null,
    segments: [] as ParsedSegmentDraft[],
    layovers: [],
    confidence: emptyConf(),
    rawDutyText: sectionLines.join('\n'),
  };
}
