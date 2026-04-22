/**
 * Production FLICA (JetBlue) integration: SecureStore credentials/cookies, URL constants, token helpers, multi-month schedule fetch.
 */
import * as SecureStore from 'expo-secure-store';

// —— SecureStore keys (aligned with legacy PoC) ——

const KEY_USER = 'flica_username';
const KEY_PASS = 'flica_password';
const KEY_SESSION = 'flica_session';
const KEY_SERVICE = 'flica_service';
const KEY_AWSALB = 'flica_awsalb';
const KEY_AWSALBCORS = 'flica_awsalbcors';

export const FLICA_URLS = {
  LOGIN: 'https://jetblue.flica.net/ui/public/login/index.html',
  LOGON_CGI: 'https://jetblue.flica.net/public/flicalogon.cgi',
  MAINMENU: 'https://jetblue.flica.net/online/mainmenu.cgi',
  MAINMENU_LOADSCHEDULE:
    'https://jetblue.flica.net/online/mainmenu.cgi?LoadSchedule=true&IsMobile=false',
  LEFTMENU: 'https://jetblue.flica.net/online/leftmenu.cgi?whosepage=Crewmember',
  SCHEDULE_DETAIL: 'https://jetblue.flica.net/full/scheduledetail.cgi',
  OPENTIME_FRAME: 'https://jetblue.flica.net/full/otframe.cgi?BCID=029.054&ViewOT=1',
  OPENTIME_POT: 'https://jetblue.flica.net/full/otopentimepot.cgi',
  TRADEBOARD_FRAME: 'https://jetblue.flica.net/online/tb_frame.cgi?BCID=002.000&dp=mr',
  TRADEBOARD_ALL: 'https://jetblue.flica.net/online/tb_otherrequests.cgi?bcid=002.000',
  TRADEBOARD_FAVORITES: 'https://jetblue.flica.net/online/tb_myfavorites.cgi?bcid=002.000',
  TRADEBOARD_RESPONSES: 'https://jetblue.flica.net/online/tb_myresponses.cgi?bcid=002.000',
  TRADEBOARD_POST: 'https://jetblue.flica.net/online/tb_postrequest.cgi?bcid=002.000',
  TRADEBOARD_SUBMIT: 'https://jetblue.flica.net/online/TB_postrequest.cgi?BCID=002.000',
  OT_REQUEST: 'https://jetblue.flica.net/full/otrequest.cgi',
  OT_DROP: 'https://jetblue.flica.net/full/otdrop.cgi',
  OT_SWAP: 'https://jetblue.flica.net/full/otswap2.cgi',
  REQUEST_STATUS: 'https://jetblue.flica.net/full/otrequest.cgi',
} as const;

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

function buildFetchHeaders(cookieHeader: string): Record<string, string> {
  return {
    Cookie: cookieHeader,
    'User-Agent': FLICA_CONSTANTS.USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-fetch-site': 'none',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
  };
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
  token1: string
): Promise<{ march: string; april: string; may: string }> {
  const headers = buildFetchHeaders(cookieHeader);
  const step2Url = `${FLICA_URLS.SCHEDULE_DETAIL}?BlockDate=0426&token=${encodeURIComponent(token1)}`;
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

  const blocks = [
    { key: 'march' as const, blockDate: '0326' },
    { key: 'april' as const, blockDate: '0426' },
    { key: 'may' as const, blockDate: '0526' },
  ];
  const out: { march: string; april: string; may: string } = { march: '', april: '', may: '' };

  for (const { key, blockDate } of blocks) {
    const junk = Date.now();
    const u = `${FLICA_URLS.SCHEDULE_DETAIL}?GO=1&token=${encodeURIComponent(token2)}&BlockDate=${blockDate}&JUNK=${junk}`;
    let r: Response;
    try {
      r = await fetch(u, { method: 'GET', headers: headers as HeadersInit, redirect: 'follow' });
    } catch (e) {
      throw new Error(`FLICA scheduledetail ${key} failed: ${String(e)}`);
    }
    const html = (await r.text()) ?? '';
    if (!r.ok) {
      throw new Error(`FLICA scheduledetail ${key} HTTP ${r.status} (${html.length} bytes)`);
    }
    out[key] = html;
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
