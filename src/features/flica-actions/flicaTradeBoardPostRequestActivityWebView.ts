/**
 * Run TradeBoard Post Request “Add Activity” selection in the hidden WebView
 * (select pairing → Undo → Next → populated post form).
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import { FLICA_NATIVE_OT_TRADE_BCID, FLICA_NATIVE_URLS } from "./flicaActionsNativeService";
import { getFlicaActionsWebViewSession } from "./flicaActionsWebViewSession";
import {
  requestTbPostActivityFlow,
  type TbActivityFlowResult,
} from "./flicaTradeBoardPostRequestActivityWebViewBridge";
import type {
  TradeboardPostRequestActivity,
  TradeboardPostRequestFormParse,
} from "./flicaTradeBoardPostRequestTypes";

const DEFAULT_ADD_ACTIVITY_URL = `https://jetblue.flica.net/full/ottrade.cgi?BCID=${FLICA_NATIVE_OT_TRADE_BCID}&bFromTB=1&VerifyDates=1&act=T`;

/** Normalize add-activity link to TradeBoard activity selector (act=T). */
export function normalizeTradeboardAddActivityUrl(url: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return DEFAULT_ADD_ACTIVITY_URL;
  try {
    const u = new URL(raw, FLICA_NATIVE_URLS.tradePostRequest);
    if (u.pathname.toLowerCase().includes("ottrade")) {
      u.searchParams.set("BCID", u.searchParams.get("BCID") ?? u.searchParams.get("bcid") ?? "002.000");
      u.searchParams.set("bFromTB", "1");
      u.searchParams.set("VerifyDates", "1");
      u.searchParams.set("act", "T");
    }
    return u.href;
  } catch {
    return raw.includes("act=") ? raw : DEFAULT_ADD_ACTIVITY_URL;
  }
}

export type EnsureTbPostActivityResult =
  | { ok: true; flow: TbActivityFlowResult }
  | { ok: false; error: string; flow?: TbActivityFlowResult };

/**
 * Select one activity on FLICA via hidden WebView before POST submit.
 * Does not submit the request — only registers the pairing on the post form session.
 */
export async function ensureTradeboardPostRequestActivityOnFlica(input: {
  formParse: TradeboardPostRequestFormParse;
  activity: TradeboardPostRequestActivity;
}): Promise<EnsureTbPostActivityResult> {
  const session = await getFlicaActionsWebViewSession();
  if (!session) {
    return {
      ok: false,
      error: "Refresh FLICA first — WebView session required to select activity on FLICA.",
    };
  }

  const pairingId = String(input.activity.pairingId ?? "").trim().toUpperCase();
  if (!pairingId) {
    return { ok: false, error: "Activity pairing id is required." };
  }

  const addActivityUrl = normalizeTradeboardAddActivityUrl(input.formParse.detected.addActivityUrl);
  const postRequestUrl =
    input.formParse.finalUrl?.trim() || FLICA_NATIVE_URLS.tradePostRequest;
  const dateLabel = String(input.activity.dateLabel ?? "").trim().toUpperCase();

  fcDevMirrorScheduleLogToFile("FC_TB_POST_ACTIVITY_WEBVIEW_START", {
    pairingId,
    dateLabel,
    postRequestUrl,
    addActivityUrl,
  });

  try {
    const flow = await requestTbPostActivityFlow({
      frameWarmupUrl: FLICA_NATIVE_URLS.tradeFrame,
      postRequestUrl,
      addActivityUrl,
      pairingId,
      dateLabel,
      pollTimeoutMs: 28_000,
    });

    if (!flow.ok || !flow.postFormReturned) {
      const err =
        flow.error ??
        "FLICA activity selection did not return to populated Post Request form.";
      fcDevMirrorScheduleLogToFile("FC_TB_POST_ACTIVITY_WEBVIEW_FAILED", {
        pairingId,
        error: err,
        nextMethod: flow.nextMethod,
        diagnostics: flow.diagnostics,
      });
      return { ok: false, error: err, flow };
    }

    fcDevMirrorScheduleLogToFile("FC_TB_POST_ACTIVITY_WEBVIEW_OK", {
      pairingId,
      nextMethod: flow.nextMethod,
      finalUrl: flow.finalUrl,
      selectedRowText: flow.selectedRowText,
    });
    return { ok: true, flow };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fcDevMirrorScheduleLogToFile("FC_TB_POST_ACTIVITY_WEBVIEW_FAILED", {
      pairingId,
      error: msg,
    });
    return { ok: false, error: msg };
  }
}
