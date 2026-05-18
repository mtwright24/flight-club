/**
 * Latest raw TB_MyRequests.cgi HTML from native fetch or WebView capture.
 * Used by {@link resolveMyRequestReqIdForPost} when list rows lack reqId.
 */

export type MyRequestsHtmlSource = "native_fetch" | "webview_capture" | "unknown";

type Stored = {
  html: string;
  source: MyRequestsHtmlSource;
  storedAt: string;
  url: string;
};

let latest: Stored | null = null;

export function setLatestMyRequestsRawHtml(
  html: string,
  source: MyRequestsHtmlSource,
  url = "",
): void {
  const h = String(html ?? "").trim();
  if (!h.length) return;
  latest = {
    html: h,
    source,
    storedAt: new Date().toISOString(),
    url: String(url ?? "").trim(),
  };
}

export function getLatestMyRequestsRawHtml(): Stored | null {
  if (!latest?.html?.length) return null;
  return latest;
}

export function clearLatestMyRequestsRawHtml(): void {
  latest = null;
}
