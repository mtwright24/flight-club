/**
 * RN 0.81+ deprecates core `SafeAreaView`; some code paths still touch the legacy export and
 * Hermes can throw `ReferenceError: Property 'SafeAreaView' doesn't exist` when the native
 * view is unavailable. Use `react-native-safe-area-context` as the implementation (Expo default).
 */
const RN = require('react-native');
const { SafeAreaView } = require('react-native-safe-area-context');

try {
  Object.defineProperty(RN, 'SafeAreaView', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: SafeAreaView,
  });
} catch {
  try {
    RN.SafeAreaView = SafeAreaView;
  } catch {
    /* ignore */
  }
}
