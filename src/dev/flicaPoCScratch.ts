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
};

let scratch: FlicaPoCScratchPayload | null = null;

export function setFlicaPoCScratch(p: FlicaPoCScratchPayload): void {
  scratch = p;
}

export function consumeFlicaPoCScratch(): FlicaPoCScratchPayload | null {
  const s = scratch;
  scratch = null;
  return s;
}

export function peekFlicaPoCScratch(): FlicaPoCScratchPayload | null {
  return scratch;
}
