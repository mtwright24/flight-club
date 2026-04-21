/**
 * Must be listed **before** `expo-notifications` in `app.json` so the
 * entitlements mod chain runs notifications first, then this plugin removes
 * `aps-environment` (expo-notifications always adds it; Personal Team cannot
 * provision Push). Remote push will not work until you use a paid Apple
 * Developer account and remove this plugin.
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withStripIosPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
