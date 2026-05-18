/**
 * Async resolver: post → stored HTML → native fetch → hidden WebView DOM capture.
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import type { TradeboardPost } from "../crew-schedule/flicaCrewHubTypes";
import {
  FLICA_NATIVE_URLS,
  refreshTradeboardMyRequestsTargeted,
} from "./flicaActionsNativeService";
import {
  getLatestMyRequestsRawHtml,
  setLatestMyRequestsRawHtml,
} from "./flicaTradeBoardMyRequestsHtmlStore";
import { parseTradeboardMyRequestsActionsFromHtml } from "./flicaTradeBoardMyRequestsActions";
import {
  applyResolvedReqIdToPost,
  collectReqIdsFromMyRequestsHtml,
  collectReqIdsFromMyRequestsHtmlDetailed,
  resolveReqIdFromMyRequestsHtml,
} from "./flicaTradeBoardMyRequestsReqIdFromHtml";
import { tradeboardPostMyRequestReqId } from "./flicaTradeBoardMyRequestsRowParse";
import {
  myRequestsHtmlHasActionMarkers,
  requestTbMyRequestsWebViewCapture,
} from "./flicaTradeBoardMyRequestsWebViewCaptureBridge";

export type MyRequestReqIdResolveSource =
  | "post"
  | "stored_html"
  | "native_fetch"
  | "webview_capture";

export type MyRequestReqIdResolveResult =
  | { ok: true; post: TradeboardPost; reqId: string; source: MyRequestReqIdResolveSource }
  | { ok: false; post: TradeboardPost; error: string };

export {
  applyResolvedReqIdToPost,
  collectReqIdsFromMyRequestsHtml,
  resolveReqIdFromMyRequestsHtml,
} from "./flicaTradeBoardMyRequestsReqIdFromHtml";

function logResolve(tag: string, payload: Record<string, unknown>): void {
  fcDevMirrorScheduleLogToFile(tag, payload);
  if (__DEV__) {
    console.log(`[${tag}]`, JSON.stringify(payload));
  }
}

async function tryResolveFromHtml(
  post: TradeboardPost,
  html: string,
  source: MyRequestReqIdResolveSource,
  visiblePosts?: TradeboardPost[],
): Promise<MyRequestReqIdResolveResult | null> {
  const actions = resolveReqIdFromMyRequestsHtml(post, html, visiblePosts);
  if (!actions?.reqId) return null;
  const enriched = applyResolvedReqIdToPost(post, actions, html);
  const idDetail = collectReqIdsFromMyRequestsHtmlDetailed(html);
  logResolve("FC_TB_MY_REQUEST_REQID_RESOLVED", {
    source,
    reqId: actions.reqId,
    pairingId: post.pairingId,
    pairingDateLabel: post.pairingDateLabel,
    htmlLength: html.length,
    actionMarker: myRequestsHtmlHasActionMarkers(html),
    reqIdsFromOnclick: idDetail.reqIdsFromOnclick,
  });
  return { ok: true, post: enriched, reqId: actions.reqId, source };
}

/** Resolve FLICA reqId for a My Requests row (post → stored HTML → native fetch → WebView DOM). */
export async function resolveMyRequestReqIdForPost(
  post: TradeboardPost,
  opts?: { visiblePosts?: TradeboardPost[] },
): Promise<MyRequestReqIdResolveResult> {
  const visiblePosts = opts?.visiblePosts;

  logResolve("FC_TB_MY_REQUEST_REQID_RESOLVE_START", {
    pairingId: post.pairingId,
    pairingDateLabel: post.pairingDateLabel,
    postReqId: tradeboardPostMyRequestReqId(post),
    visibleCount: visiblePosts?.length ?? 1,
  });

  const existing = tradeboardPostMyRequestReqId(post);
  if (existing) {
    logResolve("FC_TB_MY_REQUEST_REQID_RESOLVED", {
      source: "post",
      reqId: existing,
      pairingId: post.pairingId,
    });
    return { ok: true, post, reqId: existing, source: "post" };
  }

  const stored = getLatestMyRequestsRawHtml();
  if (stored?.html) {
    const fromStored = await tryResolveFromHtml(
      post,
      stored.html,
      "stored_html",
      visiblePosts,
    );
    if (fromStored) return fromStored;
  }

  try {
    const { fetch } = await refreshTradeboardMyRequestsTargeted();
    const nativeHtml = String(fetch.pageHtml ?? "");
    setLatestMyRequestsRawHtml(nativeHtml, "native_fetch", fetch.url);

    const actionParse = parseTradeboardMyRequestsActionsFromHtml(nativeHtml);
    const nativeIds = collectReqIdsFromMyRequestsHtmlDetailed(nativeHtml);
    logResolve("FC_TB_MY_REQUEST_REQID_NATIVE_HTML_RESULT", {
      ok: fetch.ok,
      htmlLength: nativeHtml.length,
      htmlState: fetch.htmlState,
      actionRowCount: actionParse.rows.length,
      reqIdsInHtml: nativeIds.all,
      reqIdsFromOnclick: nativeIds.reqIdsFromOnclick,
      hasActionMarkers: myRequestsHtmlHasActionMarkers(nativeHtml),
    });

    const fromNative = await tryResolveFromHtml(
      post,
      nativeHtml,
      "native_fetch",
      visiblePosts,
    );
    if (fromNative) return fromNative;
  } catch (e) {
    logResolve("FC_TB_MY_REQUEST_REQID_NATIVE_HTML_RESULT", {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  logResolve("FC_TB_MY_REQUEST_REQID_WEBVIEW_CAPTURE_START", {
    targetUrl: FLICA_NATIVE_URLS.tradeMyRequests,
  });

  try {
    const cap = await requestTbMyRequestsWebViewCapture({
      targetUrl: FLICA_NATIVE_URLS.tradeMyRequests,
      frameWarmupUrl: FLICA_NATIVE_URLS.tradeFrame,
      timeoutMs: 55_000,
    });
    setLatestMyRequestsRawHtml(cap.html, "webview_capture", cap.finalUrl);

    const capIds = collectReqIdsFromMyRequestsHtmlDetailed(cap.html);
    logResolve("FC_TB_MY_REQUEST_REQID_WEBVIEW_CAPTURE_RESULT", {
      ok: cap.ready || cap.htmlLength > 800,
      htmlLength: cap.htmlLength,
      captureFrameCount: cap.captureFrameCount,
      reqIdsInHtml: capIds.all,
      reqIdsFromOnclick: capIds.reqIdsFromOnclick,
      hasActionMarkers: myRequestsHtmlHasActionMarkers(cap.html),
      finalUrl: cap.finalUrl,
    });

    const fromWebView = await tryResolveFromHtml(
      post,
      cap.html,
      "webview_capture",
      visiblePosts,
    );
    if (fromWebView) return fromWebView;
  } catch (e) {
    logResolve("FC_TB_MY_REQUEST_REQID_WEBVIEW_CAPTURE_RESULT", {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const err =
    "Could not resolve FLICA request id from My Requests HTML (native fetch and WebView capture). Pull to refresh FLICA, then try again.";

  logResolve("FC_TB_MY_REQUEST_REQID_FAILED", {
    pairingId: post.pairingId,
    pairingDateLabel: post.pairingDateLabel,
    storedHtmlLength: stored?.html?.length ?? 0,
    message: err,
  });

  return { ok: false, post, error: err };
}
