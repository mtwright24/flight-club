/**
 * TEMP PoC — FLICA session cookies in SecureStore (no credentials).
 * Native path: values from @react-native-community/cookies CookieManager.get (includes HttpOnly).
 */
import * as SecureStore from 'expo-secure-store';

/** Shape returned by CookieManager.get (cookie name → { name, value, ... }). */
export type NativeCookieJar = Record<string, { value?: string; name?: string } | undefined>;

/** Exact WebView URL when mainmenu.cgi loads (includes nocache, GOHM, junk, etc.). */
export const FLICA_LAST_MAINMENU_URL_KEY = 'flica_last_mainmenu_url';

export const FLICA_SECURE_KEYS = {
  session: 'flica_session',
  service: 'flica_service',
  awsalb: 'flica_awsalb',
  awsalbcors: 'flica_awsalbcors',
} as const;

export type FlicaStoredCookies = {
  FLiCASession?: string;
  FLiCAService?: string;
  AWSALB?: string;
  AWSALBCORS?: string;
};

function parseCookieHeaderString(cookieStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieStr || typeof cookieStr !== 'string') return out;
  for (const part of cookieStr.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

/** Pick FLICA-related keys from document.cookie (or merge with optional second source). */
const NAMES: (keyof FlicaStoredCookies)[] = ['FLiCASession', 'FLiCAService', 'AWSALB', 'AWSALBCORS'];

export function mergeFlicaCookies(
  fromDocument: Record<string, string>,
  fromExtra: FlicaStoredCookies
): FlicaStoredCookies {
  const out: FlicaStoredCookies = {};
  for (const key of NAMES) {
    const m = fromExtra[key];
    const d = fromDocument[key];
    const mv = m != null && String(m).length > 0 ? String(m) : undefined;
    const dv = d != null && String(d).length > 0 ? String(d) : undefined;
    out[key] = mv ?? dv;
  }
  return out;
}

export function parseDocumentCookieString(cookieStr: string): Record<string, string> {
  return parseCookieHeaderString(cookieStr);
}

/** Map CookieManager.get() result into FLICA fields (FLiCASession, FLiCAService, AWSALB, AWSALBCORS). */
export function flicaStoredCookiesFromNativeJar(jar: NativeCookieJar): FlicaStoredCookies {
  const pick = (name: keyof FlicaStoredCookies): string | undefined => {
    const c = jar[name];
    if (c == null || typeof c !== 'object') return undefined;
    const v = 'value' in c && c.value != null ? String(c.value) : undefined;
    return v != null && v.length > 0 ? v : undefined;
  };
  return {
    FLiCASession: pick('FLiCASession'),
    FLiCAService: pick('FLiCAService'),
    AWSALB: pick('AWSALB'),
    AWSALBCORS: pick('AWSALBCORS'),
  };
}

export async function saveFlicaCookiesToSecureStore(c: FlicaStoredCookies): Promise<void> {
  const entries: [string, string | undefined][] = [
    [FLICA_SECURE_KEYS.session, c.FLiCASession],
    [FLICA_SECURE_KEYS.service, c.FLiCAService],
    [FLICA_SECURE_KEYS.awsalb, c.AWSALB],
    [FLICA_SECURE_KEYS.awsalbcors, c.AWSALBCORS],
  ];
  for (const [key, val] of entries) {
    if (val != null && val.length > 0) {
      await SecureStore.setItemAsync(key, val);
    } else {
      await SecureStore.deleteItemAsync(key).catch(() => {});
    }
  }
}

export async function loadFlicaCookiesFromSecureStore(): Promise<FlicaStoredCookies> {
  const [session, service, awsalb, awsalbcors] = await Promise.all([
    SecureStore.getItemAsync(FLICA_SECURE_KEYS.session),
    SecureStore.getItemAsync(FLICA_SECURE_KEYS.service),
    SecureStore.getItemAsync(FLICA_SECURE_KEYS.awsalb),
    SecureStore.getItemAsync(FLICA_SECURE_KEYS.awsalbcors),
  ]);
  return {
    FLiCASession: session ?? undefined,
    FLiCAService: service ?? undefined,
    AWSALB: awsalb ?? undefined,
    AWSALBCORS: awsalbcors ?? undefined,
  };
}

export async function saveFlicaLastMainmenuUrl(url: string): Promise<void> {
  const u = (url ?? '').trim();
  if (u.length > 0) {
    await SecureStore.setItemAsync(FLICA_LAST_MAINMENU_URL_KEY, u);
  } else {
    await SecureStore.deleteItemAsync(FLICA_LAST_MAINMENU_URL_KEY).catch(() => {});
  }
}

export async function loadFlicaLastMainmenuUrl(): Promise<string | null> {
  const v = await SecureStore.getItemAsync(FLICA_LAST_MAINMENU_URL_KEY);
  return v != null && v.length > 0 ? v : null;
}

export async function clearFlicaCookiesFromSecureStore(): Promise<void> {
  await Promise.all([
    ...Object.values(FLICA_SECURE_KEYS).map((k) => SecureStore.deleteItemAsync(k).catch(() => {})),
    SecureStore.deleteItemAsync(FLICA_LAST_MAINMENU_URL_KEY).catch(() => {}),
  ]);
}
