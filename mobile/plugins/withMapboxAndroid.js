/**
 * Config plugin that injects mapbox_access_token into Android strings.xml.
 *
 * The @rnmapbox/maps Expo plugin only sets MAPBOX_DOWNLOADS_TOKEN in gradle.properties
 * (for SDK download authentication). It does NOT write the runtime access token to
 * strings.xml. The Mapbox Android SDK v10+ initializes its MapController natively
 * before JS runs, so Mapbox.setAccessToken() from JS arrives too late.
 *
 * By writing the token to strings.xml here (during expo prebuild), the Android SDK
 * reads it synchronously at app startup via MapboxOptions.accessToken before any
 * native map view is inflated.
 */
const { withStringsXml } = require('@expo/config-plugins');

module.exports = function withMapboxAndroid(config) {
  return withStringsXml(config, (modConfig) => {
    const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!mapboxToken) {
      console.warn('[withMapboxAndroid] EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN is not set — map tiles will not load.');
      return modConfig;
    }

    const strings = modConfig.modResults.resources.string ?? [];
    // Remove existing entry to avoid duplicates on repeated prebuild runs
    modConfig.modResults.resources.string = [
      ...strings.filter((s) => s.$.name !== 'mapbox_access_token'),
      { $: { name: 'mapbox_access_token', translatable: 'false' }, _: mapboxToken },
    ];
    return modConfig;
  });
};
