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

    const pid = p.pairingId.trim().toUpperCase();
    const date = p.pairingDateLabel.trim().toUpperCase();
    let row =
      actionRows.find(
        (r) =>
          r.pairingId === pid &&
          (!date || !r.dateLabel || r.dateLabel.toUpperCase() === date),
      ) ?? actionRows.find((r) => r.pairingId === pid);

    if (!row && posts.length === 1 && actionRows.length === 1) {
      row = actionRows[0]!;
    }

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
