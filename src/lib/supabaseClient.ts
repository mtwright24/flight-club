// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
import type { LockFunc } from "@supabase/auth-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { isDevice } from "expo-device";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

import { resilientFetch } from "./resilientFetch";

/**
 * Web: default auth uses the Web Locks API with a "steal" recovery path; concurrent OAuth
 * (e.g. Google/Apple) + token refresh can surface "Lock broken by another request with the 'steal' option."
 * A simple in-process lock avoids `navigator.locks` (cross-tab sync is a tradeoff on web only).
 * Native: keep Supabase's default (in-process / RN-appropriate) locking.
 */
const webInProcessLock: LockFunc = async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) =>
  await fn();

// Read Expo public env vars
let rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Runtime guard and normalization
if (!rawUrl || !supabaseAnonKey) {
  const msg = 'Missing Supabase env. Make sure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.';
  console.error(msg);
  throw new Error(msg);
}

// Normalize url: ensure https:// and no trailing slash
rawUrl = rawUrl.trim();
if (!rawUrl.startsWith('http')) rawUrl = `https://${rawUrl}`;
if (rawUrl.endsWith('/')) rawUrl = rawUrl.slice(0, -1);

/** Parse host from Expo dev metadata (e.g. `192.168.1.5:8081` or `http://192.168.1.5:8081`). */
function parseLanHostFromDevString(raw: string | undefined | null): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  try {
    const host = s.includes("://") ? new URL(s).hostname : s.split(":")[0];
    if (!host || host === "localhost" || host === "127.0.0.1") return null;
    return host;
  } catch {
    return null;
  }
}

function expoDevLanHostname(): string | null {
  const c = Constants;
  const candidates: (string | undefined)[] = [
    (c.expoConfig as { hostUri?: string } | undefined)?.hostUri,
    (c.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost,
    (c.manifest2 as { extra?: { expoClient?: { hostUri?: string } } } | undefined)?.extra?.expoClient
      ?.hostUri,
    (c.manifest as { debuggerHost?: string } | undefined)?.debuggerHost,
  ];
  for (const raw of candidates) {
    const h = parseLanHostFromDevString(raw);
    if (h) return h;
  }
  return null;
}

let warnedLocalhostUnreachable: boolean = false;

/**
 * Dev-only: map `localhost` to a host the current runtime can reach.
 * - Android **emulator**: 10.0.2.2 (not the physical device loopback).
 * - iOS Simulator: keep localhost (reaches the Mac host).
 * - Physical devices: prefer Metro’s LAN host from Expo when `EXPO_PUBLIC_SUPABASE_URL` still points at localhost.
 */
function rewriteLocalhostForReactNativeDev(url: string): string {
  if (!__DEV__) return url;
  /** Browser / Next: keep localhost; Metro LAN heuristics are RN-only. */
  if (Platform.OS === "web") return url;
  try {
    const u = new URL(url);
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") return url;

    if (Platform.OS === "android" && !isDevice) {
      u.hostname = "10.0.2.2";
      return u.toString().replace(/\/$/, "");
    }

    const lan = expoDevLanHostname();
    if (lan) {
      u.hostname = lan;
      return u.toString().replace(/\/$/, "");
    }

    if (isDevice && !warnedLocalhostUnreachable) {
      warnedLocalhostUnreachable = true;
      console.warn(
        "[supabase] EXPO_PUBLIC_SUPABASE_URL uses localhost / 127.0.0.1, which this physical device cannot reach. " +
          "Point it at your machine LAN IP (same Wi‑Fi) or a hosted Supabase URL, or run Expo with LAN/tunnel so a dev host can be detected.",
      );
    }
    return url;
  } catch {
    return url;
  }
}

rawUrl = rewriteLocalhostForReactNativeDev(rawUrl);

export const SUPABASE_URL = rawUrl;
/** Public anon key (same as createClient second arg). Edge Functions need `apikey` + `Authorization` on raw fetch. */
export const SUPABASE_ANON_KEY = supabaseAnonKey;

// Supabase session blobs can exceed SecureStore's ~2048 byte limit.
// Native: AsyncStorage. Web: localStorage (AsyncStorage web impl can throw when `window` is missing, e.g. Node/SSR).
const ExpoAsyncStorageAdapter = {
  getItem: async (key: string) => {
    const item = await AsyncStorage.getItem(key);
    return item ?? null;
  },
  setItem: async (key: string, value: string) => {
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    await AsyncStorage.removeItem(key);
  },
};

const WebLocalStorageAdapter = {
  getItem: async (key: string) => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore quota / private mode */
    }
  },
  removeItem: async (key: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const authStorage =
  Platform.OS === "web" ? WebLocalStorageAdapter : ExpoAsyncStorageAdapter;

export const supabase = createClient(SUPABASE_URL, supabaseAnonKey ?? "", {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    ...(Platform.OS === "web" ? { lock: webInProcessLock } : {}),
  },
  global: {
    fetch: resilientFetch,
  },
});