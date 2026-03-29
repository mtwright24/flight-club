import { AppState, type AppStateStatus, Platform } from 'react-native';
import { supabase } from '../../src/lib/supabaseClient';
import { expoDeviceSafe } from './expoDeviceSafe';
import { getDeviceLabelForSync, registerExpoPushTokenAsync } from './expoPushRegistration';

export type PushTokenRegistrationResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string };

/** Last successfully registered Expo push token for this JS runtime (for lightweight presence updates). */
let lastRegisteredUserId: string | null = null;
let lastRegisteredPushToken: string | null = null;
/** Dev: "skipped — not physical device" log at most once per JS runtime. */
let devLoggedSkipNotPhysicalDevice = false;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Registers the Expo push token (real devices only), requests permission, upserts into `public.user_push_tokens`.
 * Idempotent: repeated calls with the same `(user_id, push_token)` update the same row via `onConflict`.
 */
export async function registerPushTokenForSignedInUser(userId: string): Promise<PushTokenRegistrationResult> {
  if (!expoDeviceSafe.getIsDevice()) {
    if (__DEV__ && !devLoggedSkipNotPhysicalDevice) {
      devLoggedSkipNotPhysicalDevice = true;
      console.log('[Push] Skipping push registration — not a physical device (simulator/emulator).');
    }
    return { ok: true, skipped: true };
  }

  const reg = await registerExpoPushTokenAsync();
  if (!reg.ok) {
    if (reg.reason === 'not_physical_device') {
      if (__DEV__ && !devLoggedSkipNotPhysicalDevice) {
        devLoggedSkipNotPhysicalDevice = true;
        console.log('[Push] Skipping push registration — not a physical device.');
      }
      return { ok: true, skipped: true };
    }
    if (reg.reason === 'permission_denied') {
      console.warn('[Push] Notification permission denied — push disabled until the user enables notifications in Settings.');
      return { ok: false, error: 'permission_denied' };
    }
    if (reg.reason === 'missing_project_id') {
      console.error(
        '[Push] Missing EAS projectId — set `expo.extra.eas.projectId` in app config (EAS project ID).',
        reg.message ?? ''
      );
      return { ok: false, error: 'missing_project_id' };
    }
    console.warn('[Push] Push token registration failed:', reg.message ?? reg.reason);
    return { ok: false, error: reg.message ?? 'registration_failed' };
  }

  const deviceName = getDeviceLabelForSync();
  const ts = nowIso();

  const { error } = await supabase.from('user_push_tokens').upsert(
    {
      user_id: userId,
      push_token: reg.token,
      platform: Platform.OS,
      device_name: deviceName,
      is_active: true,
      last_seen_at: ts,
      updated_at: ts,
    },
    { onConflict: 'user_id,push_token' }
  );

  if (error) {
    console.warn('[Push] user_push_tokens upsert failed:', error.message);
    return { ok: false, error: error.message };
  }

  lastRegisteredUserId = userId;
  lastRegisteredPushToken = reg.token;
  if (__DEV__) {
    console.log('[Push] Registered / refreshed push token for user', userId.slice(0, 8) + '…');
  }
  return { ok: true };
}

/**
 * Marks this device row as active and updates `last_seen_at` without re-calling Expo token APIs when possible.
 * Call on app foreground when the user is signed in.
 */
export async function touchPushTokenLastSeen(userId: string): Promise<void> {
  if (!expoDeviceSafe.getIsDevice()) return;

  const token = lastRegisteredPushToken;
  if (!token || lastRegisteredUserId !== userId) {
    await registerPushTokenForSignedInUser(userId);
    return;
  }

  const ts = nowIso();
  const { error } = await supabase
    .from('user_push_tokens')
    .update({
      is_active: true,
      last_seen_at: ts,
      updated_at: ts,
    })
    .eq('user_id', userId)
    .eq('push_token', token);

  if (error && __DEV__) {
    console.warn('[Push] last_seen_at touch failed:', error.message);
  }
}

/** Sets all tokens for the user inactive (logout). */
export async function deactivatePushTokensForUser(userId: string): Promise<void> {
  const ts = nowIso();
  try {
    await supabase
      .from('user_push_tokens')
      .update({
        is_active: false,
        updated_at: ts,
      })
      .eq('user_id', userId);
  } catch {
    // non-fatal
  }
  if (lastRegisteredUserId === userId) {
    lastRegisteredUserId = null;
    lastRegisteredPushToken = null;
  }
}

export function getLastRegisteredPushTokenSnapshot(): {
  userId: string | null;
  token: string | null;
} {
  return { userId: lastRegisteredUserId, token: lastRegisteredPushToken };
}

type PresenceCleanup = () => void;

/**
 * When the app returns to foreground and the user is signed in, refresh `last_seen_at` (debounced).
 */
export function subscribePushTokenPresenceOnForeground(
  userId: string | null,
  debounceMs = 2000
): PresenceCleanup {
  if (!userId) return () => {};

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const run = (state: AppStateStatus) => {
    if (state !== 'active') return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void touchPushTokenLastSeen(userId);
    }, debounceMs);
  };

  const sub = AppState.addEventListener('change', run);
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    sub.remove();
  };
}
