/**
 * TEMP PoC — FLICA session cookies in SecureStore (no credentials).
 * Native path: values from @react-native-community/cookies CookieManager.get (includes HttpOnly).
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Shape returned by CookieManager.get (cookie name → { name, value, ... }). */
export type NativeCookieJar = Record<string, { value?: string; name?: string } | undefined>;

/** Exact WebView URL when mainmenu.cgi loads (includes nocache, GOHM, junk, etc.). */
export const FLICA_LAST_MAINMENU_URL_KEY = 'flica_last_mainmenu_url';

export const FLICA_USERNAME_KEY = 'flica_username';
export const FLICA_PASSWORD_KEY = 'flica_password';

export async function saveFlicaCredentials(userId: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(FLICA_USERNAME_KEY, userId.trim());
  await SecureStore.setItemAsync(FLICA_PASSWORD_KEY, password);
}

export async function loadFlicaCredentials(): Promise<{ userId: string | null; password: string | null }> {
  const [u, p] = await Promise.all([
    SecureStore.getItemAsync(FLICA_USERNAME_KEY),
    SecureStore.getItemAsync(FLICA_PASSWORD_KEY),
  ]);
  return { userId: u, password: p };
}

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

/**
 * CookieManager.get(url) only returns cookies for that URL’s store; FLICA often lands on `http://` first
 * then redirects to `https://`. Read both and merge so session cookies are not “missing”.
 */
export const FLICA_COOKIE_MANAGER_GET_URLS = [
  'http://jetblue.flica.net',
  'https://jetblue.flica.net',
] as const;

/** Prefer `b` over `a` for each FLICA cookie key (Charles-style overlay). */
export function mergeFlicaStoredCookiesPreferRight(a: FlicaStoredCookies, b: FlicaStoredCookies): FlicaStoredCookies {
  return {
    FLiCASession: b.FLiCASession ?? a.FLiCASession,
    FLiCAService: b.FLiCAService ?? a.FLiCAService,
    AWSALB: b.AWSALB ?? a.AWSALB,
    AWSALBCORS: b.AWSALBCORS ?? a.AWSALBCORS,
  };
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

/**
 * Read FLICA cookies from the native cookie jar. Returns `{}` on web.
 * Uses require() so Metro does not load `@react-native-community/cookies` on web (it throws Invalid platform).
 */
export async function flicaSessionFromNativeCookieManagerMerged(): Promise<FlicaStoredCookies> {
  if (Platform.OS === 'web') {
    return {};
  }
  let merged: FlicaStoredCookies = {};
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CookieManager = require('@react-native-community/cookies').default;
  for (const base of FLICA_COOKIE_MANAGER_GET_URLS) {
    try {
      const jar = await CookieManager.get(base, true);
      merged = mergeFlicaStoredCookiesPreferRight(merged, flicaStoredCookiesFromNativeJar(jar));
    } catch {
      /* per-origin read may fail */
    }
  }
  return merged;
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

/**
 * Remove FLICA username/password and all cached session / ALB cookies (full logout from device).
 * Keys: flica_username, flica_password, flica_session, flica_service, flica_awsalb, flica_awsalbcors, last main menu URL.
 */
export async function removeFlicaLoginAndSessionsFromDevice(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(FLICA_USERNAME_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(FLICA_PASSWORD_KEY).catch(() => {}),
    ...Object.values(FLICA_SECURE_KEYS).map((k) => SecureStore.deleteItemAsync(k).catch(() => {})),
    SecureStore.deleteItemAsync(FLICA_LAST_MAINMENU_URL_KEY).catch(() => {}),
  ]);
}
