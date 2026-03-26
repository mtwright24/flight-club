// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

// Supabase session blobs can exceed SecureStore's ~2048 byte limit.
// Use AsyncStorage (unlimited) to prevent session persistence failures / warnings.
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

export const supabase = createClient(SUPABASE_URL, supabaseAnonKey ?? "", {
  auth: {
    storage: ExpoAsyncStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});