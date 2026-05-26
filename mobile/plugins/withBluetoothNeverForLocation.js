/**
 * Config plugin that marks BLUETOOTH_SCAN with `usesPermissionFlags="neverForLocation"`.
 *
 * Google Play requires apps that request BLUETOOTH_SCAN on Android 12+ to either:
 *   1. Declare the `neverForLocation` flag (we don't infer location from BLE), or
 *   2. Justify in App Review why we need location-derivable BLE scanning.
 *
 * The treadmill flow only uses BLE to read fitness data from a single,
 * user-selected FTMS device — it never tries to derive the user's location
 * from BLE advertisements. Declaring `neverForLocation` is the correct
 * Play policy answer and avoids "BLE scan must be neverForLocation" warnings
 * in the Play Console.
 *
 * Expo's stock `android.permissions` array only lets us add the permission
 * by name; it can't set the `usesPermissionFlags` attribute. So we rewrite
 * the AndroidManifest.xml entry after prebuild.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBluetoothNeverForLocation(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const permissions = manifest['uses-permission'] || [];

    // Locate the BLUETOOTH_SCAN entry (Expo writes it without flags).
    const target = 'android.permission.BLUETOOTH_SCAN';
    const scanEntry = permissions.find(
      (p) => p.$ && p.$['android:name'] === target,
    );

    if (scanEntry) {
      scanEntry.$['android:usesPermissionFlags'] = 'neverForLocation';
    } else {
      // If the bare permission isn't there for some reason, add it with the flag.
      permissions.push({
        $: {
          'android:name': target,
          'android:usesPermissionFlags': 'neverForLocation',
        },
      });
      manifest['uses-permission'] = permissions;
    }

    return modConfig;
  });
};
