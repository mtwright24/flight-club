/**
 * FCV-matched FLICA import: flicalogon POST → Set-Cookie → mainmenu (LoadSchedule) → token → scheduledetail HTML.
 * Charles / Mobile Safari style headers.
 * iOS: Set-Cookie is often not visible to fetch(); session cookies are merged from CookieManager (native store).
 */
import CookieManager from '@react-native-community/cookies';
import {
  type FlicaStoredCookies,
  FLICA_COOKIE_MANAGER_GET_URLS,
  flicaStoredCookiesFromNativeJar,
  loadFlicaCredentials,
  loadFlicaCookiesFromSecureStore,
  mergeFlicaStoredCookiesPreferRight,
  saveFlicaCookiesToSecureStore,
} from './flicaPoCCookieStore';

export const FLICA_ORIGIN = 'https://jetblue.flica.net';

const FLIC_LOGON_URL = 'https://jetblue.flica.net/public/flicalogon.cgi';
const MAINMENU_LOAD_SCHEDULE_URL =
  'https://jetblue.flica.net/online/mainmenu.cgi?LoadSchedule=true&IsMobile=false';
const LEFTMENU_URL = 'https://jetblue.flica.net/online/leftmenu.cgi';

const USER_AGENT_FCV =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

const HEADER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const HEADER_ACCEPT_LANG = 'en-US,en;q=0.9';

export type ScheduleKeywordHints = {
  PAIRING: boolean;
  REPORT: boolean;
  JFK: boolean;
  LHR: boolean;
};

export function computeScheduleKeywordHints(text: string | null | undefined): ScheduleKeywordHints {
  const t = text ?? '';
  const upper = t.toUpperCase();
  return {
    PAIRING: /\bPAIRING\b/i.test(t),
    REPORT: /\bREPORT\b/i.test(t),
    JFK: upper.includes('JFK'),
    LHR: upper.includes('LHR'),
  };
}

function baseGetHeaders(cookieHeader: string): Record<string, string> {
  return {
    Cookie: cookieHeader,
    'User-Agent': USER_AGENT_FCV,
    Accept: HEADER_ACCEPT,
    'Accept-Language': HEADER_ACCEPT_LANG,
  };
}

function baseGetHeadersWithReferer(cookieHeader: string, referer: string): Record<string, string> {
  return {
    ...baseGetHeaders(cookieHeader),
    Referer: referer,
  };
}

function collectSetCookieLines(res: Response): string[] {
  const h = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === 'function') {
    return h.getSetCookie();
  }
  const single = res.headers.get('set-cookie') ?? res.headers.get('Set-Cookie');
  if (single) return [single];
  return [];
}

/** First name=value of each Set-Cookie line. */
function parseSetCookieLine(line: string): { name: string; value: string } | null {
  const part = (line ?? '').split(';')[0].trim();
  if (!part) return null;
  const eq = part.indexOf('=');
  if (eq < 0) return null;
  return { name: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim() };
}

/** Extract FLiCASession / FLiCAService (and optional AWSALB) from Set-Cookie headers. */
export function sessionCookiesFromSetCookieResponse(res: Response): FlicaStoredCookies {
  const lines = collectSetCookieLines(res);
  const out: FlicaStoredCookies = {};
  for (const line of lines) {
    const nv = parseSetCookieLine(line);
    if (!nv) continue;
    if (nv.name === 'FLiCASession') out.FLiCASession = nv.value;
    if (nv.name === 'FLiCAService') out.FLiCAService = nv.value;
    if (nv.name === 'AWSALB') out.AWSALB = nv.value;
    if (nv.name === 'AWSALBCORS') out.AWSALBCORS = nv.value;
  }
  return out;
}

function buildCookieHeader(c: FlicaStoredCookies): string {
  const parts: string[] = [];
  if (c.FLiCASession) parts.push(`FLiCASession=${c.FLiCASession}`);
  if (c.FLiCAService) parts.push(`FLiCAService=${c.FLiCAService}`);
  if (c.AWSALB) parts.push(`AWSALB=${c.AWSALB}`);
  if (c.AWSALBCORS) parts.push(`AWSALBCORS=${c.AWSALBCORS}`);
  return parts.join('; ');
}

function mergeCookies(a: FlicaStoredCookies, b: FlicaStoredCookies): FlicaStoredCookies {
  return {
    FLiCASession: b.FLiCASession ?? a.FLiCASession,
    FLiCAService: b.FLiCAService ?? a.FLiCAService,
    AWSALB: b.AWSALB ?? a.AWSALB,
    AWSALBCORS: b.AWSALBCORS ?? a.AWSALBCORS,
  };
}

/**
 * Tried in order on the full response (never truncated). mainmenu, leftmenu (Joust Outliner), etc.
 * Joust / JS strings: scheduledetail + token, BlockDate + token; no `g` flag so .match() returns capture group.
 */
const MAINMENU_TOKEN_PATTERNS: RegExp[] = [
  /token=([0-9A-Fa-f]{32})/,
  /token=([0-9A-Fa-f]{40})/,
  /scheduledetail\.cgi[^"']*token=([^&"'\s]+)/,
  /GO=1[^"']*token=([^&"'\s]+)/,
  /scheduledetail[^'"]*token=([0-9A-Fa-f]+)/i,
  /BlockDate[\s\S]*?token=([0-9A-Fa-f]+)/i,
];

export function extractScheduleTokenFromMainmenuHtml(html: string): string | null {
  const t = html ?? '';
  for (const re of MAINMENU_TOKEN_PATTERNS) {
    if (re.global) re.lastIndex = 0;
    const m = t.match(re);
    if (m?.[1] != null && m[1].length > 0) {
      return m[1];
    }
  }
  return null;
}

function logMainmenuHtmlPreviewForMetro(mainMenuHtml: string): void {
  const chunk = (mainMenuHtml ?? '').slice(0, 3000);
  console.log('[FLICA mainmenu HTML: first 3000 chars]');
  console.log(chunk);
}

function logLeftmenuHtmlForMetro(html: string): void {
  const t = html ?? '';
  console.log('[FLICA leftmenu HTML] total length:', t.length);
  console.log('[FLICA leftmenu HTML: 0-3000]');
  console.log(t.slice(0, 3000));
  if (t.length > 3000) {
    console.log('[FLICA leftmenu HTML: 3000-6000]');
    console.log(t.slice(3000, 6000));
  }
}

function looksCaptchaLike(text: string): boolean {
  const t = (text ?? '').toLowerCase();
  return (
    t.includes('captcha') ||
    t.includes('recaptcha') ||
    t.includes('g-recaptcha') ||
    t.includes('turnstile') ||
    t.includes('robot')
  );
}

/**
 * mainmenu?LoadSchedule can return a full reCAPTCHA gate HTML (any length) before the page that contains
 * `token=…` in script. It has no token until the user completes the challenge in a browser and Continue.
 */
function isFlicaLoadScheduleCaptchaGate(html: string): boolean {
  const t = html ?? '';
  if (!/g-recaptcha|reCaptchaResponse|grecaptcha\.getResponse/i.test(t)) {
    return false;
  }
  if (!/hiddenForm|id=['"]hiddenForm['"]/i.test(t)) {
    return false;
  }
  if (!/name=['"]LoadSchedule['"]/i.test(t) || !/name=['"]IsMobile['"]/i.test(t)) {
    return false;
  }
  return true;
}

/** One month after GO=1 multi-fetch (Mar / Apr / May). */
export type FlicaScheduleMonthResult = {
  blockDate: string;
  monthLabel: string;
  httpStatus: number;
  finalUrl: string;
  html: string;
  hints: ScheduleKeywordHints;
};

export type FlicaFcvHttpResult = {
  ok: true;
  scheduleHtml: string;
  scheduleUrl: string;
  mainMenuHtml: string;
  /** First scheduledetail response ("Updating schedule in progress" HTML) before GO=1 token */
  step1ScheduledetailHtml?: string;
  multiMonthSchedule?: FlicaScheduleMonthResult[];
  /** First 3000 chars of April (0426) real schedule HTML */
  aprilPreview3000?: string;
} | { ok: false; captchaRequired: boolean; error: string; loginBodyPreview?: string };

/** GO=1 dynamic token inside step-1 scheduledetail HTML (before real schedule loads). */
const GO1_TOKEN_FROM_STEP1_RE = /GO=1&token=([0-9A-Fa-f]+)/;

export function extractGo1TokenFromScheduledetailStep1Html(html: string): string | null {
  const m = (html ?? '').match(GO1_TOKEN_FROM_STEP1_RE);
  return m?.[1] && m[1].length > 0 ? m[1] : null;
}

const MULTI_MONTH_BLOCKS: { blockDate: string; monthLabel: string }[] = [
  { blockDate: '0326', monthLabel: 'March' },
  { blockDate: '0426', monthLabel: 'April' },
  { blockDate: '0526', monthLabel: 'May' },
];

/**
 * After step-1 scheduledetail returns "updating" HTML, extract GO=1&token and fetch real schedule for Mar/Apr/May.
 */
async function runScheduledetailGo1MultiMonth(
  session: FlicaStoredCookies,
  step1Html: string,
  step1Res: Response,
  step1RequestUrl: string,
  refererUrl?: string,
  onMonthProgress?: (message: string) => void
): Promise<
  | {
      ok: true;
      scheduleHtml: string;
      scheduleUrl: string;
      step1ScheduledetailHtml: string;
      multiMonthSchedule: FlicaScheduleMonthResult[];
      aprilPreview3000: string;
    }
  | { ok: false; error: string; captchaRequired?: boolean }
> {
  try {
  const goToken = extractGo1TokenFromScheduledetailStep1Html(step1Html);
  console.log('[FLICA TOKEN2]', goToken ?? 'NOT FOUND');
  if (!goToken) {
    return {
      ok: false,
      captchaRequired: false,
      error:
        'No GO=1&token in step-1 scheduledetail HTML (expected "Updating schedule" page with var url=\'/full/scheduledetail.cgi?GO=1&token=…\').',
    };
  }

  const cookieH = buildCookieHeader(session);
  const base: Record<string, string> = { ...baseGetHeaders(cookieH) };
  const ref =
    (refererUrl ?? '').trim() ||
    (typeof step1Res.url === 'string' && step1Res.url.length > 0 ? step1Res.url : step1RequestUrl);
  if (ref) base.Referer = ref;

  const multiMonthSchedule: FlicaScheduleMonthResult[] = [];
  let aprilHtml = '';
  let aprilUrl = '';
  const baseSched = 'https://jetblue.flica.net/full/scheduledetail.cgi';

  for (const { blockDate, monthLabel } of MULTI_MONTH_BLOCKS) {
    onMonthProgress?.(`Downloading ${monthLabel}...`);
    const junk = Date.now();
    const u = `${baseSched}?GO=1&token=${encodeURIComponent(goToken)}&BlockDate=${blockDate}&JUNK=${junk}`;
    let r: Response;
    try {
      r = await fetch(u, {
        method: 'GET',
        headers: base as unknown as HeadersInit,
        redirect: 'follow',
      });
    } catch (e) {
      return { ok: false, error: `GO=1 scheduledetail failed (${monthLabel}): ${String(e)}` };
    }
    const html = (await r.text()) ?? '';
    const finalUrl = typeof r.url === 'string' && r.url.length > 0 ? r.url : u;
    if (blockDate === '0326') console.log('[FLICA MARCH]', r.status);
    if (blockDate === '0426') console.log('[FLICA APRIL]', r.status);
    if (blockDate === '0526') console.log('[FLICA MAY]', r.status);
    multiMonthSchedule.push({
      blockDate,
      monthLabel,
      httpStatus: r.status,
      finalUrl,
      html,
      hints: computeScheduleKeywordHints(html),
    });
    if (blockDate === '0426') {
      aprilHtml = html;
      aprilUrl = finalUrl;
    }
  }

  console.log('[APRIL HTML START]');
  console.log(aprilHtml);
  console.log('[APRIL HTML END]');

  return {
    ok: true,
    scheduleHtml: aprilHtml,
    scheduleUrl: aprilUrl,
    step1ScheduledetailHtml: step1Html,
    multiMonthSchedule,
    aprilPreview3000: aprilHtml.slice(0, 3000),
  };
  } catch (err) {
    console.log('[FLICA ERROR]', err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * mainmenu?LoadSchedule → token regex → scheduledetail HTML, using an explicit Cookie header
 * (e.g. after WebKit form login and CookieManager.get).
 */
export async function runFlicaFcvHttpScheduleWithCookies(session: FlicaStoredCookies): Promise<FlicaFcvHttpResult> {
  if (!session.FLiCASession && !session.FLiCAService) {
    return { ok: false, captchaRequired: false, error: 'Missing FLiCASession/FLiCAService for schedule fetch.' };
  }
  await saveFlicaCookiesToSecureStore(session);

  const mainCookieForGet = buildCookieHeader(session);
  let mainRes: Response;
  try {
    mainRes = await fetch(MAINMENU_LOAD_SCHEDULE_URL, {
      method: 'GET',
      headers: baseGetHeaders(mainCookieForGet) as unknown as HeadersInit,
      redirect: 'follow',
    });
  } catch (e) {
    return { ok: false, captchaRequired: false, error: `mainmenu LoadSchedule failed: ${String(e)}` };
  }

  const mainMenuHtml = (await mainRes.text()) ?? '';
  logMainmenuHtmlPreviewForMetro(mainMenuHtml);

  const token = extractScheduleTokenFromMainmenuHtml(mainMenuHtml);

  if (isFlicaLoadScheduleCaptchaGate(mainMenuHtml)) {
    return {
      ok: false,
      captchaRequired: true,
      error:
        'FLICA returned the reCAPTCHA / “Continue to Main Menu” page — there is no schedule token until you pass it in a browser. Open FLICA Login, check “I’m not a robot,” tap Continue, then run Import with saved session again (or the app will re-open the WebView).',
    };
  }

  if (!token) {
    if (looksCaptchaLike(mainMenuHtml)) {
      return {
        ok: false,
        captchaRequired: true,
        error:
          'Main menu response looks like a CAPTCHA or challenge page (no token yet). Open FLICA Login to complete the challenge, then import again.',
      };
    }
    return {
      ok: false,
      captchaRequired: false,
      error:
        'Could not find a schedule token in mainmenu HTML. See [FLICA mainmenu HTML: first 3000 chars] in Metro.',
    };
  }

  const scheduleUrl = `https://jetblue.flica.net/full/scheduledetail.cgi?BlockDate=0426&token=${encodeURIComponent(token)}`;
  let schedRes: Response;
  try {
    schedRes = await fetch(scheduleUrl, {
      method: 'GET',
      headers: baseGetHeaders(buildCookieHeader(session)) as unknown as HeadersInit,
      redirect: 'follow',
    });
  } catch (e) {
    return { ok: false, captchaRequired: false, error: `scheduledetail failed: ${String(e)}` };
  }

  const scheduleHtml = (await schedRes.text()) ?? '';
  if (!schedRes.ok) {
    return {
      ok: false,
      captchaRequired:
        scheduleHtml.length < 200
          ? looksCaptchaLike(scheduleHtml)
          : isFlicaLoadScheduleCaptchaGate(scheduleHtml),
      error: `scheduledetail HTTP ${schedRes.status} (${scheduleHtml.length} bytes)`,
    };
  }

  const pipe = await runScheduledetailGo1MultiMonth(session, scheduleHtml, schedRes, scheduleUrl, undefined, undefined);
  if (!pipe.ok) {
    return { ok: false, captchaRequired: pipe.captchaRequired ?? false, error: pipe.error };
  }

  return {
    ok: true,
    scheduleHtml: pipe.scheduleHtml,
    scheduleUrl: pipe.scheduleUrl,
    mainMenuHtml: mainMenuHtml,
    step1ScheduledetailHtml: pipe.step1ScheduledetailHtml,
    multiMonthSchedule: pipe.multiMonthSchedule,
    aprilPreview3000: pipe.aprilPreview3000,
  };
}

/**
 * HTTP GET scheduledetail.cgi only — token must come from WebView HTML, not from mainmenu/leftmenu fetch.
 * `refererUrl` (e.g. mainmenu?LoadSchedule) often required by the server for the same session.
 */
export async function runFlicaFcvHttpScheduledetailOnly(
  session: FlicaStoredCookies,
  token: string,
  options?: { refererUrl?: string; onProgress?: (message: string) => void }
): Promise<FlicaFcvHttpResult> {
  if (!session.FLiCASession && !session.FLiCAService) {
    return { ok: false, captchaRequired: false, error: 'Missing FLiCASession/FLiCAService for schedule fetch.' };
  }
  await saveFlicaCookiesToSecureStore(session);

  const scheduleUrl = `https://jetblue.flica.net/full/scheduledetail.cgi?BlockDate=0426&token=${encodeURIComponent(token)}`;
  const base = baseGetHeaders(buildCookieHeader(session)) as Record<string, string>;
  const ref = options?.refererUrl?.trim();
  if (ref) {
    base.Referer = ref;
  }
  let schedRes: Response;
  try {
    schedRes = await fetch(scheduleUrl, {
      method: 'GET',
      headers: base as unknown as HeadersInit,
      redirect: 'follow',
    });
  } catch (e) {
    return { ok: false, captchaRequired: false, error: `scheduledetail failed: ${String(e)}` };
  }

  const scheduleHtml = (await schedRes.text()) ?? '';
  if (!schedRes.ok) {
    return {
      ok: false,
      captchaRequired: isFlicaLoadScheduleCaptchaGate(scheduleHtml),
      error: `scheduledetail HTTP ${schedRes.status} (${scheduleHtml.length} bytes). ${
        ref ? 'Referer was sent.' : 'Try: token must be current; re-run WebView import.'
      }`,
    };
  }

  const pipe = await runScheduledetailGo1MultiMonth(
    session,
    scheduleHtml,
    schedRes,
    scheduleUrl,
    ref,
    options?.onProgress
  );
  if (!pipe.ok) {
    return { ok: false, captchaRequired: pipe.captchaRequired ?? false, error: pipe.error };
  }

  return {
    ok: true,
    scheduleHtml: pipe.scheduleHtml,
    scheduleUrl: pipe.scheduleUrl,
    mainMenuHtml: '',
    step1ScheduledetailHtml: pipe.step1ScheduledetailHtml,
    multiMonthSchedule: pipe.multiMonthSchedule,
    aprilPreview3000: pipe.aprilPreview3000,
  };
}

/**
 * After WebView lands on mainmenu.cgi, GET leftmenu.cgi with the live mainmenu URL as Referer (freshest session),
 * then scheduledetail?token=… (same 4 token regexes on the leftmenu HTML).
 */
export async function runFlicaFcvHttpScheduleWithLeftmenuReferer(
  session: FlicaStoredCookies,
  mainMenuRefererUrl: string
): Promise<FlicaFcvHttpResult> {
  if (!session.FLiCASession && !session.FLiCAService) {
    return { ok: false, captchaRequired: false, error: 'Missing FLiCASession/FLiCAService for schedule fetch.' };
  }
  const ref = (mainMenuRefererUrl ?? '').trim();
  if (!ref) {
    return { ok: false, captchaRequired: false, error: 'Missing main menu URL for Referer.' };
  }
  await saveFlicaCookiesToSecureStore(session);

  const mainCookieForGet = buildCookieHeader(session);
  let leftRes: Response;
  try {
    leftRes = await fetch(LEFTMENU_URL, {
      method: 'GET',
      headers: baseGetHeadersWithReferer(mainCookieForGet, ref) as unknown as HeadersInit,
      redirect: 'follow',
    });
  } catch (e) {
    return { ok: false, captchaRequired: false, error: `leftmenu.cgi failed: ${String(e)}` };
  }

  const leftMenuHtml = (await leftRes.text()) ?? '';
  logLeftmenuHtmlForMetro(leftMenuHtml);

  const token = extractScheduleTokenFromMainmenuHtml(leftMenuHtml);

  if (isFlicaLoadScheduleCaptchaGate(leftMenuHtml)) {
    return {
      ok: false,
      captchaRequired: true,
      error:
        'leftmenu returned a reCAPTCHA step — there is no schedule token until you pass it in the in-app WebView. Open FLICA Login, complete the challenge, and reach main menu again.',
    };
  }

  if (!token) {
    if (looksCaptchaLike(leftMenuHtml)) {
      return {
        ok: false,
        captchaRequired: true,
        error:
          'leftmenu response looks like a CAPTCHA or challenge (no token yet). Open FLICA Login to complete the flow, then try again.',
      };
    }
    return {
      ok: false,
      captchaRequired: false,
      error: 'Could not find a schedule token in leftmenu HTML. See [FLICA leftmenu HTML: first 3000 chars] in Metro.',
    };
  }

  const scheduleUrl = `https://jetblue.flica.net/full/scheduledetail.cgi?BlockDate=0426&token=${encodeURIComponent(token)}`;
  let schedRes: Response;
  try {
    schedRes = await fetch(scheduleUrl, {
      method: 'GET',
      headers: baseGetHeaders(buildCookieHeader(session)) as unknown as HeadersInit,
      redirect: 'follow',
    });
  } catch (e) {
    return { ok: false, captchaRequired: false, error: `scheduledetail failed: ${String(e)}` };
  }

  const scheduleHtml = (await schedRes.text()) ?? '';
  if (!schedRes.ok) {
    return {
      ok: false,
      captchaRequired:
        scheduleHtml.length < 200
          ? looksCaptchaLike(scheduleHtml)
          : isFlicaLoadScheduleCaptchaGate(scheduleHtml),
      error: `scheduledetail HTTP ${schedRes.status} (${scheduleHtml.length} bytes)`,
    };
  }

  const pipe = await runScheduledetailGo1MultiMonth(session, scheduleHtml, schedRes, scheduleUrl, ref, undefined);
  if (!pipe.ok) {
    return { ok: false, captchaRequired: pipe.captchaRequired ?? false, error: pipe.error };
  }

  return {
    ok: true,
    scheduleHtml: pipe.scheduleHtml,
    scheduleUrl: pipe.scheduleUrl,
    mainMenuHtml: leftMenuHtml,
    step1ScheduledetailHtml: pipe.step1ScheduledetailHtml,
    multiMonthSchedule: pipe.multiMonthSchedule,
    aprilPreview3000: pipe.aprilPreview3000,
  };
}

/**
 * FCV flow: POST logon (manual redirect) → cookies from Set-Cookie / CookieManager → mainmenu → token regex → scheduledetail HTML.
 */
export async function runFlicaFcvHttpImport(overrides?: { userId: string; password: string } | null): Promise<FlicaFcvHttpResult> {
  let userId: string | undefined;
  let password: string | undefined;
  if (overrides?.userId != null && overrides?.password != null) {
    userId = overrides.userId;
    password = overrides.password;
  } else {
    const creds = await loadFlicaCredentials();
    userId = creds.userId ?? undefined;
    password = creds.password ?? undefined;
  }
  if (!userId || !password) {
    return { ok: false, captchaRequired: false, error: 'Missing flica_username / flica_password in SecureStore.' };
  }

  const body = `UserId=${encodeURIComponent(userId)}&Password=${encodeURIComponent(password)}`;

  let loginRes: Response;
  try {
    loginRes = await fetch(FLIC_LOGON_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT_FCV,
        Accept: HEADER_ACCEPT,
        'Accept-Language': HEADER_ACCEPT_LANG,
      },
      body,
      redirect: 'manual',
    });
  } catch (e) {
    return { ok: false, captchaRequired: false, error: `Login POST failed: ${String(e)}` };
  }

  const loginText = (await loginRes.text()) ?? '';
  if (loginText.length > 0 && looksCaptchaLike(loginText)) {
    return {
      ok: false,
      captchaRequired: true,
      error: 'CAPTCHA or bot challenge in login response — use WebView to complete login.',
      loginBodyPreview: loginText.slice(0, 2000),
    };
  }

  const fromSetCookie = sessionCookiesFromSetCookieResponse(loginRes);
  let fromNativeJar: FlicaStoredCookies = {};
  try {
    for (const base of FLICA_COOKIE_MANAGER_GET_URLS) {
      try {
        const jar = await CookieManager.get(base, true);
        fromNativeJar = mergeFlicaStoredCookiesPreferRight(
          fromNativeJar,
          flicaStoredCookiesFromNativeJar(jar),
        );
      } catch {
        /* per-origin read may fail */
      }
    }
  } catch {
    /* CookieManager may fail in rare cases; still use Set-Cookie / SecureStore if present */
  }
  const stored = await loadFlicaCookiesFromSecureStore();
  let session: FlicaStoredCookies = mergeCookies(mergeCookies(stored, fromSetCookie), fromNativeJar);
  if (!session.FLiCASession && !session.FLiCAService) {
    return {
      ok: false,
      captchaRequired: looksCaptchaLike(loginText),
      error:
        'No FLiCASession/FLiCAService after login (Set-Cookie header, SecureStore, or CookieManager). Try WebView login.',
      loginBodyPreview: loginText.slice(0, 2000),
    };
  }
  return runFlicaFcvHttpScheduleWithCookies(session);
}

export const FLICA_SCHEDULE_DETAIL_URL = 'https://jetblue.flica.net/full/scheduledetail.cgi?BlockDate=0426';
