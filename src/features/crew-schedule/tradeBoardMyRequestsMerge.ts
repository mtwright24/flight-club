import { parseTradeboardMyRequestsActionsFromHtml } from "../flica-actions/flicaTradeBoardMyRequestsActions";
import {
  applyMyRequestFieldsToPost,
  extractMyRequestActionsFromRowHtml,
} from "../flica-actions/flicaTradeBoardMyRequestsRowParse";
import type { TradeboardMyRequestActionRow } from "../flica-actions/flicaTradeBoardPostRequestTypes";
import type { TradeboardPost } from "./flicaCrewHubTypes";

function postAlreadyHasMyRequestActions(p: TradeboardPost): boolean {
  return Boolean(
    p.reqId?.trim() ||
      p.myRequest?.reqId?.trim() ||
      p.editUrl?.trim() ||
      p.deleteUrl?.trim() ||
      p.canEdit ||
      p.canDelete,
  );
}

/** Fallback: merge global action rows when unified row parse did not attach reqId. */
export function attachMyRequestActionsToPostsFallback(
  posts: TradeboardPost[],
  actionRows: TradeboardMyRequestActionRow[],
): TradeboardPost[] {
  if (!actionRows.length) return posts;

  return posts.map((p) => {
    if (postAlreadyHasMyRequestActions(p)) return p;

    const rid = (p.myRequest?.reqId ?? p.reqId ?? "").trim();
    const row = rid ? actionRows.find((r) => r.reqId === rid) : undefined;
    if (!row?.reqId) return p;

    const actions = extractMyRequestActionsFromRowHtml(
      `${row.editUrl} ${row.deleteUrl} reqId=${row.reqId}`,
    );
    actions.reqId = row.reqId;
    actions.editUrl = row.editUrl || actions.editUrl;
    actions.deleteUrl = row.deleteUrl || actions.deleteUrl;
    actions.editRequestId = row.reqId;
    actions.deleteRequestId = row.reqId;
    actions.hasEdit = Boolean(actions.editUrl || actions.reqId);
    actions.hasDelete = Boolean(actions.deleteUrl || actions.reqId);

    return applyMyRequestFieldsToPost(p, actions, p.rawText);
  });
}

/** Attach reqId/edit/delete from stored My Requests HTML after native fetch. */
export function enrichMyRequestsPostsWithStoredHtml(
  posts: TradeboardPost[],
  html: string,
): TradeboardPost[] {
  const h = String(html ?? "").trim();
  if (!h.length || !posts.length) return posts;

  const actionRows = parseTradeboardMyRequestsActionsFromHtml(h).rows;
  return attachMyRequestActionsToPostsFallback(posts, actionRows);
}
