/**
 * FLICA Actions dev WebView session: after Actions WebView authenticates, native tests
 * use this snapshot only (no mainmenu / leftmenu preflight).
 */
import * as SecureStore from "expo-secure-store";

import type { FlicaStoredCookies } from "../../dev/flicaPoCCookieStore";

export const FLICA_ACTIONS_SESSION_READY_AT_KEY = "flica_actions_session_ready_at";
export const FLICA_ACTIONS_WEBVIEW_COOKIE_SNAPSHOT_KEY =
  "flica_actions_webview_cookie_snapshot";

export type FlicaActionsWebViewSessionMeta = {
  readyAt: string;
  cookies: FlicaStoredCookies;
};

export async function markFlicaActionsWebViewSessionReady(
  cookies: FlicaStoredCookies,
): Promise<void> {
  const readyAt = new Date().toISOString();
  await SecureStore.setItemAsync(FLICA_ACTIONS_SESSION_READY_AT_KEY, readyAt);
  await SecureStore.setItemAsync(
    FLICA_ACTIONS_WEBVIEW_COOKIE_SNAPSHOT_KEY,
    JSON.stringify({
      FLiCASession: cookies.FLiCASession,
      FLiCAService: cookies.FLiCAService,
      AWSALB: cookies.AWSALB,
      AWSALBCORS: cookies.AWSALBCORS,
    } satisfies FlicaStoredCookies),
  );
}

export async function clearFlicaActionsWebViewSessionReady(): Promise<void> {
  await SecureStore.deleteItemAsync(FLICA_ACTIONS_SESSION_READY_AT_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(FLICA_ACTIONS_WEBVIEW_COOKIE_SNAPSHOT_KEY).catch(
    () => {},
  );
}

export async function getFlicaActionsWebViewSession(): Promise<FlicaActionsWebViewSessionMeta | null> {
  const readyAt = await SecureStore.getItemAsync(FLICA_ACTIONS_SESSION_READY_AT_KEY);
  const raw = await SecureStore.getItemAsync(FLICA_ACTIONS_WEBVIEW_COOKIE_SNAPSHOT_KEY);
  if (!readyAt?.trim() || !raw?.trim()) return null;
  try {
    const cookies = JSON.parse(raw) as FlicaStoredCookies;
    if (!(cookies.FLiCASession || cookies.FLiCAService)) return null;
    return { readyAt: readyAt.trim(), cookies };
  } catch {
    return null;
  }
}
