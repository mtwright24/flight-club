// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import "react-native-url-polyfill/auto";

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

export const SUPABASE_URL = rawUrl;
console.log('Supabase URL:', SUPABASE_URL);

// Custom storage adapter that only stores tokens, not full session
const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    const item = await SecureStore.getItemAsync(key);
    if (!item) return null;
    
    try {
      const parsed = JSON.parse(item);
      // If it's a session, only return the tokens part
      if (parsed.session) {
        return JSON.stringify({
          session: {
            access_token: parsed.session.access_token,
            refresh_token: parsed.session.refresh_token,
            expires_in: parsed.session.expires_in,
            token_type: parsed.session.token_type,
            user: {
              id: parsed.session.user?.id,
            },
          },
        });
      }
      return item;
    } catch {
      return item;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      const parsed = JSON.parse(value);
      // Only store tokens, not full session
      if (parsed.session) {
        const slim = {
          session: {
            access_token: parsed.session.access_token,
            refresh_token: parsed.session.refresh_token,
            expires_in: parsed.session.expires_in,
            token_type: parsed.session.token_type,
            user: {
              id: parsed.session.user?.id,
            },
          },
        };
        await SecureStore.setItemAsync(key, JSON.stringify(slim));
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    } catch {
      await SecureStore.setItemAsync(key, value);
    }
  },
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, supabaseAnonKey ?? "", {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});