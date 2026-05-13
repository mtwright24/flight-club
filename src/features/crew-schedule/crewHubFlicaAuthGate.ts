import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import {
  flicaFetchNeedsWebVerification,
  prepareFlicaActionsSession,
  syncWebViewSessionSnapshotFromSavedCookies,
} from "../flica-actions/flicaActionsHttp";
import type {
  FlicaActionsFetchResult,
  FlicaSessionPrepResult,
} from "../flica-actions/flicaActionsTypes";

export function logCrewHubAuth(phase: string, payload: Record<string, unknown> = {}) {
  fcDevMirrorScheduleLogToFile("FC_CREW_HUB_AUTH", { phase, ...payload });
}

/** True when the Tradeboard/OpenTime native result means user must use the verification sheet. */
export function crewHubNativeFetchNeedsVerificationSheet(
  r: FlicaActionsFetchResult,
): boolean {
  if (flicaFetchNeedsWebVerification(r.htmlState)) return true;
  const msg = String(r.error ?? "").toLowerCase();
  return (
    msg.includes("webview session not ready") ||
    msg.includes("re-authenticate") ||
    msg.includes("no flica session cookies") ||
    msg.includes("log in via flica webview")
  );
}

/**
 * Same HTTP session chain as schedule sync: mainmenu → LoadSchedule → leftmenu validation,
 * then mirror cookies into the Actions WebView snapshot used by native Tradeboard/OpenTime GETs.
 */
export async function runCrewHubFlicaSessionPrep(
  context: string,
): Promise<{ ok: boolean; prep: FlicaSessionPrepResult }> {
  logCrewHubAuth("auth_helper_start", { context });
  const prep = await prepareFlicaActionsSession();
  logCrewHubAuth("prepare_done", {
    context,
    ok: prep.ok,
    reason: prep.reason ?? "",
    mainMenuHtmlState: prep.debug?.mainMenuHtmlState,
    leftMenuHtmlState: prep.debug?.leftMenuHtmlState,
    mainMenuLen: prep.debug?.mainMenuLength,
    leftMenuLen: prep.debug?.leftMenuLength,
  });
  if (prep.ok) {
    const synced = await syncWebViewSessionSnapshotFromSavedCookies();
    logCrewHubAuth("snapshot_synced", { context, synced });
  }
  return { ok: prep.ok, prep };
}
