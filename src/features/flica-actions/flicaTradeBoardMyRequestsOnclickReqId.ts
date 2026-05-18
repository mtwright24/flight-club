/**
 * FLICA My Requests — reqId from javascript:void(0) onclick handlers (not href).
 */

const RE_EDIT_REQUEST = /EditRequest\s*\(\s*(\d+)\s*\)/gi;
const RE_DELETE_REQUEST = /DeleteRequest\s*\(\s*(\d+)\s*,/gi;
const RE_GET_NUM_ACTIVE = /GetNumOfActiveResponses\s*\(\s*(\d+)\s*\)/gi;

/** First reqId from a haystack (onclick preferred over href). */
export function extractReqIdFromMyRequestsOnclickHaystack(hay: string): string {
  const h = String(hay ?? "");
  const m =
    /EditRequest\s*\(\s*(\d+)\s*\)/i.exec(h) ??
    /DeleteRequest\s*\(\s*(\d+)\s*,/i.exec(h) ??
    /GetNumOfActiveResponses\s*\(\s*(\d+)\s*\)/i.exec(h);
  return m?.[1]?.trim() ?? "";
}

/** All distinct reqIds from onclick handlers in HTML. */
export function collectReqIdsFromMyRequestsOnclick(html: string): string[] {
  const h = String(html ?? "");
  const set = new Set<string>();
  for (const re of [RE_EDIT_REQUEST, RE_DELETE_REQUEST, RE_GET_NUM_ACTIVE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(h)) !== null) {
      const id = m[1]?.trim();
      if (id) set.add(id);
    }
  }
  return [...set];
}

export function myRequestsHtmlHasOnclickActionHandlers(html: string): boolean {
  const h = String(html ?? "");
  return (
    /EditRequest\s*\(\s*\d+\s*\)/i.test(h) ||
    /DeleteRequest\s*\(\s*\d+\s*,/i.test(h) ||
    /GetNumOfActiveResponses\s*\(\s*\d+\s*\)/i.test(h)
  );
}
