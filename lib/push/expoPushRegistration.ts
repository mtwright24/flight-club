import Constants from 'expo-constants';
import { deviceName, isDevice, modelName } from 'expo-device/build/Device';
import { Platform } from 'react-native';
import {
  AndroidImportance,
  getExpoPushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
} from './expoNotificationsApi';

export type ExpoPushRegistrationResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: 'not_physical_device' | 'permission_denied' | 'missing_project_id' | 'error';
      message?: string;
    };

/** EAS / app.json `extra.eas.projectId` — required for Expo push tokens in dev/production builds. */
export function getExpoProjectId(): string | null {
  const easExtra = Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined;
  const fromExtra = easExtra?.projectId;
  const fromLegacy = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  const pid = fromExtra ?? fromLegacy;
  return typeof pid === 'string' && pid.length > 0 ? pid : null;
}

export async function ensureAndroidNotificationChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await setNotificationChannelAsync('default', {
    name: 'Default',
    importance: AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#B5161E',
  });
}

/**
 * Requests permission and returns an Expo push token (real devices only).
 * Returns structured errors for simulators, denied permission, or missing projectId.
 */
export async function registerExpoPushTokenAsync(): Promise<ExpoPushRegistrationResult> {
  if (!isDevice) {
    return { ok: false, reason: 'not_physical_device' };
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    return {
      ok: false,
      reason: 'missing_project_id',
      message: 'Configure extra.eas.projectId (EAS) in app config',
    };
  }

  const { status: existing } = await getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return { ok: false, reason: 'permission_denied' };
  }

  await ensureAndroidNotificationChannelAsync();

  try {
    const tokenData = await getExpoPushTokenAsync({ projectId });
    const token = tokenData.data?.trim();
    if (!token) {
      return { ok: false, reason: 'error', message: 'Empty Expo push token' };
    }
    return { ok: true, token };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'error', message };
  }
}

export function getDeviceLabelForSync(): string | null {
  return [modelName, deviceName].filter(Boolean).join(' · ') || null;
}
