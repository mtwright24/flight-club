/**
 * Phase 1 FLICA Actions native fetches using WebView session cookies.
 * TradeBoard All Requests may POST a filter reset after the tab GET (no bid submits).
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
import type {
  FlicaActionsFetchResult,
  FlicaNativePageModel,
  TradeBoardAllRequestsNativeDebug,
} from "./flicaActionsTypes";
import {
  buildTradeBoardAllRequestsResetBody,
  extractHiddenFieldsFromHtml,
  findTradeBoardOtherRequestsForm,
  tradeBoardAllRequestsGetCandidateUrls,
  tradeBoardHtmlContainsNothingMatchesCriteria,
  tradeBoardPairingMatchCount,
} from "./flicaTradeBoardAllRequestsForm";
import type { TradeBoardAllRequestsResetOptions } from "./flicaTradeBoardAllRequestsForm";
import { parseTradeboardPostRequestFormFromHtml } from "./flicaTradeBoardPostRequestForm";
import {
  logEditRequestFetch,
  logEditRequestNativeResult,
  logEditRequestParseMissingForm,
  logEditRequestParseSuccess,
  parseTradeboardEditRequestFormFromHtml,
  tradeboardEditFormParseIsReady,
} from "./flicaTradeBoardEditRequestForm";
import {
  editRequestHtmlHasFormMarkers,
  requestTbEditRequestWebViewCapture,
} from "./flicaTradeBoardEditRequestWebViewCaptureBridge";
import {
  parseTradeboardMyRequestsActionsFromHtml,
  tradeboardEditRequestUrl,
} from "./flicaTradeBoardMyRequestsActions";
import type { TradeboardPostRequestFormParse } from "./flicaTradeBoardPostRequestTypes";
import type { TbPostRequestCapturedFormWire } from "./flicaTradeBoardPostRequestCapturedForm";
import {
  requestTbPostWebViewCapture,
  tradeboardPostRequestHtmlHasFormMarkers,
} from "./flicaTradeBoardPostRequestWebViewCaptureBridge";
import { getFlicaActionsWebViewSession } from "./flicaActionsWebViewSession";

export type TradeBoardAllRequestsFetchOptions = TradeBoardAllRequestsResetOptions;

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
  const hiddenFieldsNameValuePreview = hidden
    .slice(0, 60)
    .map((h) => `${h.name}=${String(h.value ?? "").slice(0, 160)}`);
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
    hiddenFieldsNameValuePreview,
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
    tradeBoardAllRequestsNativeDebug?: TradeBoardAllRequestsNativeDebug;
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
    requestedUrl: String(url ?? ""),
    url: safeFinalUrl,
    status,
    htmlState,
    htmlLength: safeHtml.length,
    title,
    rowCount: rows.length,
    detectedLinks: endpoints.slice(0, 25),
    bodyPreview: preview,
    pageHtml: safeHtml,
    nativeParse,
    error,
    nativeTradeBoardFetchDebug,
    tradeBoardAllRequestsNativeDebug: opts?.tradeBoardAllRequestsNativeDebug,
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
    return { ok: false, requestedUrl: tabUrl, url: tabUrl, error: msg, htmlLength: 0 };
  }
}

export async function nativeFetchTradeBoardMyRequests(): Promise<FlicaActionsFetchResult> {
  return fetchTradeBoardTabUsingWebViewSession(
    "trade_my_requests",
    FLICA_NATIVE_URLS.tradeMyRequests,
  );
}

export async function nativeFetchTradeBoardAllRequests(
  opts?: TradeBoardAllRequestsFetchOptions,
): Promise<FlicaActionsFetchResult> {
  const frameUrl = FLICA_NATIVE_URLS.tradeFrame;
  const getCandidates = tradeBoardAllRequestsGetCandidateUrls(FLICA_NATIVE_TRADE_BCID);
  const steps: string[] = [];

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
        label: "trade_all_requests",
        step: "frame",
        ok: false,
        url: r.url,
        status: r.status,
        htmlState: r.htmlState,
        error: r.error,
      });
      return r;
    }

    let chosen: { url: string; html: string; finalUrl: string; status: number } | null = null;
    for (const getUrl of getCandidates) {
      const tab = await fetchFlicaHtmlUsingWebViewSession(getUrl, {
        referer: TRADEBOARD_TAB_REFERER,
      });
      const html = String(tab.html ?? "");
      const st = detectFlicaHtmlState(html);
      const lower = html.toLowerCase();
      const looksTb =
        lower.includes("tradeboard") ||
        lower.includes("all requests") ||
        lower.includes("otherrequests") ||
        lower.includes("tb_otherrequests");
      if (tab.status === 200 && st === "ok" && looksTb) {
        chosen = {
          url: getUrl,
          html,
          finalUrl: String(tab.url ?? getUrl),
          status: tab.status,
        };
        steps.push(`GET ok ${getUrl}`);
        break;
      }
      steps.push(
        `GET try ${getUrl} status=${tab.status} state=${st} looksTb=${looksTb}`,
      );
    }

    if (!chosen) {
      const tab = await fetchFlicaHtmlUsingWebViewSession(getCandidates[0]!, {
        referer: TRADEBOARD_TAB_REFERER,
      });
      const html = String(tab.html ?? "");
      const r = toResult(getCandidates[0]!, tab.status, html, String(tab.url ?? getCandidates[0]!), {
        error: "All Requests: no candidate GET returned a TradeBoard-shaped page.",
        okOverride: false,
        tradeBoardAllRequestsNativeDebug: {
          steps,
          initialGet: {
            requestedUrl: getCandidates[0]!,
            method: "GET",
            finalUrl: String(tab.url ?? getCandidates[0]!),
            pairingMatchCount: tradeBoardPairingMatchCount(html),
            nothingMatchesCriteria: tradeBoardHtmlContainsNothingMatchesCriteria(html),
          },
          hiddenFieldsFromInitialPage: extractHiddenFieldsFromHtml(html),
          fullHtmlContainsPairingPattern: tradeBoardPairingMatchCount(html) > 0,
          nothingMatchesCriteriaFinal: tradeBoardHtmlContainsNothingMatchesCriteria(html),
          getCandidatesTried: getCandidates.slice(),
        },
      });
      logNative({ label: "trade_all_requests", ok: false, error: r.error, steps });
      return r;
    }

    const hiddenFromPage = extractHiddenFieldsFromHtml(chosen.html);
    let htmlOut = chosen.html;
    let statusOut = chosen.status;
    let finalUrlOut = chosen.finalUrl;
    let requestedUrlOut = chosen.url;

    const pairingGet = tradeBoardPairingMatchCount(chosen.html);
    const nmGet = tradeBoardHtmlContainsNothingMatchesCriteria(chosen.html);
    const formPick = findTradeBoardOtherRequestsForm(chosen.html);
    let resetPostDebug: TradeBoardAllRequestsNativeDebug["resetPost"] | undefined;

    const shouldTryReset =
      !!formPick &&
      formPick.innerHtml.length > 40 &&
      (pairingGet === 0 || nmGet);

    if (shouldTryReset && formPick) {
      const { body } = buildTradeBoardAllRequestsResetBody(formPick.innerHtml, opts);
      const postUrl = formPick.actionUrl;
      steps.push(`POST reset -> ${postUrl} (formMethod=${formPick.method})`);
      try {
        const post = await fetchFlicaHtmlUsingWebViewSession(postUrl, {
          referer: chosen.finalUrl,
          method: "POST",
          body,
        });
        const postHtml = String(post.html ?? "");
        const postSt = detectFlicaHtmlState(postHtml);
        const pairingPost = tradeBoardPairingMatchCount(postHtml);
        const nmPost = tradeBoardHtmlContainsNothingMatchesCriteria(postHtml);
        resetPostDebug = {
          postUrl,
          method: "POST",
          requestBody: body.slice(0, 8000),
          finalUrl: String(post.url ?? postUrl),
          pairingMatchCount: pairingPost,
          nothingMatchesCriteria: nmPost,
        };
        steps.push(
          `POST status=${post.status} state=${postSt} pairings=${pairingPost} nothingMatches=${nmPost}`,
        );
        if (
          post.status === 200 &&
          postSt === "ok" &&
          (pairingPost > pairingGet ||
            (pairingGet === 0 && pairingPost > 0) ||
            (nmGet && !nmPost))
        ) {
          htmlOut = postHtml;
          statusOut = post.status;
          finalUrlOut = String(post.url ?? postUrl);
          requestedUrlOut = chosen.url;
        }
      } catch (pe) {
        const msg = pe instanceof Error ? pe.message : String(pe);
        steps.push(`POST error: ${msg}`);
      }
    } else {
      steps.push(
        formPick
          ? `Skip reset POST (pairingGet=${pairingGet} nmGet=${nmGet} formScore ok)`
          : "Skip reset POST (no listing form parsed)",
      );
    }

    const pairingFinal = tradeBoardPairingMatchCount(htmlOut);
    const nmFinal = tradeBoardHtmlContainsNothingMatchesCriteria(htmlOut);

    const arDebug: TradeBoardAllRequestsNativeDebug = {
      steps,
      initialGet: {
        requestedUrl: chosen.url,
        method: "GET",
        finalUrl: chosen.finalUrl,
        pairingMatchCount: pairingGet,
        nothingMatchesCriteria: nmGet,
      },
      resetPost: resetPostDebug,
      hiddenFieldsFromInitialPage: hiddenFromPage,
      fullHtmlContainsPairingPattern: pairingFinal > 0,
      nothingMatchesCriteriaFinal: nmFinal,
      getCandidatesTried: getCandidates.slice(),
    };

    if (pairingFinal === 0) {
      const logPayload = {
        finalUrl: finalUrlOut,
        methodEffective: resetPostDebug ? "GET_then_POST" : "GET",
        requestBody: resetPostDebug?.requestBody ?? "(no reset POST)",
        hiddenFieldsFromOriginalGet: hiddenFromPage.slice(0, 80),
        nothingMatchesCriteria: nmFinal,
        fullHtmlContainsPairingPattern: pairingFinal > 0,
        steps,
      };
      console.warn("[FC_TRADEBOARD_ALL_REQUESTS_NO_TOKENS]", JSON.stringify(logPayload));
      logNative({ label: "trade_all_requests", outcome: "no_pairing_tokens", ...logPayload });
    }

    const r = toResult(requestedUrlOut, statusOut, htmlOut, finalUrlOut, {
      tradeBoardFetchMeta: {
        referer: TRADEBOARD_TAB_REFERER,
        fallbackUsed: chosen.url !== getCandidates[0],
        firstRequestedUrl: chosen.url,
        finalRequestedUrl: finalUrlOut,
      },
      tradeBoardAllRequestsNativeDebug: arDebug,
    });
    logNative({
      label: "trade_all_requests",
      ok: r.ok,
      url: r.url,
      pageType: r.nativeParse?.pageType,
      rowCount: r.rowCount,
      pairingFinal,
      warnings: r.nativeParse?.warningsErrors,
    });
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logNative({ label: "trade_all_requests", ok: false, error: msg });
    return { ok: false, requestedUrl: getCandidates[0] ?? "", url: getCandidates[0] ?? "", error: msg, htmlLength: 0 };
  }
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

export type TradeboardPostRequestFormFetchResult = FlicaActionsFetchResult & {
  postRequestFormParse?: TradeboardPostRequestFormParse;
};

function nativePostRequestHtmlUsable(html: string): boolean {
  return tradeboardPostRequestHtmlHasFormMarkers(html);
}

/**
 * GET tb_postrequest.cgi using WebView session cookies (frame warmup + tab referer).
 * Falls back to hidden WebView DOM capture when native body is empty or lacks form markers.
 */
export async function fetchTradeboardPostRequestForm(
  opts?: { editReqId?: string },
): Promise<TradeboardPostRequestFormFetchResult> {
  const frameUrl = FLICA_NATIVE_URLS.tradeFrame;
  const requestedUrl = String(FLICA_NATIVE_URLS.tradePostRequest ?? "");
  const fallbackUrl = String(FLICA_NATIVE_URLS.tradePostRequestFallbackGet ?? "");
  const editReqId = String(opts?.editReqId ?? "").trim();
  const primaryUrl = editReqId
    ? `${requestedUrl}${requestedUrl.includes("?") ? "&" : "?"}reqId=${encodeURIComponent(editReqId)}`
    : requestedUrl;

  let htmlSource: "native" | "native_fallback_get" | "webview" = "native";
  let tabHtml = "";
  let tabFinal = primaryUrl;
  let tabStatus = 200;
  let webviewCapturedForm: TbPostRequestCapturedFormWire | null = null;

  try {
    const frame = await fetchFlicaHtmlUsingWebViewSession(frameUrl, {
      referer: WEBVIEW_TRUSTED_REFERER,
    });
    const frameSt = detectFlicaHtmlState(String(frame.html ?? ""));
    if (frame.status !== 200 || frameSt !== "ok") {
      const r = toResult(primaryUrl, frame.status, String(frame.html ?? ""), frameUrl, {
        error: `TradeBoard frame failed: ${frameSt}`,
        okOverride: false,
      });
      fcDevMirrorScheduleLogToFile("FC_TB_POST_FORM_NATIVE_FETCH", {
        ok: false,
        step: "frame",
        htmlState: frameSt,
        status: frame.status,
      });
      return { ...r, postRequestFormParse: undefined };
    }

    let tab = await fetchFlicaHtmlUsingWebViewSession(primaryUrl, {
      referer: TRADEBOARD_TAB_REFERER,
    });
    tabHtml = String(tab.html ?? "");
    tabFinal = String(tab.url ?? primaryUrl);
    tabStatus = tab.status;

    fcDevMirrorScheduleLogToFile("FC_TB_POST_FORM_NATIVE_FETCH", {
      ok: tab.status === 200,
      requestedUrl: primaryUrl,
      status: tab.status,
      htmlLength: tabHtml.length,
      hasFormMarkers: nativePostRequestHtmlUsable(tabHtml),
      finalUrl: tabFinal,
    });

    if (!nativePostRequestHtmlUsable(tabHtml)) {
      const fb = await fetchFlicaHtmlUsingWebViewSession(fallbackUrl, {
        referer: TRADEBOARD_TAB_REFERER,
      });
      const fbHtml = String(fb.html ?? "");
      fcDevMirrorScheduleLogToFile("FC_TB_POST_FORM_NATIVE_FETCH", {
        ok: fb.status === 200,
        step: "fallback_get",
        requestedUrl: fallbackUrl,
        status: fb.status,
        htmlLength: fbHtml.length,
        hasFormMarkers: nativePostRequestHtmlUsable(fbHtml),
      });
      if (nativePostRequestHtmlUsable(fbHtml) || fbHtml.length > tabHtml.length) {
        tab = fb;
        tabHtml = fbHtml;
        tabFinal = String(fb.url ?? fallbackUrl);
        tabStatus = fb.status;
        htmlSource = "native_fallback_get";
      }
    }

    if (!nativePostRequestHtmlUsable(tabHtml)) {
      const wvSession = await getFlicaActionsWebViewSession();
      if (!wvSession) {
        const err =
          "Refresh FLICA first — pull to refresh Tradeboard to establish session, then try Post a Request again.";
        fcDevMirrorScheduleLogToFile("FC_TB_POST_FORM_WEBVIEW_FALLBACK_START", {
          primaryUrl,
          skipped: true,
          reason: "no_webview_session",
        });
        const r = toResult(primaryUrl, tabStatus, tabHtml, tabFinal, {
          error:
            tabHtml.length === 0
              ? `Empty FLICA response (no HTML body). ${err}`
              : err,
          okOverride: false,
        });
        return { ...r, postRequestFormParse: undefined };
      }

      fcDevMirrorScheduleLogToFile("FC_TB_POST_FORM_WEBVIEW_FALLBACK_START", {
        primaryUrl,
        frameWarmupUrl: frameUrl,
        nativeHtmlLength: tabHtml.length,
        nativeStatus: tabStatus,
        sessionReadyAt: wvSession.readyAt,
      });

      try {
        await new Promise<void>((r) => setTimeout(r, 120));
        const cap = await requestTbPostWebViewCapture({
          frameWarmupUrl: frameUrl,
          targetUrl: primaryUrl,
        });
        tabHtml = cap.html;
        tabFinal = cap.finalUrl;
        webviewCapturedForm = cap.capturedForm ?? null;
        htmlSource = "webview";
      } catch (wvErr) {
        const wvMsg = wvErr instanceof Error ? wvErr.message : String(wvErr);
        fcDevMirrorScheduleLogToFile("FC_TB_POST_FORM_PARSE_RESULT", {
          ok: false,
          htmlSource: "none",
          htmlLength: tabHtml.length,
          error: wvMsg,
        });
        const r = toResult(primaryUrl, tabStatus, tabHtml, tabFinal, {
          error:
            tabHtml.length === 0
              ? "Empty FLICA response (no HTML body). Native fetch and WebView capture both failed. Refresh FLICA first."
              : `Post Request form unavailable: ${wvMsg}`,
          okOverride: false,
        });
        return { ...r, postRequestFormParse: undefined };
      }
    }

    const formParse = parseTradeboardPostRequestFormFromHtml(tabHtml, {
      requestedUrl: primaryUrl,
      finalUrl: tabFinal,
      webviewCapturedForm: htmlSource === "webview" ? webviewCapturedForm : undefined,
      htmlSource,
    });

    fcDevMirrorScheduleLogToFile("FC_TB_POST_FORM_PARSE_RESULT", {
      ok: formParse.ok,
      htmlSource,
      htmlLength: tabHtml.length,
      htmlState: formParse.htmlState,
      formsCount: formParse.forms.length,
      hasPrimaryForm: Boolean(formParse.primaryForm),
      missingMappings: formParse.missingMappings,
      warnings: formParse.warnings,
    });

    if (__DEV__) {
      console.log(
        "[FC_TB_POST_FORM_PARSE_RESULT]",
        JSON.stringify({
          ok: formParse.ok,
          htmlSource,
          htmlLength: tabHtml.length,
        }),
      );
    }

    const parseOk = formParse.ok;
    const errMsg = !parseOk
      ? tabHtml.length === 0
        ? "Empty FLICA response (no HTML body). Native fetch and WebView capture both failed. Refresh FLICA first."
        : "Post Request form could not be parsed from FLICA HTML. Refresh FLICA first."
      : undefined;

    const r = toResult(primaryUrl, tabStatus, tabHtml, tabFinal, {
      okOverride: parseOk,
      error: errMsg,
    });

    logNative({
      label: "trade_post_request",
      ok: parseOk,
      htmlLength: tabHtml.length,
      htmlSource,
      missingMappings: formParse.missingMappings,
    });

    return {
      ...r,
      ok: parseOk,
      pageHtml: tabHtml,
      tradeBoardPostWebviewRequired: !parseOk,
      tradeBoardPostRequestMeta: !parseOk
        ? {
            pageType: "tradeboard_post_request",
            requestedUrl: primaryUrl,
            referer: TRADEBOARD_TAB_REFERER,
            explanation: errMsg ?? "Post form unavailable.",
          }
        : undefined,
      postRequestFormParse: formParse,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fcDevMirrorScheduleLogToFile("FC_TB_POST_FORM_PARSE_RESULT", {
      ok: false,
      htmlSource,
      error: msg,
    });
    logNative({ label: "trade_post_request", ok: false, error: msg });
    return {
      ok: false,
      requestedUrl: primaryUrl,
      url: primaryUrl,
      error: msg,
      htmlLength: 0,
      postRequestFormParse: undefined,
    };
  }
}

/** Dev/diagnostic wrapper — same as {@link fetchTradeboardPostRequestForm}. */
export async function nativeFetchTradeBoardPostRequest(): Promise<TradeboardPostRequestFormFetchResult> {
  return fetchTradeboardPostRequestForm();
}

export async function fetchTradeboardMyRequestsActions(): Promise<{
  fetch: FlicaActionsFetchResult;
  actions: ReturnType<typeof parseTradeboardMyRequestsActionsFromHtml>;
}> {
  const fetch = await nativeFetchTradeBoardMyRequests();
  const actions = parseTradeboardMyRequestsActionsFromHtml(String(fetch.pageHtml ?? ""));
  return { fetch, actions };
}

/** Targeted My Requests refresh after edit/delete (no full session runner). */
export async function refreshTradeboardMyRequestsTargeted(): Promise<{
  fetch: FlicaActionsFetchResult;
  actions: ReturnType<typeof parseTradeboardMyRequestsActionsFromHtml>;
}> {
  const refreshUrl = FLICA_NATIVE_URLS.tradeMyRequests;
  fcDevMirrorScheduleLogToFile("FC_TB_MY_REQUESTS_TARGETED_REFRESH", {
    refreshUrl,
    started: true,
  });
  if (__DEV__) {
    console.log("[FC_TB_MY_REQUESTS_TARGETED_REFRESH]", JSON.stringify({ refreshUrl }));
  }
  const fetch = await nativeFetchTradeBoardMyRequests();
  const actions = parseTradeboardMyRequestsActionsFromHtml(String(fetch.pageHtml ?? ""));
  fcDevMirrorScheduleLogToFile("FC_TB_MY_REQUESTS_TARGETED_REFRESH", {
    ok: fetch.ok,
    rowCount: actions.rows.length,
    htmlLength: fetch.htmlLength,
    refreshUrl,
  });
  return { fetch, actions };
}

export type TradeboardEditRequestFormFetchResult = FlicaActionsFetchResult & {
  postRequestFormParse?: TradeboardPostRequestFormParse;
};

/** GET TB_EditRequest.cgi for native edit composer (WebView DOM fallback when native body is empty). */
export async function fetchTradeboardEditRequestForm(
  reqId: string,
): Promise<TradeboardEditRequestFormFetchResult> {
  const frameUrl = FLICA_NATIVE_URLS.tradeFrame;
  const id = String(reqId ?? "").trim();
  const requestedUrl = tradeboardEditRequestUrl(id);

  try {
    const frame = await fetchFlicaHtmlUsingWebViewSession(frameUrl, {
      referer: WEBVIEW_TRUSTED_REFERER,
    });
    const frameSt = detectFlicaHtmlState(String(frame.html ?? ""));
    if (frame.status !== 200 || frameSt !== "ok") {
      const r = toResult(requestedUrl, frame.status, String(frame.html ?? ""), frameUrl, {
        error: `TradeBoard frame failed: ${frameSt}`,
        okOverride: false,
      });
      return { ...r, postRequestFormParse: undefined };
    }

    const tab = await fetchFlicaHtmlUsingWebViewSession(requestedUrl, {
      referer: TRADEBOARD_TAB_REFERER,
    });
    let tabHtml = String(tab.html ?? "");
    let tabFinal = String(tab.url ?? requestedUrl);
    let tabStatus = tab.status;
    let htmlSource: "native" | "webview" = "native";

    logEditRequestFetch({
      ok: tab.status === 200,
      reqId: id,
      requestedUrl,
      status: tab.status,
      htmlLength: tabHtml.length,
      finalUrl: tabFinal,
    });

    logEditRequestNativeResult({
      ok: tab.status === 200,
      reqId: id,
      requestedUrl,
      status: tab.status,
      htmlLength: tabHtml.length,
      hasFormMarkers: editRequestHtmlHasFormMarkers(tabHtml),
      finalUrl: tabFinal,
    });

    let formParse = parseTradeboardEditRequestFormFromHtml(tabHtml, {
      requestedUrl,
      finalUrl: tabFinal,
      reqId: id,
      htmlSource: "native",
    });

    if (!tradeboardEditFormParseIsReady(formParse)) {
      const wvSession = await getFlicaActionsWebViewSession();
      if (!wvSession) {
        logEditRequestParseMissingForm({
          reqId: id,
          reason: "no_webview_session",
          nativeHtmlLength: tabHtml.length,
        });
        const err =
          "Refresh FLICA first — pull to refresh Tradeboard to establish session, then try Edit again.";
        const r = toResult(requestedUrl, tabStatus, tabHtml, tabFinal, {
          error:
            tabHtml.length === 0
              ? `Empty FLICA response (no HTML body). ${err}`
              : err,
          okOverride: false,
        });
        return { ...r, postRequestFormParse: formParse };
      }

      try {
        await new Promise<void>((r) => setTimeout(r, 120));
        const cap = await requestTbEditRequestWebViewCapture({
          frameWarmupUrl: frameUrl,
          targetUrl: requestedUrl,
        });
        tabHtml = cap.html;
        tabFinal = cap.finalUrl;
        htmlSource = "webview";

        fcDevMirrorScheduleLogToFile("FC_TB_EDIT_REQUEST_WEBVIEW_CAPTURE_RESULT", {
          ok: cap.ready,
          reqId: id,
          htmlLength: cap.htmlLength,
          finalUrl: cap.finalUrl,
          captureFrameCount: cap.captureFrameCount,
          hasFormMarkers: editRequestHtmlHasFormMarkers(tabHtml),
        });

        formParse = parseTradeboardEditRequestFormFromHtml(tabHtml, {
          requestedUrl,
          finalUrl: tabFinal,
          reqId: id,
          htmlSource: "webview",
        });
      } catch (wvErr) {
        const wvMsg = wvErr instanceof Error ? wvErr.message : String(wvErr);
        fcDevMirrorScheduleLogToFile("FC_TB_EDIT_REQUEST_WEBVIEW_CAPTURE_RESULT", {
          ok: false,
          reqId: id,
          error: wvMsg,
          nativeHtmlLength: tabHtml.length,
        });
        logEditRequestParseMissingForm({
          reqId: id,
          reason: "webview_capture_failed",
          error: wvMsg,
          nativeHtmlLength: tabHtml.length,
        });
        const r = toResult(requestedUrl, tabStatus, tabHtml, tabFinal, {
          error:
            tabHtml.length === 0
              ? "Empty FLICA response (no HTML body). Native fetch and WebView capture both failed. Refresh FLICA first."
              : `Edit Request form unavailable: ${wvMsg}`,
          okOverride: false,
        });
        return { ...r, postRequestFormParse: formParse };
      }
    }

    const parseOk = tradeboardEditFormParseIsReady(formParse);
    if (!parseOk) {
      logEditRequestParseMissingForm({
        reqId: id,
        htmlSource,
        htmlLength: tabHtml.length,
        parseOk: formParse.ok,
        hasPrimaryForm: Boolean(formParse.primaryForm),
      });
    } else {
      logEditRequestParseSuccess({
        reqId: id,
        htmlSource,
        htmlLength: tabHtml.length,
      });
    }

    const r = toResult(requestedUrl, tabStatus, tabHtml, tabFinal, {
      okOverride: parseOk,
      error: parseOk
        ? undefined
        : tabHtml.length === 0
          ? "Empty FLICA response (no HTML body). Native fetch and WebView capture both failed. Refresh FLICA first."
          : "Edit Request form could not be parsed from FLICA HTML. Refresh FLICA first.",
    });

    return { ...r, postRequestFormParse: formParse };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logEditRequestFetch({ ok: false, reqId: id, error: msg });
    logEditRequestParseMissingForm({ reqId: id, reason: "exception", error: msg });
    return {
      ok: false,
      requestedUrl,
      url: requestedUrl,
      error: msg,
      htmlLength: 0,
      postRequestFormParse: undefined,
    };
  }
}

type OtGate =
  | {
      ok: true;
      referer: string;
      token: string;
    }
  | { ok: false; result: FlicaActionsFetchResult };

async function openTimeFrameTokenForBcid(bcid: string): Promise<OtGate> {
  const frameUrl = `${BASE}/full/otframe.cgi?BCID=${encodeURIComponent(bcid)}&ViewOT=1`;
  try {
    const frame = await fetchFlicaHtmlUsingWebViewSession(frameUrl, {
      referer: WEBVIEW_TRUSTED_REFERER,
    });
    const st = detectFlicaHtmlState(frame.html);
    if (frame.status !== 200 || st !== "ok") {
      return {
        ok: false,
        result: toResult(frameUrl, frame.status, frame.html, frame.url, {
          error: `OpenTime frame (${bcid}): ${st}`,
          okOverride: false,
        }),
      };
    }
    const token = extractTokenFromHtml(frame.html);
    if (!token) {
      return {
        ok: false,
        result: toResult(frameUrl, frame.status, frame.html, frame.url, {
          error: `Token not found in otframe HTML (BCID=${bcid}).`,
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
    return {
      ok: false,
      result: { ok: false, requestedUrl: frameUrl, url: frameUrl, error: msg },
    };
  }
}

async function openTimeFrameAndToken(): Promise<OtGate> {
  return openTimeFrameTokenForBcid(FLICA_NATIVE_OT_BCID);
}

/** Known alternate Open Time BCIDs (multi-month pots); merged with HTML discovery. */
export const FLICA_NATIVE_OT_BCID_EXTRA_CANDIDATES = ["029.056", "029.054"] as const;

/** Frame + token + pot fetch for one BCID (for attaching `sourceOtFrameUrl` / `sourceOpenTimePotUrl` to rows). */
export async function nativeFetchOpenTimePotBundleForBcid(bcid: string): Promise<
  | { ok: false; bcid: string; error: string; frameResult?: FlicaActionsFetchResult }
  | {
      ok: true;
      bcid: string;
      sourceOtFrameUrl: string;
      sourceToken: string;
      sourceOpenTimePotUrl: string;
      pot: FlicaActionsFetchResult;
    }
> {
  const gate = await openTimeFrameTokenForBcid(bcid);
  if (!gate.ok) {
    return { ok: false, bcid, error: gate.result.error ?? "OpenTime frame failed", frameResult: gate.result };
  }
  const potUrl = `${BASE}/full/otopentimepot.cgi?token=${encodeURIComponent(gate.token)}&BCID=${encodeURIComponent(bcid)}&GO=1`;
  try {
    const pot = await fetchFlicaHtmlUsingWebViewSession(potUrl, {
      referer: gate.referer,
    });
    const r = toResult(potUrl, pot.status, pot.html, pot.url);
    logNative({
      label: "ot_pot_bundle",
      ok: r.ok,
      bcid,
      pageType: r.nativeParse?.pageType,
      rowCount: r.rowCount,
    });
    return {
      ok: true,
      bcid,
      sourceOtFrameUrl: gate.referer,
      sourceToken: gate.token,
      sourceOpenTimePotUrl: String(pot.url ?? potUrl),
      pot: r,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, bcid, error: msg };
  }
}

export async function nativeFetchOpenTimePotForBcid(bcid: string): Promise<FlicaActionsFetchResult> {
  const b = await nativeFetchOpenTimePotBundleForBcid(bcid);
  if (!b.ok) {
    return b.frameResult ?? { ok: false, requestedUrl: "", url: "", error: b.error, htmlLength: 0 };
  }
  return b.pot;
}

export async function nativeFetchOpenTimePot(): Promise<FlicaActionsFetchResult> {
  const b = await nativeFetchOpenTimePotBundleForBcid(FLICA_NATIVE_OT_BCID);
  if (!b.ok) {
    logNative({ label: "ot_pot", ok: false, error: b.error });
    return b.frameResult ?? { ok: false, requestedUrl: "", url: "", error: b.error, htmlLength: 0 };
  }
  return b.pot;
}

export async function nativeFetchOpenTimeMyRequests(): Promise<FlicaActionsFetchResult> {
  const gate = await openTimeFrameAndToken();
  if (!gate.ok) {
    logNative({ label: "ot_my_requests", ok: false, error: gate.result.error });
    return gate.result;
  }
  const reqUrl = FLICA_NATIVE_URLS.otRequest(gate.token);
  try {
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
    return {
      ok: false,
      requestedUrl: reqUrl,
      url: reqUrl,
      error: msg,
    };
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
    return { ok: false, requestedUrl: targetUrl, url: targetUrl, error: msg };
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
