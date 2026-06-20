/**
 * Config plugin that bounds the legacy external-storage permissions with
 * `android:maxSdkVersion`, so they don't linger on modern Android where they
 * have no effect (and keep Play review clean):
 *
 *   READ_EXTERNAL_STORAGE  → maxSdkVersion 32  (API 33+ uses READ_MEDIA_*, which
 *                            we don't declare; selection goes through the Photo
 *                            Picker, no permission)
 *   WRITE_EXTERNAL_STORAGE → maxSdkVersion 28  (API 29+ is scoped storage; saving
 *                            to the gallery uses MediaStore, no permission)
 *
 * These permissions are declared without a maxSdkVersion by `expo-image-picker`
 * (its library manifest) and `expo-media-library` (its config plugin). We set the
 * attribute on the main manifest entry and add `tools:replace` so our bound wins
 * over the library-merged declaration.
 *
 * Order: list this AFTER expo-media-library in app.config.js `plugins` so the
 * entries already exist when this runs (we update them in place).
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const MAX_SDK_VERSION = {
  'android.permission.READ_EXTERNAL_STORAGE': '32',
  'android.permission.WRITE_EXTERNAL_STORAGE': '28',
};

module.exports = function withScopedLegacyStoragePermissions(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    // Ensure the tools namespace is declared so `tools:replace` is valid.
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    manifest['uses-permission'] = manifest['uses-permission'] || [];

    for (const [name, maxSdk] of Object.entries(MAX_SDK_VERSION)) {
      let entry = manifest['uses-permission'].find(
        (perm) => perm.$ && perm.$['android:name'] === name,
      );
      if (!entry) {
        entry = { $: { 'android:name': name } };
        manifest['uses-permission'].push(entry);
      }
      entry.$['android:maxSdkVersion'] = maxSdk;
      // Win over the library-merged declaration that has no maxSdkVersion.
      entry.$['tools:replace'] = 'android:maxSdkVersion';
    }

    return modConfig;
  });
};
