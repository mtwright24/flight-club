/**
 * Dynamic Expo config — merges app.json and injects Google Maps keys from env at prebuild.
 * Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (Maps SDK for iOS/Android) in .env or EAS secrets, then rebuild dev client.
 */
const appJson = require('./app.json');

const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

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
    extra: {
      ...(appJson.expo.extra || {}),
      googleMapsApiKey: googleMapsKey,
    },
  },
};
