import { Platform } from 'react-native';

import * as webStub from './expoNotificationsApi.web';

type Impl = typeof webStub;

/**
 * Load expo-notifications from granular entry points.
 * `getExpoPushTokenAsync` is loaded **last** in its own try/catch so Expo Go / missing
 * `ExpoPushTokenManager` does not prevent permissions, scheduling, and handlers from working.
 */
function tryLoadNativeImpl(): Impl | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const setNotificationChannelAsyncDefault = require('expo-notifications/build/setNotificationChannelAsync').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AndroidImportance, AndroidNotificationVisibility } = require(
      'expo-notifications/build/NotificationChannelManager.types'
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SchedulableTriggerInputTypes } = require('expo-notifications/build/Notifications.types');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const scheduleNotificationAsyncDefault = require('expo-notifications/build/scheduleNotificationAsync').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      addNotificationReceivedListener,
      addNotificationResponseReceivedListener,
      getLastNotificationResponseAsync,
    } = require('expo-notifications/build/NotificationsEmitter');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setNotificationHandler } = require('expo-notifications/build/NotificationsHandler');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getPermissionsAsync, requestPermissionsAsync } = require('expo-notifications/build/NotificationPermissions');

    let getExpoPushTokenAsyncFn: (options?: { projectId?: string }) => Promise<{ data: string; type?: string }> =
      async () => ({ data: '' });
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      getExpoPushTokenAsyncFn = require('expo-notifications/build/getExpoPushTokenAsync').default;
    } catch (e) {
      if (__DEV__) {
        console.log(
          '[expoNotifications] getExpoPushTokenAsync unavailable (rebuild dev client with expo-notifications, or use a device build). Push token will be empty.',
          e
        );
      }
    }

    return {
      getExpoPushTokenAsync: getExpoPushTokenAsyncFn,
      setNotificationChannelAsync: setNotificationChannelAsyncDefault,
      AndroidImportance,
      AndroidNotificationVisibility,
      SchedulableTriggerInputTypes,
      scheduleNotificationAsync: scheduleNotificationAsyncDefault,
      addNotificationReceivedListener,
      addNotificationResponseReceivedListener,
      getLastNotificationResponseAsync,
      setNotificationHandler,
      getPermissionsAsync,
      requestPermissionsAsync,
    };
  } catch (e) {
    if (__DEV__) {
      console.log('[expoNotifications] Native bindings unavailable; using stubs.', e);
    }
    return null;
  }
}

const impl: Impl = tryLoadNativeImpl() ?? webStub;

export const getExpoPushTokenAsync = impl.getExpoPushTokenAsync;
export const setNotificationChannelAsync = impl.setNotificationChannelAsync;
export const AndroidImportance = impl.AndroidImportance;
export const AndroidNotificationVisibility = impl.AndroidNotificationVisibility;
export const SchedulableTriggerInputTypes = impl.SchedulableTriggerInputTypes;
export const scheduleNotificationAsync = impl.scheduleNotificationAsync;
export const addNotificationReceivedListener = impl.addNotificationReceivedListener;
export const addNotificationResponseReceivedListener = impl.addNotificationResponseReceivedListener;
export const getLastNotificationResponseAsync = impl.getLastNotificationResponseAsync;
export const setNotificationHandler = impl.setNotificationHandler;
export const getPermissionsAsync = impl.getPermissionsAsync;
export const requestPermissionsAsync = impl.requestPermissionsAsync;
