/**
 * My Requests multi-row parse — reqId is canonical identity; never collapse by pairing/date.
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import type { TradeboardPost } from "../crew-schedule/flicaCrewHubTypes";

export const LOG_MULTIROW = "FC_TB_MULTIROW_PARSE_RESULT";
export const LOG_TAB_ISOLATION = "FC_TB_TAB_ISOLATION_DEBUG";

function postReqId(p: TradeboardPost): string {
  return (p.myRequest?.reqId ?? p.reqId ?? "").trim();
}

export function myRequestPostDedupeKey(p: TradeboardPost): string {
  const reqId = postReqId(p);
  if (reqId) return `req:${reqId}`;
  return `post:${p.id}`;
}

function postCompleteness(p: TradeboardPost): number {
  let n = 0;
  if (postReqId(p)) n += 8;
  if (p.reportTime?.trim()) n += 4;
  if (p.departTime?.trim()) n += 2;
  if (p.pairingId?.trim()) n += 1;
  if (p.postedAtLabel?.trim() || p.postedAt?.trim()) n += 1;
  if (p.comments?.trim()) n += 1;
  return n;
}

/** Keep one post per reqId (most complete wins). Drops rows without reqId (not valid My Requests). */
export function mergeMyRequestsPostsByReqId(posts: TradeboardPost[]): TradeboardPost[] {
  const map = new Map<string, TradeboardPost>();
  for (const p of posts) {
    const reqId = postReqId(p);
    if (!reqId) continue;
    const existing = map.get(reqId);
    if (!existing || postCompleteness(p) > postCompleteness(existing)) {
      map.set(reqId, p);
    }
  }
  return [...map.values()];
}

export type TabIsolationDebugLog = {
  sourceTab: string;
  fetchedRowCount: number;
  parsedRowCount: number;
  renderedRowCount: number;
  syntheticRowCount: number;
  dedupedRowCount: number;
  reqIds: string[];
  pairingIds: string[];
  parseMode?: string;
};

export function logFcTbTabIsolationDebug(log: TabIsolationDebugLog): void {
  fcDevMirrorScheduleLogToFile(LOG_TAB_ISOLATION, log);
  if (__DEV__) {
    console.log(`[${LOG_TAB_ISOLATION}]`, JSON.stringify(log));
  }
}

export type MultirowParseLog = {
  detectedRowCount: number;
  renderedRowCount: number;
  reqIds: string[];
  pairingIds: string[];
  suppressedRowCount: number;
  mode?: string;
  tableRowCount?: number;
};

export function logFcTbMultirowParseResult(log: MultirowParseLog): void {
  fcDevMirrorScheduleLogToFile(LOG_MULTIROW, log);
  if (__DEV__) {
    console.log(`[${LOG_MULTIROW}]`, JSON.stringify(log));
  }
}

/** HTML slice around EditRequest(reqId) / DeleteMe=reqId for row-level action extraction. */
export function findHtmlContextForReqId(html: string, reqId: string): string {
  const h = String(html ?? "");
  const id = String(reqId ?? "").trim();
  if (!id || !h.length) return h.slice(0, 4000);

  const idx = h.search(
    new RegExp(
      `EditRequest\\s*\\(\\s*${id}\\s*\\)|DeleteRequest\\s*\\(\\s*${id}\\s*,|DeleteMe\\s*=\\s*${id}\\b|reqId\\s*=\\s*${id}\\b|del${id}\\b`,
      "i",
    ),
  );
  if (idx >= 0) {
    return h.slice(Math.max(0, idx - 700), Math.min(h.length, idx + 4500));
  }
  return h.slice(0, Math.min(h.length, 6000));
}

/** Match a desktop plain-text block back to its HTML row for per-row reqId/actions. */
export function findDesktopBlockHtmlContext(
  fullHtml: string,
  block: string,
  post: Pick<TradeboardPost, "type" | "pairingId" | "pairingDateLabel">,
): string {
  const h = String(fullHtml ?? "");
  const pid = post.pairingId.trim().toUpperCase();
  const date = post.pairingDateLabel.trim().toUpperCase();
  if (!pid || !date) return block;

  const typeLead =
    post.type === "drop"
      ? "Drop"
      : post.type === "trade_drop"
        ? "Trade\\s*\\/\\s*Drop"
        : post.type === "trade"
          ? "Trade"
          : post.type === "pickup"
            ? "Pickup"
            : "(?:Drop|Trade\\s*\\/\\s*Drop|Trade|Pickup)";

  const rowRe = new RegExp(
    `(?:Edit\\s+Delete\\s+)?${typeLead}\\s+${pid}\\s*(?::|&#58;|&#x3A;|&colon;)?\\s*${date.replace(/([A-Z]{3})/i, "$1")}`,
    "i",
  );
  const m = rowRe.exec(h);
  if (m?.index != null) {
    return h.slice(Math.max(0, m.index - 200), Math.min(h.length, m.index + 5000));
  }

  const plainNeedle = collapseWs(block).slice(0, 72);
  if (plainNeedle.length >= 24) {
    const esc = plainNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const pm = new RegExp(esc, "i").exec(h);
    if (pm?.index != null) {
      return h.slice(Math.max(0, pm.index - 200), Math.min(h.length, pm.index + 5000));
    }
  }
  return block;
}

function collapseWs(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}
