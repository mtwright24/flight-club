import type { OpenTimeTrip, TradeboardPost } from "./flicaCrewHubTypes";

/** FLICA “Application Error” / session init failures that mean the detail URL or session context is stale. */
export function flicaHtmlLooksLikeSessionOrApplicationFailure(html: string): boolean {
  const h = String(html ?? "");
  const u = h.toUpperCase();
  if (/INITIALIZESESSIONDATA\s+FAILED/i.test(h)) return true;
  if (/\bAPPLICATION\s+ERROR\b/i.test(u)) return true;
  if (/SESSION\s*(?:HAS\s*)?EXPIRED/i.test(u)) return true;
  if (/PLEASE\s+LOG\s+IN\s+AGAIN/i.test(u)) return true;
  return false;
}

export function dateYmdFromRbcpairDetailUrl(url: string): string | undefined {
  try {
    const d = new URL(String(url).trim()).searchParams.get("DATE");
    return d && /^\d{8}$/.test(d) ? d : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when the row has enough live FLICA context for **mutating** hub actions (Add / Swap / etc.).
 * Pairing **detail viewing** should not be blocked on this — use {@link resolveCrewHubOpenTimePairingDetailUrl} and fetch first.
 */
export function openTimeTripHasLiveHubActionContext(t: OpenTimeTrip): boolean {
  const url = t.pairingDetailUrl?.trim();
  if (!url || !/\/full\/rbcpair\.cgi/i.test(url)) return false;
  if (t.pairingDetailUrlFromLiveHtml !== true) return false;
  const ymd = t.dateYmd?.trim() || dateYmdFromRbcpairDetailUrl(url);
  if (!ymd || !/^\d{8}$/.test(ymd)) return false;
  const bcid = t.sourceBcid?.trim();
  if (!bcid) return false;
  const potOrFrame = t.sourceOpenTimePotUrl?.trim() || t.sourceOtFrameUrl?.trim();
  if (!potOrFrame) return false;
  if (!t.pairingId?.trim()) return false;
  return true;
}

/** @deprecated Use {@link openTimeTripHasLiveHubActionContext} — name kept for imports; same behavior. */
export const openTimeTripPassesHubLiveMarketplaceGate = openTimeTripHasLiveHubActionContext;

/** True for **mutating** Tradeboard actions; detail viewing may use stored or fallback RBCPair URL. */
export function tradeboardPostHasLiveHubActionContext(p: TradeboardPost): boolean {
  const u = p.pairingDetailUrl?.trim();
  if (!u || !/\/full\/rbcpair\.cgi/i.test(u)) return false;
  if (p.pairingDetailUrlFromLiveHtml !== true) return false;
  return true;
}

/** @deprecated Use {@link tradeboardPostHasLiveHubActionContext}. */
export const tradeboardPostPassesHubLiveMarketplaceGate = tradeboardPostHasLiveHubActionContext;
