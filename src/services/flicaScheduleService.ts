/**
 * Production FLICA integration: SecureStore credentials/cookies, URL builders, token helpers, multi-month schedule fetch.
 * Airline host is `https://[subdomain].flica.net` — use `loadFlicaAirlineSubdomain` + `buildFlicaUrls` in product flows.
 */
import * as SecureStore from 'expo-secure-store';

// —— SecureStore keys (aligned with legacy PoC) ——

const KEY_USER = 'flica_username';
const KEY_PASS = 'flica_password';
const KEY_SUB = 'flica_airline_subdomain';
const KEY_SESSION = 'flica_session';
const KEY_SERVICE = 'flica_service';
const KEY_AWSALB = 'flica_awsalb';
const KEY_AWSALBCORS = 'flica_awsalbcors';

export function normalizeFlicaSubdomainInput(raw: string): string {
  let s = (raw ?? '').trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/\.flica\.net.*$/, '');
  s = s.replace(/\/.*$/, '');
  s = s.replace(/[^a-z0-9-]+/g, '');
  return s;
}

/**
 * All FLICA UI + fetch URLs for a given airline subdomain (e.g. `jetblue` → jetblue.flica.net).
 * Login uses `/ui/login/index.html` (not legacy /public/ paths).
 */
export function buildFlicaUrls(subdomain: string) {
  const s = normalizeFlicaSubdomainInput(subdomain);
  const host = s ? `${s}.flica.net` : 'flica.net';
  const origin = `https://${host}`;
  return {
    ORIGIN: origin,
    LOGIN: `${origin}/ui/login/index.html`,
    HOME: `${origin}/ui/home/index.html`,
    LOGON_CGI: `${origin}/public/flicalogon.cgi`,
    MAINMENU: `${origin}/online/mainmenu.cgi`,
    MAINMENU_LOADSCHEDULE: `${origin}/online/mainmenu.cgi?LoadSchedule=true&IsMobile=false`,
    LEFTMENU: `${origin}/online/leftmenu.cgi?whosepage=Crewmember`,
    SCHEDULE_DETAIL: `${origin}/full/scheduledetail.cgi`,
    OPENTIME_FRAME: `${origin}/full/otframe.cgi?BCID=029.054&ViewOT=1`,
    OPENTIME_POT: `${origin}/full/otopentimepot.cgi`,
    TRADEBOARD_FRAME: `${origin}/online/tb_frame.cgi?BCID=002.000&dp=mr`,
    TRADEBOARD_ALL: `${origin}/online/tb_otherrequests.cgi?bcid=002.000`,
    TRADEBOARD_FAVORITES: `${origin}/online/tb_myfavorites.cgi?bcid=002.000`,
    TRADEBOARD_RESPONSES: `${origin}/online/tb_myresponses.cgi?bcid=002.000`,
    TRADEBOARD_POST: `${origin}/online/tb_postrequest.cgi?bcid=002.000`,
    TRADEBOARD_SUBMIT: `${origin}/online/TB_postrequest.cgi?BCID=002.000`,
    OT_REQUEST: `${origin}/full/otrequest.cgi`,
    OT_DROP: `${origin}/full/otdrop.cgi`,
    OT_SWAP: `${origin}/full/otswap2.cgi`,
    REQUEST_STATUS: `${origin}/full/otrequest.cgi`,
  } as const;
}

/** Legacy default host for dev/test call sites; product screens should use `buildFlicaUrls` + saved subdomain. */
export const FLICA_URLS = buildFlicaUrls('jetblue');

export async function loadFlicaAirlineSubdomain(): Promise<string | null> {
  const v = await SecureStore.getItemAsync(KEY_SUB);
  const n = normalizeFlicaSubdomainInput(v ?? '');
  return n.length > 0 ? n : null;
}

export async function saveFlicaAirlineSubdomain(raw: string): Promise<void> {
  const s = normalizeFlicaSubdomainInput(raw);
  if (!s) {
    throw new Error('Enter your airline FLICA host (e.g. jetblue for jetblue.flica.net).');
  }
  await SecureStore.setItemAsync(KEY_SUB, s);
}

export const FLICA_CONSTANTS = {
  BCID_OPENTIME: '029.054',
  BCID_TRADEBOARD: '002.000',
  BASE_JFK: 'JFK',
  CC_JA: 'J_A',
  USER_AGENT:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
} as const;

export type FlicaCookiesInput = Partial<{
  FLiCASession: string;
  FLiCAService: string;
  AWSALB: string;
  AWSALBCORS: string;
}>;

const TOKEN1_RE = /scheduledetail\.cgi[^'"]*token=([0-9A-Fa-f]+)/i;
const TOKEN2_RE = /GO=1&token=([0-9A-Fa-f]+)/;

/**
 * FLICA schedule GETs — same header shape as `baseGetHeaders` in `flicaPoCScheduleHttp` (no `sec-fetch-*`);
 * those nav-only hints are not part of the proven Charles / Mobile Safari string set for this CGI.
 */
function buildFlicaScheduledetailFetchHeaders(
  cookieHeader: string,
  refererUrl?: string
): Record<string, string> {
  const h: Record<string, string> = {
    Cookie: cookieHeader,
    'User-Agent': FLICA_CONSTANTS.USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  const ref = (refererUrl ?? '').trim();
  if (ref.length > 0) h.Referer = ref;
  return h;
}

export async function saveFlicaCredentials(username: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_USER, username.trim());
  await SecureStore.setItemAsync(KEY_PASS, password);
}

export async function loadFlicaCredentials(): Promise<{ username: string; password: string } | null> {
  const [u, p] = await Promise.all([SecureStore.getItemAsync(KEY_USER), SecureStore.getItemAsync(KEY_PASS)]);
  const username = u?.trim() ?? '';
  if (!username || p == null || p.length === 0) return null;
  return { username, password: p };
}

export async function clearFlicaSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_USER).catch(() => {}),
    SecureStore.deleteItemAsync(KEY_PASS).catch(() => {}),
    SecureStore.deleteItemAsync(KEY_SESSION).catch(() => {}),
    SecureStore.deleteItemAsync(KEY_SERVICE).catch(() => {}),
    SecureStore.deleteItemAsync(KEY_AWSALB).catch(() => {}),
    SecureStore.deleteItemAsync(KEY_AWSALBCORS).catch(() => {}),
  ]);
}

export async function saveFlicaCookies(cookies: FlicaCookiesInput): Promise<void> {
  const entries: [string, string | undefined][] = [
    [KEY_SESSION, cookies.FLiCASession],
    [KEY_SERVICE, cookies.FLiCAService],
    [KEY_AWSALB, cookies.AWSALB],
    [KEY_AWSALBCORS, cookies.AWSALBCORS],
  ];
  for (const [key, val] of entries) {
    if (val != null && String(val).length > 0) {
      await SecureStore.setItemAsync(key, String(val));
    } else {
      await SecureStore.deleteItemAsync(key).catch(() => {});
    }
  }
}

export async function loadFlicaCookies(): Promise<string | null> {
  const [session, service, alb, cors] = await Promise.all([
    SecureStore.getItemAsync(KEY_SESSION),
    SecureStore.getItemAsync(KEY_SERVICE),
    SecureStore.getItemAsync(KEY_AWSALB),
    SecureStore.getItemAsync(KEY_AWSALBCORS),
  ]);
  const hasSession = session != null && session.length > 0;
  const hasService = service != null && service.length > 0;
  if (!hasSession && !hasService) return null;

  const parts: string[] = [];
  if (hasSession) parts.push(`FLiCASession=${session}`);
  if (hasService) parts.push(`FLiCAService=${service}`);
  if (alb != null && alb.length > 0) parts.push(`AWSALB=${alb}`);
  if (cors != null && cors.length > 0) parts.push(`AWSALBCORS=${cors}`);
  return parts.join('; ');
}

export async function fetchFlicaScheduleAllMonths(
  cookieHeader: string,
  token1: string,
  options?: {
    /** Must match the WebView airline host (same as `buildFlicaUrls(…).SCHEDULE_DETAIL`); default is legacy `FLICA_URLS`. */
    scheduleDetailBaseUrl?: string;
    /** e.g. `…/mainmenu.cgi?LoadSchedule=true&IsMobile=false` — matches PoC `runFlicaFcvHttpScheduledetailOnly` WebView path. */
    refererUrl?: string;
  }
): Promise<{ march: string; april: string; may: string }> {
  const detailBase = (options?.scheduleDetailBaseUrl?.trim() || FLICA_URLS.SCHEDULE_DETAIL).replace(/\/$/, '');
  const referer = options?.refererUrl;
  const headers = buildFlicaScheduledetailFetchHeaders(cookieHeader, referer);
  const step2Url = `${detailBase}?BlockDate=0426&token=${encodeURIComponent(token1)}`;
  let step2Res: Response;
  try {
    step2Res = await fetch(step2Url, { method: 'GET', headers: headers as HeadersInit, redirect: 'follow' });
  } catch (e) {
    throw new Error(`FLICA scheduledetail step1 failed: ${String(e)}`);
  }
  const step2Html = (await step2Res.text()) ?? '';
  if (!step2Res.ok) {
    throw new Error(`FLICA scheduledetail step1 HTTP ${step2Res.status} (${step2Html.length} bytes)`);
  }
  const token2 = extractToken2FromHtml(step2Html);
  if (!token2) {
    throw new Error('FLICA: no GO=1 token in scheduledetail step1 HTML');
  }

  /** Same as PoC `runScheduledetailGo1MultiMonth`: GO=1 fetches use step-1 scheduledetail as Referer. */
  const go1Referer =
    (typeof step2Res.url === 'string' && step2Res.url.length > 0 ? step2Res.url : step2Url) || step2Url;
  const goHeaders = buildFlicaScheduledetailFetchHeaders(cookieHeader, go1Referer);

  const blocks = [
    { key: 'march' as const, blockDate: '0326' },
    { key: 'april' as const, blockDate: '0426' },
    { key: 'may' as const, blockDate: '0526' },
  ];
  const out: { march: string; april: string; may: string } = { march: '', april: '', may: '' };

  for (const { key, blockDate } of blocks) {
    const junk = Date.now();
    const u = `${detailBase}?GO=1&token=${encodeURIComponent(token2)}&BlockDate=${blockDate}&JUNK=${junk}`;
    let r: Response;
    try {
      r = await fetch(u, { method: 'GET', headers: goHeaders as HeadersInit, redirect: 'follow' });
    } catch (e) {
      throw new Error(`FLICA scheduledetail ${key} failed: ${String(e)}`);
    }
    const html = (await r.text()) ?? '';
    if (!r.ok) {
      throw new Error(`FLICA scheduledetail ${key} HTTP ${r.status} (${html.length} bytes)`);
    }
    out[key] = html;
    if (key === 'april') {
      const april = html;
      console.log('[FULL APRIL HTML START]');
      console.log(april);
      console.log('[FULL APRIL HTML END]');
    }
  }

  return out;
}

export function extractToken1FromHtml(html: string): string | null {
  const m = (html ?? '').match(TOKEN1_RE);
  return m?.[1]?.length ? m[1] : null;
}

export function extractToken2FromHtml(html: string): string | null {
  const m = (html ?? '').match(TOKEN2_RE);
  return m?.[1]?.length ? m[1] : null;
}
