/**
 * Fetch + parse FLICA TradeBoard activity selector (ottrade.cgi).
 * Source of truth for Post Request Add Activity — not local schedule cache.
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import {
  detectFlicaHtmlState,
  fetchFlicaHtmlUsingWebViewSession,
  flicaFetchNeedsWebVerification,
} from "./flicaActionsHttp";
import { getFlicaActionsWebViewSession } from "./flicaActionsWebViewSession";
import {
  collectEligibleActivityRows,
  parseActivitySelectorRowsFromHtml,
} from "./flicaTradeBoardActivitySelectorParse";
import {
  activitySelectorHtmlMarkers,
  activitySelectorHtmlUsable,
  requestTbActivitySelectorWebViewCapture,
} from "./flicaTradeBoardActivitySelectorWebViewCaptureBridge";
import type { FlicaActivitySelectorRow } from "./flicaTradeBoardActivitySelectorTypes";
import type { TradeboardActivitySelectorParse } from "./flicaTradeBoardActivitySelectorTypes";
import type { TradeboardPostRequestActivity } from "./flicaTradeBoardPostRequestTypes";

const FLICA_OT_TRADE_BCID = "002.000";
const TRADEBOARD_FRAME_REFERER =
  "https://jetblue.flica.net/online/tb_frame.cgi?BCID=002.000&dp=mr";

const FETCH_START_TAG = "FC_TB_ACTIVITY_SELECTOR_FETCH_START";
const NATIVE_RESULT_TAG = "FC_TB_ACTIVITY_SELECTOR_NATIVE_RESULT";
const PARSE_TAG = "FC_TB_ACTIVITY_SELECTOR_PARSE";
const SELECTED_TAG = "FC_TB_ACTIVITY_SELECTED_FROM_FLICA";

export function actParamFromTradeTypeCode(code: string): string {
  const c = String(code ?? "").trim().toUpperCase();
  if (c === "D" || c.startsWith("DROP")) return "D";
  if (c === "P" || c.startsWith("PICK")) return "P";
  if (c === "X") return "X";
  return "T";
}

export function buildTradeboardActivitySelectorUrl(act: string): string {
  const a = actParamFromTradeTypeCode(act);
  return `https://jetblue.flica.net/full/ottrade.cgi?BCID=${encodeURIComponent(
    FLICA_OT_TRADE_BCID,
  )}&bFromTB=1&VerifyDates=1&act=${encodeURIComponent(a)}`;
}

export { labelToYmd } from "./flicaTradeBoardActivitySelectorParse";

function buildParseResult(
  html: string,
  meta: { requestedUrl: string; finalUrl: string; act: string },
  htmlSource: "native" | "webview",
  extraWarnings: string[] = [],
): TradeboardActivitySelectorParse {
  const safeHtml = String(html ?? "");
  const warnings: string[] = [...extraWarnings];
  const { rows, stats } = parseActivitySelectorRowsFromHtml(safeHtml);
  const eligibleRows = collectEligibleActivityRows(rows);

  if (!rows.length) {
    warnings.push("No table rows parsed from activity selector HTML.");
  }
  if (stats.taskRecordsFound === 0 && stats.tradeTaskHandlersFound === 0 && stats.dropTaskHandlersFound === 0) {
    warnings.push("No TAry Task records or TradeTask/DropTask handlers found in HTML.");
  }
  if (eligibleRows.length === 0 && (stats.tradeTaskHandlersFound > 0 || stats.dropTaskHandlersFound > 0)) {
    warnings.push("Handlers found but no eligible trade/drop rows after merge.");
  }

  const firstEligible = eligibleRows.slice(0, 10).map((r) => ({
    pairingId: r.pairingId,
    dateLabel: r.dateLabel,
    dateYmd: r.dateYmd,
    actionLabel: r.actionLabel ?? r.actionType,
    flicaRowIndex: r.flicaRowIndex ?? -1,
  }));

  const result: TradeboardActivitySelectorParse = {
    ok: eligibleRows.length > 0,
    requestedUrl: meta.requestedUrl,
    finalUrl: meta.finalUrl,
    htmlLength: stats.htmlLength,
    act: meta.act,
    rows,
    eligibleRows,
    warnings,
    htmlSource,
    taskRecordsFound: stats.taskRecordsFound,
    tradeTaskHandlersFound: stats.tradeTaskHandlersFound,
    dropTaskHandlersFound: stats.dropTaskHandlersFound,
    eligibleRowsFound: eligibleRows.length,
  };

  fcDevMirrorScheduleLogToFile(PARSE_TAG, {
    ok: result.ok,
    htmlSource,
    requestedUrl: meta.requestedUrl,
    finalUrl: meta.finalUrl,
    htmlLength: stats.htmlLength,
    act: meta.act,
    taskRecordsFound: stats.taskRecordsFound,
    tableRowsFound: stats.tableRowsFound,
    tradeTaskHandlersFound: stats.tradeTaskHandlersFound,
    dropTaskHandlersFound: stats.dropTaskHandlersFound,
    eligibleRowsFound: eligibleRows.length,
    totalRows: rows.length,
    tripCount: rows.filter((r) => r.kind === "trip").length,
    firstEligible,
    warnings,
  });

  if (__DEV__) {
    console.log(
      `[${PARSE_TAG}]`,
      JSON.stringify({
        ok: result.ok,
        htmlSource,
        eligible: eligibleRows.length,
        taskRecordsFound: stats.taskRecordsFound,
        tradeTaskHandlersFound: stats.tradeTaskHandlersFound,
      }),
    );
  }

  return result;
}

export function parseTradeboardActivitySelectorHtml(
  html: string,
  meta: { requestedUrl: string; finalUrl: string; act: string },
  htmlSource: "native" | "webview" = "native",
): TradeboardActivitySelectorParse {
  return buildParseResult(html, meta, htmlSource);
}

function parseNeedsWebViewFallback(parsed: TradeboardActivitySelectorParse): boolean {
  if (parsed.ok && parsed.eligibleRows.length > 0) return false;
  const tasks = parsed.taskRecordsFound ?? 0;
  const tradeH = parsed.tradeTaskHandlersFound ?? 0;
  const dropH = parsed.dropTaskHandlersFound ?? 0;
  return tasks === 0 && tradeH === 0 && dropH === 0;
}

export async function fetchTradeboardActivitySelector(
  tradeTypeCode: string,
  opts?: { referer?: string },
): Promise<TradeboardActivitySelectorParse> {
  const act = actParamFromTradeTypeCode(tradeTypeCode);
  const requestedUrl = buildTradeboardActivitySelectorUrl(act);
  const referer = opts?.referer?.trim() || TRADEBOARD_FRAME_REFERER;

  fcDevMirrorScheduleLogToFile(FETCH_START_TAG, {
    requestedUrl,
    act,
    referer,
  });

  let nativeHtml = "";
  let nativeFinalUrl = requestedUrl;
  let nativeMarkers = activitySelectorHtmlMarkers("");

  try {
    const res = await fetchFlicaHtmlUsingWebViewSession(requestedUrl, { referer });
    nativeHtml = String(res.html ?? "");
    nativeFinalUrl = String(res.url ?? requestedUrl);
    const htmlState = detectFlicaHtmlState(nativeHtml);
    nativeMarkers = activitySelectorHtmlMarkers(nativeHtml);

    fcDevMirrorScheduleLogToFile(NATIVE_RESULT_TAG, {
      ok: res.status === 200 && !flicaFetchNeedsWebVerification(htmlState),
      status: res.status,
      htmlLength: nativeHtml.length,
      htmlState,
      finalUrl: nativeFinalUrl,
      containsTradeTask: nativeMarkers.containsTradeTask,
      containsDropTask: nativeMarkers.containsDropTask,
      containsTaryTask: nativeMarkers.containsTaryTask,
      containsScheduleTable: nativeMarkers.containsScheduleTable,
    });

    if (flicaFetchNeedsWebVerification(htmlState)) {
      return {
        ok: false,
        requestedUrl,
        finalUrl: nativeFinalUrl,
        htmlLength: nativeHtml.length,
        act,
        rows: [],
        eligibleRows: [],
        warnings: [`FLICA session issue (${htmlState}). Refresh FLICA and try again.`],
        htmlSource: "native",
      };
    }

    const nativeParsed = buildParseResult(nativeHtml, {
      requestedUrl,
      finalUrl: nativeFinalUrl,
      act,
    }, "native");

    if (!parseNeedsWebViewFallback(nativeParsed)) {
      return nativeParsed;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fcDevMirrorScheduleLogToFile(NATIVE_RESULT_TAG, { ok: false, error: msg });
    nativeHtml = "";
  }

  const wvSession = await getFlicaActionsWebViewSession();
  if (!wvSession) {
    const err =
      "Refresh FLICA first — pull to refresh Tradeboard to establish session, then open Add Activity again.";
    return {
      ok: false,
      requestedUrl,
      finalUrl: nativeFinalUrl,
      htmlLength: nativeHtml.length,
      act,
      rows: [],
      eligibleRows: [],
      warnings: [
        nativeHtml.length
          ? `Native fetch returned HTML without activity selector data (${nativeHtml.length} bytes). ${err}`
          : `Native fetch failed. ${err}`,
      ],
      htmlSource: "native",
    };
  }

  try {
    await new Promise<void>((r) => setTimeout(r, 120));
    const cap = await requestTbActivitySelectorWebViewCapture({
      frameWarmupUrl: referer,
      targetUrl: requestedUrl,
    });

    fcDevMirrorScheduleLogToFile("FC_TB_ACTIVITY_SELECTOR_WEBVIEW_CAPTURE_RESULT", {
      ok: activitySelectorHtmlUsable(cap.html),
      frameUrl: cap.finalUrl,
      htmlLength: cap.htmlLength,
      containsTradeTask: cap.containsTradeTask,
      containsDropTask: cap.containsDropTask,
      containsScheduleTable: cap.containsScheduleTable,
      captureFrameCount: cap.captureFrameCount,
    });

    const webParsed = buildParseResult(
      cap.html,
      { requestedUrl, finalUrl: cap.finalUrl, act },
      "webview",
    );

    if (webParsed.ok) {
      return webParsed;
    }

    return {
      ...webParsed,
      warnings: [
        ...webParsed.warnings,
        "Native fetch and WebView capture both returned HTML without eligible FLICA activities.",
        nativeHtml.length
          ? `Native htmlLength=${nativeHtml.length}, tradeTask=${nativeMarkers.containsTradeTask}, tary=${nativeMarkers.containsTaryTask}.`
          : "Native fetch returned no HTML.",
        `WebView htmlLength=${cap.htmlLength}, tradeTask=${cap.containsTradeTask}, dropTask=${cap.containsDropTask}.`,
      ],
    };
  } catch (wvErr) {
    const wvMsg = wvErr instanceof Error ? wvErr.message : String(wvErr);
    return {
      ok: false,
      requestedUrl,
      finalUrl: nativeFinalUrl,
      htmlLength: nativeHtml.length,
      act,
      rows: [],
      eligibleRows: [],
      warnings: [
        "Native fetch and WebView capture both failed for the FLICA activity selector.",
        nativeHtml.length
          ? `Native htmlLength=${nativeHtml.length} (no TradeTask/TAry in response).`
          : "Native fetch returned no usable HTML.",
        `WebView capture error: ${wvMsg}`,
      ],
      htmlSource: "native",
    };
  }
}

export function flicaSelectorRowToActivity(
  row: FlicaActivitySelectorRow,
  selectorUrl: string,
): TradeboardPostRequestActivity {
  const pairingId = row.pairingId.trim().toUpperCase();
  const dateLabel = row.dateLabel.trim().toUpperCase();
  const dateYmd = row.dateYmd.trim();
  const activity: TradeboardPostRequestActivity = {
    pairingId,
    dateYmd,
    dateLabel,
    sourceType: "flica_selector",
    displayLabel: `${pairingId}:${dateLabel}`,
    depAirport: row.depart || undefined,
    arrAirport: row.arrive || undefined,
    blockHrs: row.blockHrs || undefined,
    layovers: row.layover || undefined,
    flicaSelectorUrl: selectorUrl,
    flicaRowIndex: row.flicaRowIndex ?? undefined,
    flicaActionType: row.actionLabel ?? row.actionType,
    days: row.days || undefined,
    report: row.report || undefined,
    depart: row.depart || undefined,
    arrive: row.arrive || undefined,
  };

  fcDevMirrorScheduleLogToFile(SELECTED_TAG, {
    pairingId,
    dateLabel,
    dateYmd,
    flicaRowIndex: row.flicaRowIndex,
    actionType: row.actionType,
    actionLabel: row.actionLabel,
    rawOnclick: row.rawOnclick,
    blockHrs: row.blockHrs,
    layover: row.layover,
    selectorUrl,
  });

  if (__DEV__) {
    console.log(`[${SELECTED_TAG}]`, JSON.stringify({ pairingId, dateLabel, dateYmd }));
  }

  return activity;
}
