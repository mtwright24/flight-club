// src/lib/pendingProfile.ts
import * as SecureStore from 'expo-secure-store';

const KEY = 'pendingProfile';

export async function savePendingProfile(profile: any) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(profile));
}

export async function loadPendingProfile() {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearPendingProfile() {
  await SecureStore.deleteItemAsync(KEY);
}
