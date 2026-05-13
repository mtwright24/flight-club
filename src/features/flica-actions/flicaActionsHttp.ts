import { Platform } from "react-native";
import {
  loadFlicaCookiesFromSecureStore,
  flicaSessionFromNativeCookieManagerMerged,
} from "../../dev/flicaPoCCookieStore";
import { FLICA_WEBVIEW_USER_AGENT } from "../../dev/flicaPoCConfig";
import type {
  FlicaActionsCookies,
  FlicaHtmlState,
  FlicaSessionPrepResult,
} from "./flicaActionsTypes";
import { extractHtmlTitle } from "./flicaActionsParser";
import {
  getFlicaActionsWebViewSession,
  markFlicaActionsWebViewSessionReady,
} from "./flicaActionsWebViewSession";
import type { FlicaStoredCookies } from "../../dev/flicaPoCCookieStore";

const FLICA_BASE = "https://jetblue.flica.net";

export const FLICA_ACTIONS_URLS = {
  LEFT_MENU: `${FLICA_BASE}/online/leftmenu.cgi?whosepage=Crewmember`,
  MAIN_MENU: `${FLICA_BASE}/online/mainmenu.cgi?nocache=`,
  MAIN_MENU_LOAD_SCHEDULE: `${FLICA_BASE}/online/mainmenu.cgi?LoadSchedule=true&IsMobile=false`,
  OPENTIME_FRAME: `${FLICA_BASE}/full/otframe.cgi?BCID=029.054&ViewOT=1`,
  OPENTIME_POT: `${FLICA_BASE}/full/otopentimepot.cgi`,
  TRADEBOARD_FRAME: `${FLICA_BASE}/online/tb_frame.cgi?BCID=002.000&dp=mr`,
  TRADEBOARD_ALL: `${FLICA_BASE}/online/tb_otherrequests.cgi?bcid=002.000`,
} as const;

const LEFT_MENU_MARKERS = [
  "bidding",
  "tradeboard",
  "opentime",
  "submit or view requests",
  "view or print pairings",
  "crewmember",
];

/** True when native HTML indicates the user should complete FLICA in WebView before retrying fetch. */
export function flicaFetchNeedsWebVerification(htmlState: FlicaHtmlState | undefined): boolean {
  return (
    htmlState === "captcha_required" ||
    htmlState === "login_required" ||
    htmlState === "application_error"
  );
}

export function detectFlicaHtmlState(html: string): FlicaHtmlState {
  const h = String(html ?? "");
  const lower = h.toLowerCase();
  const len = h.length;

  if (
    lower.includes("application error") ||
    lower.includes("flica.net - application error")
  ) {
    return "application_error";
  }

  if (
    lower.includes("g-recaptcha") ||
    lower.includes("recaptcha") ||
    lower.includes("grecaptcha.getresponse") ||
    lower.includes("turnstile")
  ) {
    return "captcha_required";
  }

  if (
    (lower.includes("userid") || lower.includes("user id")) &&
    lower.includes("password") &&
    (lower.includes("flicalogon") || lower.includes("login"))
  ) {
    return "login_required";
  }

  if (len < 200) {
    return "too_short_or_unknown";
  }

  const hasAppMarkers =
    lower.includes("flica") ||
    lower.includes("mainmenu") ||
    lower.includes("leftmenu") ||
    lower.includes("crewmember") ||
    lower.includes("schedule") ||
    lower.includes("pairing") ||
    lower.includes("bidding") ||
    lower.includes("tradeboard") ||
    lower.includes("opentime");

  if (!hasAppMarkers && len < 600) {
    return "too_short_or_unknown";
  }

  return "ok";
}

export async function getSavedFlicaActionsCookies(): Promise<FlicaActionsCookies> {
  let cookies: FlicaActionsCookies = {};

  if (Platform.OS !== "web") {
    const native = await flicaSessionFromNativeCookieManagerMerged();
    cookies = { ...native };
  }

  const stored = await loadFlicaCookiesFromSecureStore();
  return {
    FLiCASession: cookies.FLiCASession || stored.FLiCASession,
    FLiCAService: cookies.FLiCAService || stored.FLiCAService,
    AWSALB: cookies.AWSALB || stored.AWSALB,
    AWSALBCORS: cookies.AWSALBCORS || stored.AWSALBCORS,
  };
}

export function buildFlicaCookieHeader(cookies: FlicaActionsCookies): string {
  const parts: string[] = [];
  if (cookies.FLiCASession) parts.push(`FLiCASession=${cookies.FLiCASession}`);
  if (cookies.FLiCAService) parts.push(`FLiCAService=${cookies.FLiCAService}`);
  if (cookies.AWSALB) parts.push(`AWSALB=${cookies.AWSALB}`);
  if (cookies.AWSALBCORS) parts.push(`AWSALBCORS=${cookies.AWSALBCORS}`);
  return parts.join("; ");
}

/**
 * Align the Actions WebView cookie snapshot (used by native Tradeboard/OpenTime GETs) with the
 * same merged cookies {@link prepareFlicaActionsSession} uses — same chain as schedule sync HTTP prep.
 */
export async function syncWebViewSessionSnapshotFromSavedCookies(): Promise<boolean> {
  const cookies = await getSavedFlicaActionsCookies();
  if (!(cookies.FLiCASession || cookies.FLiCAService)) return false;
  const snap: FlicaStoredCookies = {
    FLiCASession: cookies.FLiCASession,
    FLiCAService: cookies.FLiCAService,
    AWSALB: cookies.AWSALB,
    AWSALBCORS: cookies.AWSALBCORS,
  };
  await markFlicaActionsWebViewSessionReady(snap);
  return true;
}

/**
 * GET using only the FLICA Actions WebView cookie snapshot (no CookieManager merge, no mainmenu
 * preflight). Use after Actions WebView shows "Native fetch enabled".
 */
export type FlicaWebViewSessionFetchOptions = {
  referer?: string;
  method?: "GET" | "POST";
  /** Use with POST; sent as-is (caller should URL-encode). */
  body?: string;
  /** Defaults to application/x-www-form-urlencoded when body is set and method is POST. */
  contentType?: string;
};

export async function fetchFlicaHtmlUsingWebViewSession(
  url: string,
  options?: FlicaWebViewSessionFetchOptions,
): Promise<{ status: number; html: string; url: string }> {
  const session = await getFlicaActionsWebViewSession();
  if (!session) {
    throw new Error(
      'FLICA Actions WebView session not ready. Open the Actions WebView until you see "Native fetch enabled", then retry.',
    );
  }
  const cookieHeader = buildFlicaCookieHeader(session.cookies);
  if (!cookieHeader) {
    throw new Error(
      "FLICA Actions WebView snapshot has no session cookies. Re-authenticate in the Actions WebView.",
    );
  }

  const method = (options?.method ?? "GET").toUpperCase() === "POST" ? "POST" : "GET";
  const headers: Record<string, string> = {
    Cookie: cookieHeader,
    "User-Agent": FLICA_WEBVIEW_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (options?.referer) {
    headers["Referer"] = options.referer;
  }
  if (method === "POST" && options?.body != null) {
    headers["Content-Type"] =
      options.contentType ?? "application/x-www-form-urlencoded; charset=UTF-8";
    headers.Origin = FLICA_BASE;
  }

  const resp = await fetch(url, {
    method,
    headers,
    body: method === "POST" && options?.body != null ? options.body : undefined,
    redirect: "follow",
    credentials: "omit",
  });

  const html = await resp.text();
  return { status: resp.status, html, url: resp.url || url };
}

export async function fetchFlicaHtml(
  url: string,
  options?: { referer?: string },
): Promise<{ status: number; html: string; url: string }> {
  const cookies = await getSavedFlicaActionsCookies();
  const cookieHeader = buildFlicaCookieHeader(cookies);

  if (!cookieHeader) {
    throw new Error(
      "No FLICA session cookies found. Log in via FLICA WebView first.",
    );
  }

  const headers: Record<string, string> = {
    Cookie: cookieHeader,
    "User-Agent": FLICA_WEBVIEW_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (options?.referer) {
    headers["Referer"] = options.referer;
  }

  const resp = await fetch(url, {
    method: "GET",
    headers,
    redirect: "follow",
    credentials: "omit",
  });

  const html = await resp.text();
  return { status: resp.status, html, url: resp.url || url };
}

function hasRealLeftMenuContent(html: string): boolean {
  const lower = String(html ?? "").toLowerCase();
  let matchCount = 0;
  for (const marker of LEFT_MENU_MARKERS) {
    if (lower.includes(marker)) matchCount++;
  }
  return matchCount >= 3;
}

export async function prepareFlicaActionsSession(): Promise<FlicaSessionPrepResult> {
  const cookies = await getSavedFlicaActionsCookies();
  const cookieHeader = buildFlicaCookieHeader(cookies);

  if (!cookieHeader) {
    return {
      ok: false,
      reason: "No FLICA session cookies found. Log in via FLICA WebView first.",
      cookies,
      debug: {},
    };
  }

  const headers: Record<string, string> = {
    Cookie: cookieHeader,
    "User-Agent": FLICA_WEBVIEW_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  let mainMenuHtml = "";
  let mainMenuStatus = 0;
  let mainMenuFinalUrl = "";

  try {
    const mainRes = await fetch(
      `${FLICA_ACTIONS_URLS.MAIN_MENU}${Date.now()}`,
      { method: "GET", headers, redirect: "follow", credentials: "omit" },
    );
    mainMenuStatus = mainRes.status;
    mainMenuHtml = await mainRes.text();
    mainMenuFinalUrl = mainRes.url || `${FLICA_ACTIONS_URLS.MAIN_MENU}`;
  } catch (e) {
    return {
      ok: false,
      reason: `Main menu fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      cookies,
      debug: {},
    };
  }

  const mainState = detectFlicaHtmlState(mainMenuHtml);
  const mainTitle = extractHtmlTitle(mainMenuHtml);

  if (mainState !== "ok") {
    return {
      ok: false,
      reason: `Main menu returned state "${mainState}". Title: ${mainTitle ?? "(none)"}. Session may be expired or blocked.`,
      cookies,
      debug: {
        mainMenuStatus,
        mainMenuHtmlState: mainState,
        mainMenuTitle: mainTitle,
        mainMenuLength: mainMenuHtml.length,
      },
    };
  }

  let loadScheduleUrl = mainMenuFinalUrl;
  try {
    const lsRes = await fetch(FLICA_ACTIONS_URLS.MAIN_MENU_LOAD_SCHEDULE, {
      method: "GET",
      headers,
      redirect: "follow",
      credentials: "omit",
    });
    const lsHtml = await lsRes.text();
    const lsState = detectFlicaHtmlState(lsHtml);
    if (lsState === "ok") {
      loadScheduleUrl = lsRes.url || FLICA_ACTIONS_URLS.MAIN_MENU_LOAD_SCHEDULE;
    }
  } catch {
    // Non-fatal: continue with basic mainmenu URL as referer
  }

  let leftMenuHtml = "";
  let leftMenuStatus = 0;
  try {
    const lmRes = await fetch(FLICA_ACTIONS_URLS.LEFT_MENU, {
      method: "GET",
      headers: { ...headers, Referer: loadScheduleUrl },
      redirect: "follow",
      credentials: "omit",
    });
    leftMenuStatus = lmRes.status;
    leftMenuHtml = await lmRes.text();
  } catch (e) {
    return {
      ok: false,
      reason: `Left menu fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      cookies,
      debug: {
        mainMenuStatus,
        mainMenuHtmlState: mainState,
        mainMenuTitle: mainTitle,
        mainMenuLength: mainMenuHtml.length,
      },
    };
  }

  const leftState = detectFlicaHtmlState(leftMenuHtml);
  const leftTitle = extractHtmlTitle(leftMenuHtml);

  if (leftState !== "ok" || !hasRealLeftMenuContent(leftMenuHtml)) {
    return {
      ok: false,
      reason:
        leftState !== "ok"
          ? `Left menu returned state "${leftState}". Title: ${leftTitle ?? "(none)"}.`
          : "Saved cookies exist, but native HTTP did not reach ready FLICA menu. Need WebView refresh/verification first.",
      leftMenuHtml,
      mainMenuUrl: loadScheduleUrl,
      cookies,
      debug: {
        mainMenuStatus,
        mainMenuHtmlState: mainState,
        mainMenuTitle: mainTitle,
        mainMenuLength: mainMenuHtml.length,
        leftMenuStatus,
        leftMenuHtmlState: leftState,
        leftMenuTitle: leftTitle,
        leftMenuLength: leftMenuHtml.length,
      },
    };
  }

  return {
    ok: true,
    leftMenuHtml,
    mainMenuUrl: loadScheduleUrl,
    cookies,
    debug: {
      mainMenuStatus,
      mainMenuHtmlState: mainState,
      mainMenuTitle: mainTitle,
      mainMenuLength: mainMenuHtml.length,
      leftMenuStatus,
      leftMenuHtmlState: leftState,
      leftMenuTitle: leftTitle,
      leftMenuLength: leftMenuHtml.length,
    },
  };
}
