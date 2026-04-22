/**
 * TEMP PoC — in-memory handoff between flica-test and flica-review.
 * Supports WebView legacy fields and HTTP fetch-based schedule capture.
 */
import type { FlicaPoCPageKind } from './flicaPoCPageDetect';

export type FlicaPoCScratchPageKind = FlicaPoCPageKind | 'fetch_schedule' | 'native_cookie_capture';

export type FlicaPoCScratchPayload = {
  rawText: string;
  lastUrl: string;
  capturedAt: number;
  documentTitle: string;
  textLength: number;
  extractionStrategy: string;
  primaryStrategy?: string;
  mergedFrom?: string;
  pageKind: FlicaPoCScratchPageKind;
  extractionErrors?: string[];
  /** When text extraction is weak or page is PDF/embed (legacy WebView path) */
  screenshotFallbackUri?: string;
  screenshotFallbackLabel?: string;
  /** HTTP fetch PoC: table column hints found in plain text */
  scheduleHintsOk?: boolean;
  /** Direct scheduledetail fetch */
  httpStatus?: number;
  responseFinalUrl?: string;
  scheduleKeywordHints?: {
    PAIRING: boolean;
    REPORT: boolean;
    JFK: boolean;
    LHR: boolean;
  };
  /** Step-1 scheduledetail ("Updating schedule") HTML when GO=1 multi-month flow ran */
  step1ScheduledetailHtml?: string;
  /** Mar / Apr / May GO=1 fetches after step-1 */
  multiMonthSchedule?: Array<{
    blockDate: string;
    monthLabel: string;
    httpStatus: number;
    finalUrl: string;
    html: string;
    hints: { PAIRING: boolean; REPORT: boolean; JFK: boolean; LHR: boolean };
  }>;
  /** First 3000 chars of April (0426) real schedule HTML */
  aprilPreview3000?: string;
};

let scratch: FlicaPoCScratchPayload | null = null;
/** One-time duplicate of last consumed handoff for React 18 Strict Mode (mount → unmount → remount) */
let _scratchRepeatForStrict: FlicaPoCScratchPayload | null = null;

export function setFlicaPoCScratch(p: FlicaPoCScratchPayload): void {
  scratch = p;
  _scratchRepeatForStrict = null;
}

/**
 * Pops the handoff. On the next call (e.g. second mount in dev Strict Mode) returns the same payload again once,
 * then null — so flica-review's second initializer still receives data. Third call: null. New setFlica clears the stash.
 */
export function consumeFlicaPoCScratch(): FlicaPoCScratchPayload | null {
  if (scratch) {
    const s = scratch;
    scratch = null;
    _scratchRepeatForStrict = s;
    return s;
  }
  if (_scratchRepeatForStrict) {
    const s = _scratchRepeatForStrict;
    _scratchRepeatForStrict = null;
    return s;
  }
  return null;
}

export function peekFlicaPoCScratch(): FlicaPoCScratchPayload | null {
  return scratch;
}
