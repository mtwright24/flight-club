import { NativeModules, Platform } from 'react-native';

import * as webStub from './expoNotificationsApi.web';

type Impl = typeof webStub;

/**
 * Load real expo-notifications only inside try/catch + native-module check.
 * Web stub is a static import so Metro has one module identity (avoids HMR "unexpected undefined").
 */
function tryLoadNativeImpl(): Impl | null {
  if (Platform.OS === 'web') return null;
  try {
    const nm = NativeModules as Record<string, unknown>;
    if (!nm.NotificationsServerRegistrationModule) return null;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const getExpoPushTokenAsyncDefault = require('expo-notifications/build/getExpoPushTokenAsync').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const setNotificationChannelAsyncDefault = require('expo-notifications/build/setNotificationChannelAsync').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AndroidImportance } = require('expo-notifications/build/NotificationChannelManager.types');
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

    return {
      getExpoPushTokenAsync: getExpoPushTokenAsyncDefault as (options?: {
        projectId?: string;
      }) => Promise<{ data: string; type?: string }>,
      setNotificationChannelAsync: setNotificationChannelAsyncDefault,
      AndroidImportance,
      addNotificationReceivedListener,
      addNotificationResponseReceivedListener,
      getLastNotificationResponseAsync,
      setNotificationHandler,
      getPermissionsAsync,
      requestPermissionsAsync,
    };
  } catch (e) {
    if (__DEV__) {
      console.warn('[expoNotifications] Failed to load expo-notifications native bindings; using stubs.', e);
    }
    return null;
  }
}

const impl: Impl = tryLoadNativeImpl() ?? webStub;

export const getExpoPushTokenAsync = impl.getExpoPushTokenAsync;
export const setNotificationChannelAsync = impl.setNotificationChannelAsync;
export const AndroidImportance = impl.AndroidImportance;
export const addNotificationReceivedListener = impl.addNotificationReceivedListener;
export const addNotificationResponseReceivedListener = impl.addNotificationResponseReceivedListener;
export const getLastNotificationResponseAsync = impl.getLastNotificationResponseAsync;
export const setNotificationHandler = impl.setNotificationHandler;
export const getPermissionsAsync = impl.getPermissionsAsync;
export const requestPermissionsAsync = impl.requestPermissionsAsync;
