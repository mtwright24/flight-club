import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type DeviceSnapshot = {
  isDevice: boolean;
  modelName: string | null;
  deviceName: string | null;
};

/** Shape of the native ExpoDevice module (subset used by push). */
type ExpoDeviceNativeModule = {
  isDevice?: boolean;
  modelName?: string | null;
  deviceName?: string | null;
};

let cached: DeviceSnapshot | null = null;
/** Dev: log missing native module at most once (avoids spam when effects re-run or Fast Refresh resets). */
let devWarnedMissingExpoDevice = false;

/**
 * Resolves device info via `requireOptionalNativeModule` — does **not** import `expo-device/build/Device`,
 * which calls `requireNativeModule` and throws/logs ERROR when the native binary lacks ExpoDevice.
 */
function load(): DeviceSnapshot {
  if (cached) return cached;
  if (Platform.OS === 'web') {
    cached = { isDevice: false, modelName: null, deviceName: null };
    return cached;
  }

  const native = requireOptionalNativeModule<ExpoDeviceNativeModule>('ExpoDevice');
  if (!native) {
    if (__DEV__ && !devWarnedMissingExpoDevice) {
      devWarnedMissingExpoDevice = true;
      console.log(
        '[expo-device] ExpoDevice native module not linked — cannot detect simulator vs phone. Attempting push registration anyway; add expo-device to the dev client for reliable device checks.'
      );
    }
    // If the native module is missing (common until dev client is rebuilt with expo-device), we used to
    // assume "not a physical device" and skipped Supabase entirely — real phones then never got a row.
    // Prefer attempting registration; Expo push APIs still fail on simulators when appropriate.
    cached = { isDevice: true, modelName: null, deviceName: null };
    return cached;
  }

  cached = {
    isDevice: !!native.isDevice,
    modelName: native.modelName ?? null,
    deviceName: native.deviceName ?? null,
  };
  return cached;
}

/**
 * Use methods (not getters) so Hermes does not throw `Property 'isDevice' doesn't exist` on the export object.
 */
export const expoDeviceSafe = {
  getIsDevice(): boolean {
    return load().isDevice;
  },
  getModelName(): string | null {
    return load().modelName;
  },
  getDeviceName(): string | null {
    return load().deviceName;
  },
};
