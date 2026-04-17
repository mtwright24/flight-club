/**
 * TEMP PoC — in-memory handoff between flica-test WebView and flica-review.
 * Avoids huge URL params. Remove with FLICA PoC routes.
 */
export type FlicaPoCScratchPayload = {
  rawText: string;
  lastUrl: string;
  capturedAt: number;
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
