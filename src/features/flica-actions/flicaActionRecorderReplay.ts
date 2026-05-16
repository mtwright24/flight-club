import { FLICA_WEBVIEW_USER_AGENT } from "../../dev/flicaPoCConfig";
import { fetchFlicaHtmlUsingWebViewSession } from "./flicaActionsHttp";
import { extractHtmlTitle } from "./flicaActionsParser";
import { mayMutateWarning } from "./flicaActionRecorderClassify";
import type { FlicaActionRecorderEvent } from "./flicaActionRecorderFormat";
import { detectFlicaPairingDetailHtml } from "./flicaPairingDetailDetect";
import type {
  FlicaReplayDryRunPayload,
  FlicaReplayGetResult,
} from "./flicaActionRecorderTypes";
import { resolveFlicaAbsoluteUrl } from "./flicaTradeBoardAllRequestsForm";

const FLICA_ORIGIN = "https://jetblue.flica.net";

export function buildReplayDryRunPayload(
  event: FlicaActionRecorderEvent,
): FlicaReplayDryRunPayload {
  const method =
    event.replayPostBody && event.formMethod.toUpperCase() === "POST" ? "POST" : "GET";
  const url = event.replayGetUrl || resolveFlicaAbsoluteUrl(event.href || event.nearestFormAction);
  const referer = event.replayReferer || event.topUrlBefore || `${FLICA_ORIGIN}/online/mainmenu.cgi`;
  const classification = event.safetyClassification;
  const warning = mayMutateWarning(classification);

  const headers: Record<string, string> = {
    Cookie: "[from WebView session snapshot at replay time]",
    "User-Agent": FLICA_WEBVIEW_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: referer,
  };
  if (method === "POST") {
    headers.Origin = FLICA_ORIGIN;
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  }

  return {
    method,
    url,
    referer,
    origin: FLICA_ORIGIN,
    userAgentNote: "FLICA_WEBVIEW_USER_AGENT from app config",
    headers,
    body: method === "POST" ? event.replayPostBody : null,
    classification,
    warning,
    willSend: false,
  };
}

/**
 * Replay a captured GET using the WebView cookie snapshot only.
 * Blocked for MAY_MUTATE unless `forceManualDev` is true (settings dev only).
 */
export async function replayCapturedGet(
  event: FlicaActionRecorderEvent,
  options?: { forceManualDev?: boolean },
): Promise<FlicaReplayGetResult> {
  const url = event.replayGetUrl || resolveFlicaAbsoluteUrl(event.href);
  if (!url || url.startsWith("javascript:")) {
    return {
      ok: false,
      status: 0,
      htmlLength: 0,
      title: "",
      error: "No replayable GET URL on this event",
      classification: event.safetyClassification,
      html: "",
      finalUrl: url,
      requestedUrl: url,
    };
  }

  if (event.safetyClassification === "MAY_MUTATE" && !options?.forceManualDev) {
    return {
      ok: false,
      status: 0,
      htmlLength: 0,
      title: "",
      error: mayMutateWarning("MAY_MUTATE") ?? "Blocked",
      classification: event.safetyClassification,
      html: "",
      finalUrl: url,
      requestedUrl: url,
    };
  }

  try {
    const referer = event.replayReferer || event.topUrlBefore;
    const { status, html, url: finalUrl } = await fetchFlicaHtmlUsingWebViewSession(url, { referer });
    const pairingDetail = detectFlicaPairingDetailHtml(html);
    const httpOk = status >= 200 && status < 400;
    const ok = httpOk && (html.length > 0 || pairingDetail.isPairingDetail);
    return {
      ok,
      status,
      htmlLength: html.length,
      title: extractHtmlTitle(html) ?? "",
      classification: event.safetyClassification,
      html,
      finalUrl: finalUrl || url,
      requestedUrl: url,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      htmlLength: 0,
      title: "",
      error: e instanceof Error ? e.message : String(e),
      classification: event.safetyClassification,
      html: "",
      finalUrl: url,
      requestedUrl: url,
    };
  }
}

/** Never sends POST — returns payload only. */
export function replayCapturedPostDryRun(event: FlicaActionRecorderEvent): FlicaReplayDryRunPayload {
  return buildReplayDryRunPayload({
    ...event,
    formMethod: "POST",
    replayPostBody: event.replayPostBody,
  });
}
