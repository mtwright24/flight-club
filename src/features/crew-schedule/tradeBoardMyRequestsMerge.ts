import type { TradeboardMyRequestActionRow } from "../flica-actions/flicaTradeBoardPostRequestTypes";
import type { TradeboardPost } from "./flicaCrewHubTypes";

/** Attach parsed FLICA edit/delete metadata to hub My Requests rows. */
export function attachMyRequestActionsToPosts(
  posts: TradeboardPost[],
  actionRows: TradeboardMyRequestActionRow[],
): TradeboardPost[] {
  if (!actionRows.length) return posts;

  return posts.map((p) => {
    const pid = p.pairingId.trim().toUpperCase();
    const date = p.pairingDateLabel.trim().toUpperCase();
    const row =
      actionRows.find(
        (r) =>
          r.pairingId === pid &&
          (!date || !r.dateLabel || r.dateLabel.toUpperCase() === date),
      ) ?? actionRows.find((r) => r.pairingId === pid);
    if (!row) return p;
    return { ...p, myRequest: row };
  });
}
