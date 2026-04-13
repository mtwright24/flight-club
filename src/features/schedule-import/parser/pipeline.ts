/**
 * JetBlue FLICA import pipeline — orchestrates stages 1–8.
 * Input: raw OCR text (+ optional structured blocks later). Output: ParsedScheduleMonthDraft.
 *
 * Rules engine hooks (future):
 * - evaluatePairingRules(pairing, contractContext)
 * - evaluateDutyDayLegality(dutyDay, contractContext)
 * - computeCreditGuarantees(scheduleMonth, contractContext)
 */

import type { FieldConfidence, ParsedScheduleMonthDraft, ParserNote } from '../types';
import { extractMonthlyTotalsFromLines } from './monthlyTotalsParser';
import { pairingBlockToDraft, splitPairingBlocks } from './pairingParser';
import type { ParserIssueCode } from './parserIssues';

export type PipelineInput = {
  rawText: string;
  scheduleYear: number;
  scheduleMonthNumber: number;
};

function fc(tier: FieldConfidence['tier'], score: number | null, notes: string | null): FieldConfidence {
  return { tier, score, notes };
}

function pushIssue(
  notes: ParserNote[],
  code: ParserIssueCode,
  message: string,
  stage: string
): void {
  notes.push({ stage, message, code });
}

/**
 * End-to-end skeleton: splits lines, extracts monthly totals heuristically, groups pairings.
 * Stages 1 (metadata) and deep pairing body parsing are incremental improvements on top.
 */
export function runFlicaPipeline(input: PipelineInput): ParsedScheduleMonthDraft {
  const parserNotes: ParserNote[] = [];
  const lines = input.rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines.length < 3) {
    pushIssue(parserNotes, 'OCR_LOW_CONFIDENCE', 'Very few OCR lines', 'ingest');
  }

  const monthlyTotals = extractMonthlyTotalsFromLines(lines);
  const pairingBlocks = splitPairingBlocks(lines);

  if (pairingBlocks.length === 0) {
    pushIssue(parserNotes, 'PAIRING_HEADER_NOT_CONFIRMED', 'No pairing headers matched', 'pairing');
  }

  const pairings = pairingBlocks.map((b) => pairingBlockToDraft(b));

  return {
    crewMemberName: null,
    employeeId: null,
    scheduleMonthLabel: null,
    scheduleMonthNumber: input.scheduleMonthNumber,
    scheduleYear: input.scheduleYear,
    lastUpdatedAtSource: null,
    monthlyTotals,
    pairings,
    sourceConfidence: fc('medium', 0.5, null),
    rawSnapshotJson: { lineCount: lines.length, pairingBlockCount: pairingBlocks.length },
    parserNotes,
  };
}
