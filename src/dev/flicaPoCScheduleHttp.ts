/**
 * TEMP PoC — FLICA: mainmenu (establishes session path) → token from frames → scheduledetail.cgi.
 */
import { loadFlicaLastMainmenuUrl, type FlicaStoredCookies } from './flicaPoCCookieStore';

export const FLICA_ORIGIN = 'https://jetblue.flica.net';

const USER_AGENT_SCHEDULE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

/** Single `Cookie` header value: `FLiCASession=…; FLiCAService=…; AWSALB=…; AWSALBCORS=…` (omits empty parts). */
export function buildCookieRequestHeader(c: FlicaStoredCookies): string {
  const parts: string[] = [];
  if (c.FLiCASession) parts.push(`FLiCASession=${c.FLiCASession}`);
  if (c.FLiCAService) parts.push(`FLiCAService=${c.FLiCAService}`);
  if (c.AWSALB) parts.push(`AWSALB=${c.AWSALB}`);
  if (c.AWSALBCORS) parts.push(`AWSALBCORS=${c.AWSALBCORS}`);
  return parts.join('; ');
}

export type ScheduleKeywordHints = {
  PAIRING: boolean;
  REPORT: boolean;
  JFK: boolean;
  LHR: boolean;
};

/** Case-sensitive tokens for JFK/LHR; PAIRING/REPORT matched case-insensitively. */
export function computeScheduleKeywordHints(text: string | null | undefined): ScheduleKeywordHints {
  const upper = (text ?? '').toUpperCase();
  const t = text ?? '';
  return {
    PAIRING: /\bPAIRING\b/i.test(t),
    REPORT: /\bREPORT\b/i.test(t),
    JFK: upper.includes('JFK'),
    LHR: upper.includes('LHR'),
  };
}

export type FetchScheduleDetailDirectResult = {
  status: number;
  responseUrl: string;
  bodyText: string;
  sessionExpired: boolean;
  /** Mainmenu HTML was OK but iframe/frame had no scheduledetail token= */
  noScheduleToken?: boolean;
  /** When schedule GET succeeded */
  scheduleDetailUrl?: string;
  extractedToken?: string;
};

function scheduleFetchHeaders(cookieHeader: string): HeadersInit {
  return {
    Cookie: cookieHeader,
    'User-Agent': USER_AGENT_SCHEDULE,
    Accept: 'text/html,application/xhtml+xml,*/*',
  };
}

/** Headers for mainmenu GET (matches browser-like navigation after WebView login). */
function mainMenuFetchHeaders(cookieHeader: string): HeadersInit {
  return {
    Cookie: cookieHeader ?? '',
    'User-Agent': USER_AGENT_SCHEDULE,
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `${FLICA_ORIGIN}/`,
  };
}

function finalUrl(res: Response, fallback: string): string {
  if (typeof res.url === 'string' && res.url.length > 0) return res.url;
  return fallback;
}

function looksLikeLoginUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('login') || u.includes('logon');
}

/** Same timestamp for nocache and junk (matches DevTools-style mainmenu links). */
export function buildMainMenuSessionUrl(timestampMs: number): string {
  const t = String(timestampMs);
  return `https://jetblue.flica.net/online/mainmenu.cgi?nocache=${t}&GOHM=1&junk=${t}`;
}

export function buildScheduleDetailUrlWithToken(token: string): string {
  const enc = encodeURIComponent(token);
  return `https://jetblue.flica.net/full/scheduledetail.cgi?GO=1&token=${enc}&BlockDate=0426`;
}

/**
 * Find token=… from any iframe or frame src pointing at scheduledetail.cgi.
 * Always returns `string` or `null` (never undefined).
 */
export function extractScheduledetailTokenFromMainmenuHtml(html: string | null | undefined): string | null {
  const h = html ?? '';
  const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  const srcRe = /<(?:iframe|frame)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(h)) !== null) {
    const g1 = m[1];
    if (g1 == null) continue;
    const src = unesc(String(g1).trim());
    if (!/scheduledetail\.cgi/i.test(src)) continue;
    const q = src.includes('?') ? src.split('?')[1] ?? '' : '';
    const params = new URLSearchParams(q);
    const tok = params.get('token');
    if (tok != null && tok.length > 0) return tok;
    const legacy = src.match(/[?&]token=([^&#'"]+)/i);
    if (legacy?.[1]) {
      try {
        return decodeURIComponent(legacy[1]);
      } catch {
        return null;
      }
    }
  }
  const any = h.match(/scheduledetail\.cgi[^"'<>]*[?&]token=([^&"'<>]+)/i);
  if (any?.[1] != null && any[1].length > 0) {
    try {
      return decodeURIComponent(any[1].replace(/&amp;/g, '&'));
    } catch {
      return null;
    }
  }
  return null;
}

function logMainmenuResponseForDebugging(html: string | null | undefined, mainMenuUrl: string): void {
  const safeHtml = html ?? '';
  const srcRe = /<(?:iframe|frame)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  const frameSrcs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(safeHtml)) !== null) {
    const g1 = m[1];
    frameSrcs.push((g1 != null ? String(g1) : '').replace(/&amp;/g, '&'));
  }
  const srcs = frameSrcs ?? [];
  console.log('[flica] mainmenu response', {
    requestUrl: mainMenuUrl,
    htmlLength: (safeHtml ?? '').length,
    iframeFrameSrcCount: (srcs ?? []).length,
    frameSrcs: srcs,
    htmlPreviewFirst8000: (safeHtml ?? '').slice(0, 8000),
  });
}

/**
 * 1) GET online/mainmenu.cgi?nocache=&GOHM=1&junk= (same ts) with cookies.
 * 2) Parse token from iframe/frame scheduledetail.cgi src.
 * 3) GET full/scheduledetail.cgi?GO=1&token=&BlockDate=0426
 */
export async function fetchScheduleDetailDirect(
  cookieHeader: string
): Promise<FetchScheduleDetailDirectResult> {
  try {
    const savedMain = await loadFlicaLastMainmenuUrl();
    const ts = Date.now();
    const mainMenuUrl =
      savedMain != null && savedMain.length > 0 ? savedMain : buildMainMenuSessionUrl(ts);

    const mainRes = await fetch(mainMenuUrl, {
      method: 'GET',
      headers: mainMenuFetchHeaders(cookieHeader ?? ''),
      redirect: 'follow',
    });
    const mainHtml = (await mainRes.text()) ?? '';
    const mainResponseUrl = finalUrl(mainRes, mainMenuUrl);

    logMainmenuResponseForDebugging(mainHtml, mainMenuUrl);

    if ((mainHtml ?? '').length < 500 || looksLikeLoginUrl(mainResponseUrl ?? '')) {
      return {
        status: mainRes.status,
        responseUrl: mainResponseUrl ?? '',
        bodyText: mainHtml ?? '',
        sessionExpired: true,
      };
    }

    const token = extractScheduledetailTokenFromMainmenuHtml(mainHtml);
    if (!token) {
      console.warn(
        '[flica] mainmenu HTML had no scheduledetail token; full length',
        (mainHtml ?? '').length
      );
      return {
        status: mainRes.status,
        responseUrl: mainResponseUrl ?? '',
        bodyText: mainHtml ?? '',
        sessionExpired: false,
        noScheduleToken: true,
      };
    }

    const scheduleUrl = buildScheduleDetailUrlWithToken(token);
    const res = await fetch(scheduleUrl, {
      method: 'GET',
      headers: scheduleFetchHeaders(cookieHeader ?? ''),
      redirect: 'follow',
    });

    const bodyText = (await res.text()) ?? '';
    const responseUrl = finalUrl(res, scheduleUrl);

    const shortBody = (bodyText ?? '').length < 500;
    const loginLanding = looksLikeLoginUrl(responseUrl ?? '');
    const sessionExpired = shortBody || loginLanding;

    return {
      status: res.status,
      responseUrl: responseUrl ?? '',
      bodyText: bodyText ?? '',
      sessionExpired,
      scheduleDetailUrl: scheduleUrl,
      extractedToken: token,
    };
  } catch (err) {
    const msg = 'Error: ' + String(err);
    return {
      status: 0,
      responseUrl: '',
      bodyText: msg,
      sessionExpired: false,
      noScheduleToken: true,
    };
  }
}

/** @deprecated Use pipeline inside fetchScheduleDetailDirect; kept for imports that need the shape. */
export const FLICA_SCHEDULE_DETAIL_URL = 'https://jetblue.flica.net/full/scheduledetail.cgi?GO=1&BlockDate=0426';
