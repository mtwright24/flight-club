import { PermissionStatus } from 'expo-modules-core';
import { Alert, Platform } from 'react-native';

import {
  AndroidImportance,
  AndroidNotificationVisibility,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes,
  setNotificationChannelAsync,
} from '../push/expoNotificationsApi';

/** Marks scheduled local test notifications so the global handler can show iOS banners without duplicating push UX. */
export const LOCAL_TEST_NOTIFICATION_DATA = { flightClubLocalTest: true } as const;

export type LocalNotificationPermissionResult = 'granted' | 'denied' | 'undetermined';

const ANDROID_DEFAULT_CHANNEL_ID = 'default';

async function ensureAndroidDefaultChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL_ID, {
    name: 'Default',
    importance: AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Checks current permission, requests if needed, alerts when the user has denied, logs the outcome.
 */
export async function requestLocalNotificationPermissions(): Promise<LocalNotificationPermissionResult> {
  if (Platform.OS === 'web') {
    console.log('[LocalNotifTest] requestLocalNotificationPermissions: web — not supported');
    return 'denied';
  }

  try {
    const existing = await getPermissionsAsync();
    console.log('[LocalNotifTest] existing permission', existing.status);

    let status = existing.status;

    if (status !== PermissionStatus.GRANTED) {
      const requested = await requestPermissionsAsync();
      status = requested.status;
      console.log('[LocalNotifTest] after request', requested.status);
    }

    if (status === PermissionStatus.GRANTED) {
      await ensureAndroidDefaultChannel();
      return 'granted';
    }

    if (status === PermissionStatus.DENIED) {
      Alert.alert(
        'Notifications are off',
        'To test alerts on this device, turn on notifications for Flight Club in Settings → Notifications.',
        [{ text: 'OK' }]
      );
      return 'denied';
    }

    Alert.alert(
      'Notifications not available',
      'Notification permission could not be granted. Try again or enable notifications in system settings.',
      [{ text: 'OK' }]
    );
    return 'undetermined';
  } catch (e) {
    console.log('[LocalNotifTest] requestLocalNotificationPermissions failed', e);
    Alert.alert('Notifications error', 'Could not request notification permission. Check the Metro console for details.', [
      { text: 'OK' },
    ]);
    return 'denied';
  }
}

/**
 * Schedules a local notification 5 seconds from now. Sound on; includes `flightClubLocalTest` in `data`
 * so the root handler shows the system banner in the foreground without affecting remote push UX.
 */
export async function scheduleTestLocalNotification(): Promise<string | null> {
  if (Platform.OS === 'web') {
    console.log('[LocalNotifTest] scheduleTestLocalNotification: web — not supported');
    return null;
  }

  try {
    await ensureAndroidDefaultChannel();

    const id = await scheduleNotificationAsync({
      content: {
        title: 'Flight Club Test',
        body: 'Local notifications are working on your phone.',
        sound: true,
        data: { ...LOCAL_TEST_NOTIFICATION_DATA },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_DEFAULT_CHANNEL_ID } : {}),
      },
      trigger: {
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 5,
        repeats: false,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_DEFAULT_CHANNEL_ID } : {}),
      },
    });

    console.log('[LocalNotifTest] scheduled test notification', id);
    return id;
  } catch (e) {
    console.log('[LocalNotifTest] scheduleTestLocalNotification failed', e);
    return null;
  }
}
