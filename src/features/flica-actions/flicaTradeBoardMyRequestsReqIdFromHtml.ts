/**
 * Pure HTML → reqId resolution (no native fetch / WebView).
 */

import type { TradeboardPost } from "../crew-schedule/flicaCrewHubTypes";
import {
  parseTradeboardMyRequestsActionsFromHtml,
  tradeboardEditRequestUrl,
  tradeboardMyRequestDeleteUrl,
} from "./flicaTradeBoardMyRequestsActions";
import { collectReqIdsFromMyRequestsOnclick } from "./flicaTradeBoardMyRequestsOnclickReqId";
import {
  applyMyRequestFieldsToPost,
  extractMyRequestActionsFromRowHtml,
  tradeboardPostMyRequestReqId,
  type MyRequestRowActions,
} from "./flicaTradeBoardMyRequestsRowParse";

export function collectReqIdsFromMyRequestsHtml(html: string): string[] {
  const h = String(html ?? "");
  const set = new Set<string>();
  for (const m of h.matchAll(/(?:reqId|DeleteMe)\s*=\s*(\d+)/gi)) {
    const id = m[1]?.trim();
    if (id) set.add(id);
  }
  for (const m of h.matchAll(/\bname\s*=\s*["']del(\d+)["']/gi)) {
    const id = m[1]?.trim();
    if (id) set.add(id);
  }
  for (const id of collectReqIdsFromMyRequestsOnclick(h)) {
    set.add(id);
  }
  return [...set];
}

/** Split reqId sources for resolver logs. */
export function collectReqIdsFromMyRequestsHtmlDetailed(html: string): {
  all: string[];
  reqIdsFromOnclick: string[];
} {
  const h = String(html ?? "");
  const reqIdsFromOnclick = collectReqIdsFromMyRequestsOnclick(h);
  return {
    all: collectReqIdsFromMyRequestsHtml(h),
    reqIdsFromOnclick,
  };
}

function pairingTokenForPost(post: TradeboardPost): string {
  const pid = post.pairingId.trim().toUpperCase();
  const date = post.pairingDateLabel.trim().toUpperCase();
  if (!pid) return "";
  return date ? `${pid}:${date}` : pid;
}

/** Search HTML for reqId tied to this post (pairing window + action table parse). */
export function resolveReqIdFromMyRequestsHtml(
  post: TradeboardPost,
  html: string,
  visiblePosts?: TradeboardPost[],
): MyRequestRowActions | null {
  const h = String(html ?? "").trim();
  if (!h.length) return null;

  const existing = tradeboardPostMyRequestReqId(post);
  if (existing) {
    return {
      reqId: existing,
      editRequestId: existing,
      deleteRequestId: existing,
      editUrl: post.editUrl ?? tradeboardEditRequestUrl(existing),
      deleteUrl: post.deleteUrl ?? tradeboardMyRequestDeleteUrl(existing),
      hasEdit: true,
      hasDelete: true,
      treq: post.myRequest?.treq ?? "",
    };
  }

  const allReqIds = collectReqIdsFromMyRequestsHtml(h);
  const visible = visiblePosts ?? [post];

  if (allReqIds.length === 1 && visible.length === 1) {
    const reqId = allReqIds[0]!;
    return {
      reqId,
      editRequestId: reqId,
      deleteRequestId: reqId,
      editUrl: tradeboardEditRequestUrl(reqId),
      deleteUrl: tradeboardMyRequestDeleteUrl(reqId),
      hasEdit: true,
      hasDelete: true,
      treq: "",
    };
  }

  const actionRows = parseTradeboardMyRequestsActionsFromHtml(h).rows;
  const pid = post.pairingId.trim().toUpperCase();
  const date = post.pairingDateLabel.trim().toUpperCase();

  if (pid && actionRows.length) {
    let row =
      actionRows.find(
        (r) =>
          r.pairingId.toUpperCase() === pid &&
          (!date || !r.dateLabel || r.dateLabel.toUpperCase() === date),
      ) ?? actionRows.find((r) => r.pairingId.toUpperCase() === pid);
    if (!row && visible.length === 1 && actionRows.length === 1) {
      row = actionRows[0]!;
    }
    if (row?.reqId) {
      return extractMyRequestActionsFromRowHtml(
        `${row.editUrl} ${row.deleteUrl} reqId=${row.reqId}`,
      );
    }
  }

  const token = pairingTokenForPost(post);
  if (token) {
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const idx = h.search(new RegExp(esc.replace(":", "\\s*(?::|&#58;)?\\s*"), "i"));
    const ctx =
      idx >= 0
        ? h.slice(Math.max(0, idx - 600), Math.min(h.length, idx + 4000))
        : h;
    const actions = extractMyRequestActionsFromRowHtml(ctx);
    if (actions.reqId) return actions;
  }

  if (allReqIds.length === 1 && visible.some((p) => p.id === post.id)) {
    const reqId = allReqIds[0]!;
    return {
      reqId,
      editRequestId: reqId,
      deleteRequestId: reqId,
      editUrl: tradeboardEditRequestUrl(reqId),
      deleteUrl: tradeboardMyRequestDeleteUrl(reqId),
      hasEdit: true,
      hasDelete: true,
      treq: "",
    };
  }

  return null;
}

export function applyResolvedReqIdToPost(
  post: TradeboardPost,
  actions: MyRequestRowActions,
  rawHtml = "",
): TradeboardPost {
  if (!actions.reqId) return post;
  return applyMyRequestFieldsToPost(post, actions, rawHtml);
}
