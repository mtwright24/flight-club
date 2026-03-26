// src/lib/pendingProfile.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pendingProfile';

export async function savePendingProfile(profile: any) {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}

export async function loadPendingProfile() {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearPendingProfile() {
  await AsyncStorage.removeItem(KEY);
}
