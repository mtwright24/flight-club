/**
 * TradeBoard My Requests — GET delete and targeted list refresh.
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import {
  detectFlicaHtmlState,
  fetchFlicaHtmlUsingWebViewSession,
} from "./flicaActionsHttp";
import { tradeboardMyRequestDeleteUrl } from "./flicaTradeBoardMyRequestsActions";
import type { TradeboardPostRequestSubmitResult } from "./flicaTradeBoardPostRequestTypes";

const CONFIRM_TAG = "FC_TB_DELETE_REQUEST_CONFIRM";
const SUBMIT_TAG = "FC_TB_DELETE_REQUEST_SUBMIT";
const TRADEBOARD_TAB_REFERER = "https://jetblue.flica.net/online/tb_frame.cgi?BCID=002.000&dp=mr";

export function logDeleteRequestConfirm(meta: Record<string, unknown>): void {
  fcDevMirrorScheduleLogToFile(CONFIRM_TAG, meta);
  if (__DEV__) {
    console.log(`[${CONFIRM_TAG}]`, JSON.stringify(meta));
  }
}

export async function submitTradeboardMyRequestDelete(
  reqId: string,
  opts?: { deleteUrl?: string; referer?: string },
): Promise<TradeboardPostRequestSubmitResult> {
  const id = String(reqId ?? "").trim();
  const deleteUrl = opts?.deleteUrl?.trim() || tradeboardMyRequestDeleteUrl(id);

  fcDevMirrorScheduleLogToFile(SUBMIT_TAG, { reqId: id, deleteUrl, method: "GET" });
  if (__DEV__) {
    console.log(`[${SUBMIT_TAG}]`, JSON.stringify({ deleteUrl }));
  }

  try {
    const res = await fetchFlicaHtmlUsingWebViewSession(deleteUrl, {
      method: "GET",
      referer: opts?.referer ?? TRADEBOARD_TAB_REFERER,
    });
    const html = String(res.html ?? "");
    const htmlState = detectFlicaHtmlState(html);
    const ok = res.status === 200 && htmlState === "ok";
    return {
      ok,
      status: res.status,
      htmlState,
      outcome: ok ? "success" : htmlState === "login" ? "session_expired" : "unknown",
      message: ok
        ? "Request removed from TradeBoard."
        : "FLICA did not confirm delete — refresh My Requests and try again.",
      finalUrl: String(res.url ?? deleteUrl),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      htmlState: "too_short_or_unknown",
      outcome: "unknown",
      message: msg,
      finalUrl: deleteUrl,
    };
  }
}
