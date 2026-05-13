/**
 * Phase 1 FLICA Actions native dev/test layer: GET-only fetches using saved cookies.
 * Does not POST final submits or SubmitBids.
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import {
  fetchFlicaHtmlUsingWebViewSession,
  detectFlicaHtmlState,
} from "./flicaActionsHttp";
import {
  extractHtmlTitle,
  extractTokenFromHtml,
  sanitizedBodyPreview,
} from "./flicaActionsParser";
import { parseFlicaNativePage, summarizeNativeParseForPreview } from "./flicaActionsParsers";
import type { FlicaActionsFetchResult, FlicaNativePageModel } from "./flicaActionsTypes";

const BASE = "https://jetblue.flica.net";

/** TradeBoard BCID (confirmed family). */
export const FLICA_NATIVE_TRADE_BCID = "002.000";
/** OpenTime BCID for frame / pot / request flows. */
export const FLICA_NATIVE_OT_BCID = "029.055";
/** BCID on ottrade / ottrade2 preview URLs per capture. */
export const FLICA_NATIVE_OT_TRADE_BCID = "002.000";

/**
 * Captured working TradeBoard / OpenTime URLs.
 * TradeBoard tabs (My/All/Fav/Responses): WebView session + warm frame, tab Referer = frame URL.
 */
export const FLICA_NATIVE_URLS = {
  tradeFrame: `${BASE}/online/tb_frame.cgi?BCID=${FLICA_NATIVE_TRADE_BCID}&dp=mr`,
  /** My Requests — exact capture (`?&bcid=`). */
  tradeMyRequests: `${BASE}/online/TB_MyRequests.cgi?&bcid=${FLICA_NATIVE_TRADE_BCID}`,
  tradeAllRequests: `${BASE}/online/tb_otherrequests.cgi?bcid=${FLICA_NATIVE_TRADE_BCID}`,
  tradeFavorites: `${BASE}/online/tb_myfavorites.cgi?bcid=${FLICA_NATIVE_TRADE_BCID}`,
  tradeMyResponses: `${BASE}/online/tb_myresponses.cgi?bcid=${FLICA_NATIVE_TRADE_BCID}`,
  tradePostRequest: `${BASE}/online/tb_postrequest.cgi?bcid=${FLICA_NATIVE_TRADE_BCID}`,
  /** GET preview only — used only inside {@link nativeFetchTradeBoardPostRequest}. */
  tradePostRequestFallbackGet: `${BASE}/online/TB_postrequest.cgi?BCID=${FLICA_NATIVE_TRADE_BCID}`,
  otFrameView: `${BASE}/full/otframe.cgi?BCID=${FLICA_NATIVE_OT_BCID}&ViewOT=1`,
  otFrame: `${BASE}/full/otframe.cgi?BCID=${FLICA_NATIVE_OT_BCID}`,
  otRequest: (token: string) =>
    `${BASE}/full/otrequest.cgi?token=${encodeURIComponent(token)}&BCID=${FLICA_NATIVE_OT_BCID}&isInFrame=1`,
  otPot: (token: string) =>
    `${BASE}/full/otopentimepot.cgi?token=${encodeURIComponent(token)}&BCID=${FLICA_NATIVE_OT_BCID}&GO=1`,
  otSwapPreview: `${BASE}/full/otswap.cgi?GO=1&BCID=${FLICA_NATIVE_OT_BCID}&PIDX=0`,
  otTradePreview: `${BASE}/full/ottrade.cgi?BCID=${FLICA_NATIVE_OT_TRADE_BCID}&PIDX=0`,
  otTrade2Preview: `${BASE}/full/ottrade2.cgi?BCID=${FLICA_NATIVE_OT_TRADE_BCID}&PIDX=0`,
  otAddPreview: `${BASE}/full/otadd.cgi?GO=1&BCID=${FLICA_NATIVE_OT_BCID}&PIDX=0`,
  otDropPreview: `${BASE}/full/otdrop.cgi?GO=1&BCID=${FLICA_NATIVE_OT_BCID}&PIDX=0`,
} as const;

const LOG_TAG = "FC_FLICA_ACTIONS_NATIVE_TEST";

/** Referer for first-hop OpenTime native GETs (WebView cookie snapshot). */
const WEBVIEW_TRUSTED_REFERER = BASE;

/** Referer for TradeBoard tab GETs after warm frame (exact capture). */
const TRADEBOARD_TAB_REFERER = FLICA_NATIVE_URLS.tradeFrame;

function logNative(payload: Record<string, unknown>) {
  fcDevMirrorScheduleLogToFile(LOG_TAG, payload);
}

function buildTradeBoardDebug(
  meta: {
    referer: string;
    fallbackUsed: boolean;
    firstRequestedUrl: string;
    finalRequestedUrl: string;
  },
  safeHtml: string,
  nativeParse: NonNullable<FlicaActionsFetchResult["nativeParse"]>,
  title: string | null,
): NonNullable<FlicaActionsFetchResult["nativeTradeBoardFetchDebug"]> {
  const buttons = nativeParse.buttons ?? [];
  const forms = nativeParse.forms ?? [];
  const hidden = nativeParse.hiddenFields ?? [];
  const endpoints = nativeParse.actionEndpoints ?? [];
  return {
    requestedUrl: meta.finalRequestedUrl,
    referer: meta.referer,
    fallbackUsed: meta.fallbackUsed,
    firstRequestedUrl: meta.firstRequestedUrl,
    htmlLength: safeHtml.length,
    title,
    preview300: sanitizedBodyPreview(safeHtml, 300),
    pageType: String(nativeParse.pageType ?? ""),
    buttonsCount: buttons.length,
    formsCount: forms.length,
    hiddenFieldsCount: hidden.length,
    actionEndpointsCount: endpoints.length,
  };
}

function toResult(
  url: string,
  status: number,
  html: string,
  finalUrl: string,
  opts?: {
    error?: string;
    okOverride?: boolean;
    tradeBoardFetchMeta?: {
      referer: string;
      fallbackUsed: boolean;
      firstRequestedUrl: string;
      finalRequestedUrl: string;
    };
  },
): FlicaActionsFetchResult {
  const safeHtml = String(html ?? "");
  const safeFinalUrl = String(finalUrl ?? url ?? "");
  const isEmpty = safeHtml.length === 0;
  const htmlState = detectFlicaHtmlState(safeHtml);
  const nativeParse = parseFlicaNativePage(safeHtml, safeFinalUrl);
  const title = extractHtmlTitle(safeHtml);
  let error = opts?.error;
  if (isEmpty && !error && opts?.tradeBoardFetchMeta) {
    error = `Empty FLICA response. Frame warmup or referer failed.\nrequestedUrl: ${opts.tradeBoardFetchMeta.finalRequestedUrl}\nreferer: ${opts.tradeBoardFetchMeta.referer}`;
  } else if (isEmpty && !error) {
    error = "Empty FLICA response (no HTML body).";
  }
  const preview =
    summarizeNativeParseForPreview(nativeParse) +
    "\n" +
    sanitizedBodyPreview(safeHtml, 450);
  const warnings = nativeParse.warningsErrors ?? [];
  const rows = nativeParse.rows ?? [];
  const endpoints = nativeParse.actionEndpoints ?? [];
  const baseOk =
    !isEmpty &&
    status === 200 &&
    htmlState === "ok" &&
    !error &&
    warnings.length === 0;
  const ok = opts?.okOverride !== undefined ? opts.okOverride : baseOk;
  const nativeTradeBoardFetchDebug = opts?.tradeBoardFetchMeta
    ? buildTradeBoardDebug(opts.tradeBoardFetchMeta, safeHtml, nativeParse, title)
    : undefined;
  return {
    ok,
    url: safeFinalUrl,
    status,
    htmlState,
    htmlLength: safeHtml.length,
    title,
    rowCount: rows.length,
    detectedLinks: endpoints.slice(0, 25),
    bodyPreview: preview,
    nativeParse,
    error,
    nativeTradeBoardFetchDebug,
  };
}

/**
 * Working TradeBoard tab path: FLICA Actions WebView cookie snapshot only (no mainmenu prep).
 * Warms `tb_frame`, then GETs the tab with Referer = frame URL (capture).
 */
async function fetchTradeBoardTabUsingWebViewSession(
  label: string,
  tabUrl: string,
): Promise<FlicaActionsFetchResult> {
  const frameUrl = FLICA_NATIVE_URLS.tradeFrame;
  try {
    const frame = await fetchFlicaHtmlUsingWebViewSession(frameUrl, {
      referer: WEBVIEW_TRUSTED_REFERER,
    });
    const frameHtml = String(frame.html ?? "");
    const frameSt = detectFlicaHtmlState(frameHtml);
    if (frame.status !== 200 || frameSt !== "ok") {
      const r = toResult(
        frameUrl,
        frame.status,
        frameHtml,
        String(frame.url ?? frameUrl),
        {
          error: `TradeBoard frame failed: ${frameSt}`,
          okOverride: false,
        },
      );
      logNative({
        label,
        step: "frame",
        ok: false,
        url: r.url,
        status: r.status,
        htmlState: r.htmlState,
        error: r.error,
      });
      return r;
    }

    const tab = await fetchFlicaHtmlUsingWebViewSession(tabUrl, {
      referer: TRADEBOARD_TAB_REFERER,
    });
    const tabHtml = String(tab.html ?? "");
    const tabFinal = String(tab.url ?? tabUrl);
    const r = toResult(tabUrl, tab.status, tabHtml, tabFinal);
    logNative({
      label,
      ok: r.ok,
      url: r.url,
      pageType: r.nativeParse?.pageType,
      rowCount: r.rowCount,
      warnings: r.nativeParse?.warningsErrors,
    });
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logNative({ label, ok: false, error: msg });
    return { ok: false, url: tabUrl, error: msg, htmlLength: 0 };
  }
}

export async function nativeFetchTradeBoardMyRequests(): Promise<FlicaActionsFetchResult> {
  return fetchTradeBoardTabUsingWebViewSession(
    "trade_my_requests",
    FLICA_NATIVE_URLS.tradeMyRequests,
  );
}

export async function nativeFetchTradeBoardAllRequests(): Promise<FlicaActionsFetchResult> {
  return fetchTradeBoardTabUsingWebViewSession(
    "trade_all_requests",
    FLICA_NATIVE_URLS.tradeAllRequests,
  );
}

export async function nativeFetchTradeBoardFavorites(): Promise<FlicaActionsFetchResult> {
  return fetchTradeBoardTabUsingWebViewSession(
    "trade_favorites",
    FLICA_NATIVE_URLS.tradeFavorites,
  );
}

export async function nativeFetchTradeBoardMyResponses(): Promise<FlicaActionsFetchResult> {
  return fetchTradeBoardTabUsingWebViewSession(
    "trade_my_responses",
    FLICA_NATIVE_URLS.tradeMyResponses,
  );
}

/**
 * TradeBoard Post Request: native GET returns empty HTML; use authenticated FLICA WebView.
 * GET attempts are intentionally not performed here.
 */
export async function nativeFetchTradeBoardPostRequest(): Promise<FlicaActionsFetchResult> {
  const requestedUrl = String(FLICA_NATIVE_URLS.tradePostRequest ?? "");
  const referer = String(TRADEBOARD_TAB_REFERER ?? "");
  const explanation =
    "Post Request loads correctly in the authenticated FLICA WebView, but native GET returns empty HTML. Use WebView bridge for this page.";

  logNative({
    label: "trade_post_request",
    outcome: "webview_required",
    requestedUrl,
    referer,
  });

  const nativeParse: FlicaNativePageModel = {
    pageTitle: null,
    pageType: "tradeboard_post_request",
    rows: [],
    buttons: [],
    forms: [],
    hiddenFields: [],
    actionEndpoints: [],
    warningsErrors: [],
  };

  return {
    ok: true,
    url: requestedUrl,
    htmlLength: 0,
    htmlState: "ok",
    title: null,
    rowCount: 0,
    detectedLinks: [],
    bodyPreview:
      `${explanation}\n\nrequestedUrl: ${requestedUrl}\nreferer: ${referer}\npageType: tradeboard_post_request`,
    nativeParse,
    tradeBoardPostWebviewRequired: true,
    tradeBoardPostRequestMeta: {
      pageType: "tradeboard_post_request",
      requestedUrl,
      referer,
      explanation,
    },
  };
}

type OtGate =
  | {
      ok: true;
      referer: string;
      token: string;
    }
  | { ok: false; result: FlicaActionsFetchResult };

async function openTimeFrameAndToken(): Promise<OtGate> {
  const frameUrl = FLICA_NATIVE_URLS.otFrameView;
  try {
    const frame = await fetchFlicaHtmlUsingWebViewSession(frameUrl, {
      referer: WEBVIEW_TRUSTED_REFERER,
    });
    const st = detectFlicaHtmlState(frame.html);
    if (frame.status !== 200 || st !== "ok") {
      return {
        ok: false,
        result: toResult(frameUrl, frame.status, frame.html, frame.url, {
          error: `OpenTime frame: ${st}`,
          okOverride: false,
        }),
      };
    }
    const token = extractTokenFromHtml(frame.html);
    if (!token) {
      return {
        ok: false,
        result: toResult(frameUrl, frame.status, frame.html, frame.url, {
          error: "Token not found in otframe HTML.",
          okOverride: false,
        }),
      };
    }
    return {
      ok: true,
      referer: frame.url,
      token,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, result: { ok: false, url: frameUrl, error: msg } };
  }
}

export async function nativeFetchOpenTimePot(): Promise<FlicaActionsFetchResult> {
  const gate = await openTimeFrameAndToken();
  if (!gate.ok) {
    logNative({ label: "ot_pot", ok: false, error: gate.result.error });
    return gate.result;
  }
  try {
    const potUrl = FLICA_NATIVE_URLS.otPot(gate.token);
    const pot = await fetchFlicaHtmlUsingWebViewSession(potUrl, {
      referer: gate.referer,
    });
    const r = toResult(potUrl, pot.status, pot.html, pot.url);
    logNative({
      label: "ot_pot",
      ok: r.ok,
      pageType: r.nativeParse?.pageType,
      rowCount: r.rowCount,
    });
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logNative({ label: "ot_pot", ok: false, error: msg });
    return { ok: false, url: FLICA_NATIVE_URLS.otFrameView, error: msg };
  }
}

export async function nativeFetchOpenTimeMyRequests(): Promise<FlicaActionsFetchResult> {
  const gate = await openTimeFrameAndToken();
  if (!gate.ok) {
    logNative({ label: "ot_my_requests", ok: false, error: gate.result.error });
    return gate.result;
  }
  try {
    const reqUrl = FLICA_NATIVE_URLS.otRequest(gate.token);
    const req = await fetchFlicaHtmlUsingWebViewSession(reqUrl, {
      referer: gate.referer,
    });
    const r = toResult(reqUrl, req.status, req.html, req.url);
    logNative({
      label: "ot_my_requests",
      ok: r.ok,
      pageType: r.nativeParse?.pageType,
      rowCount: r.rowCount,
    });
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logNative({ label: "ot_my_requests", ok: false, error: msg });
    return { ok: false, url: FLICA_NATIVE_URLS.otFrameView, error: msg };
  }
}

async function previewOtGet(
  label: string,
  targetUrl: string,
): Promise<FlicaActionsFetchResult> {
  const gate = await openTimeFrameAndToken();
  if (!gate.ok) {
    logNative({ label, ok: false, error: gate.result.error });
    return gate.result;
  }
  try {
    const page = await fetchFlicaHtmlUsingWebViewSession(targetUrl, {
      referer: gate.referer,
    });
    const r = toResult(targetUrl, page.status, page.html, page.url);
    logNative({ label, ok: r.ok, pageType: r.nativeParse?.pageType });
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logNative({ label, ok: false, error: msg });
    return { ok: false, url: targetUrl, error: msg };
  }
}

export async function nativePreviewOpenTimeAddFlow(): Promise<FlicaActionsFetchResult> {
  return previewOtGet("ot_preview_add", FLICA_NATIVE_URLS.otAddPreview);
}

export async function nativePreviewOpenTimeDropFlow(): Promise<FlicaActionsFetchResult> {
  return previewOtGet("ot_preview_drop", FLICA_NATIVE_URLS.otDropPreview);
}

export async function nativePreviewOpenTimeSwapFlow(): Promise<FlicaActionsFetchResult> {
  return previewOtGet("ot_preview_swap", FLICA_NATIVE_URLS.otSwapPreview);
}

export async function nativePreviewOpenTimeTradeFlow(): Promise<FlicaActionsFetchResult> {
  return previewOtGet("ot_preview_trade", FLICA_NATIVE_URLS.otTradePreview);
}

/** Second-step trade preview URL only (GET); no POST / submit. */
export async function nativePreviewOpenTimeTrade2Flow(): Promise<FlicaActionsFetchResult> {
  return previewOtGet("ot_preview_trade2", FLICA_NATIVE_URLS.otTrade2Preview);
}
