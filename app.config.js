/**
 * Dynamic Expo config — merges app.json and injects Google Maps keys from env at prebuild.
 * Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (Maps SDK for iOS/Android) in .env or EAS secrets, then rebuild dev client.
 */
const appJson = require('./app.json');

const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

/** When set, use SPA-style web config so Metro does not hammer SSG/λ (`render.js`) graphs during iOS/Android-only dev. See app.json `web.output: static` for production web exports. */
const startNativeOnly =
  process.env.EXPO_START_NATIVE_ONLY === '1' || process.env.EXPO_START_NATIVE_ONLY === 'true';

module.exports = {
  expo: {
    ...appJson.expo,
    ios: {
      ...appJson.expo.ios,
      config: {
        ...(appJson.expo.ios?.config || {}),
        googleMapsApiKey: googleMapsKey,
      },
    },
    android: {
      ...appJson.expo.android,
      config: {
        ...(appJson.expo.android?.config || {}),
        googleMaps: { apiKey: googleMapsKey },
      },
    },
    web: {
      ...(appJson.expo.web || {}),
      ...(startNativeOnly ? { output: 'single' } : {}),
    },
    extra: {
      ...(appJson.expo.extra || {}),
      googleMapsApiKey: googleMapsKey,
    },
  },
};
