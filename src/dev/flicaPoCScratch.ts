/**
 * TEMP PoC — in-memory handoff between flica-test WebView and flica-review.
 * Avoids huge URL params. Remove with FLICA PoC routes.
 */
import type { FlicaPoCPageKind } from './flicaPoCPageDetect';

export type FlicaPoCScratchPayload = {
  rawText: string;
  lastUrl: string;
  capturedAt: number;
  documentTitle: string;
  textLength: number;
  extractionStrategy: string;
  primaryStrategy?: string;
  mergedFrom?: string;
  pageKind: FlicaPoCPageKind;
  extractionErrors?: string[];
  /** When text extraction is weak or page is PDF/embed */
  screenshotFallbackUri?: string;
  screenshotFallbackLabel?: string;
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
