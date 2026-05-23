/**
 * Expo config plugin para o módulo nativo `expo-garmin-connect-iq`.
 *
 * iOS:
 *   - Injeta LSApplicationQueriesSchemes (gcm-ciq, com.garmin.connect.mobile) no Info.plist.
 *   - Adiciona um CFBundleURLTypes entry com o URL scheme `gcm-ciq-{APP_UUID}` que o
 *     Garmin Connect Mobile usa pra responder à `showDeviceSelection`.
 *   - Patcheia o AppDelegate pra rotear `application(_:open:url:options:)` ao módulo.
 *
 * Android:
 *   - Garante <queries> apontando para o pacote do Garmin Connect (necessário Android 11+).
 *   - Adiciona permissões BLUETOOTH_CONNECT.
 */
const {
  withInfoPlist,
  withAndroidManifest,
  withAppDelegate,
  AndroidConfig,
} = require('@expo/config-plugins');

const GCM_PACKAGE = 'com.garmin.android.apps.connectmobile';

function withGarminInfoPlist(config, { appUuid }) {
  return withInfoPlist(config, (config) => {
    const plist = config.modResults;

    const schemesToAdd = ['gcm-ciq', 'com.garmin.connect.mobile'];
    plist.LSApplicationQueriesSchemes = Array.from(
      new Set([...(plist.LSApplicationQueriesSchemes || []), ...schemesToAdd])
    );

    const urlScheme = `gcm-ciq-${appUuid}`;
    plist.CFBundleURLTypes = plist.CFBundleURLTypes || [];
    const alreadyExists = plist.CFBundleURLTypes.some(
      (entry) =>
        Array.isArray(entry.CFBundleURLSchemes) &&
        entry.CFBundleURLSchemes.includes(urlScheme)
    );
    if (!alreadyExists) {
      plist.CFBundleURLTypes.push({
        CFBundleURLName: 'com.runeasy.garminconnectiq',
        CFBundleURLSchemes: [urlScheme],
      });
    }
    return config;
  });
}

function withGarminAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      console.warn(
        '[withGarminConnectIQ] AppDelegate language is not swift. Garmin URL routing may not work — review manually.'
      );
      return config;
    }
    let src = config.modResults.contents;

    // Import statement
    if (!src.includes('import expo_garmin_connect_iq') && !src.includes('ExpoGarminConnectIQModule')) {
      const importAnchor = src.indexOf('import Expo');
      if (importAnchor >= 0) {
        const insertAt = src.indexOf('\n', importAnchor) + 1;
        src =
          src.slice(0, insertAt) +
          '#if canImport(expo_garmin_connect_iq)\nimport expo_garmin_connect_iq\n#endif\n' +
          src.slice(insertAt);
      }
    }

    // Hook into application(_:open:url:options:). Expo's AppDelegate already implements
    // this method; we inject a check before the existing return.
    const openURLAnchor = /func application\(\s*_ app: UIApplication,\s*open url: URL/;
    if (openURLAnchor.test(src) && !src.includes('ExpoGarminConnectIQModule.handleOpenURL')) {
      src = src.replace(openURLAnchor, (match) => {
        // Insert a body line right after the function brace. We rely on the existing
        // RCTLinkingManager call returning a Bool we can short-circuit.
        return match;
      });
      const openFuncBraceIdx = src.search(openURLAnchor);
      if (openFuncBraceIdx >= 0) {
        const braceIdx = src.indexOf('{', openFuncBraceIdx);
        if (braceIdx >= 0) {
          const insertAt = braceIdx + 1;
          const snippet = `
    #if canImport(expo_garmin_connect_iq)
    if ExpoGarminConnectIQModule.handleOpenURL(url) { return true }
    #endif
`;
          src = src.slice(0, insertAt) + snippet + src.slice(insertAt);
        }
      }
    }

    config.modResults.contents = src;
    return config;
  });
}

function withGarminAndroidManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // <queries>
    manifest.queries = manifest.queries || [];
    const alreadyQueried = manifest.queries.some((q) =>
      (q.package || []).some((p) => p.$['android:name'] === GCM_PACKAGE)
    );
    if (!alreadyQueried) {
      manifest.queries.push({ package: [{ $: { 'android:name': GCM_PACKAGE } }] });
    }

    // BLUETOOTH_CONNECT
    AndroidConfig.Permissions.addPermission(manifest, 'android.permission.BLUETOOTH_CONNECT');
    return config;
  });
}

const withGarminConnectIQ = (config, options = {}) => {
  const appUuid = options.appUuid;
  if (!appUuid) {
    throw new Error(
      '[withGarminConnectIQ] Missing required option `appUuid`. Pass it as ' +
        "['./plugins/withGarminConnectIQ', { appUuid: '8338c29a-1ddf-40d4-892c-b1a3038a1cf5' }] in app.config.js"
    );
  }

  config = withGarminInfoPlist(config, { appUuid });
  config = withGarminAppDelegate(config);
  config = withGarminAndroidManifest(config);
  return config;
};

module.exports = withGarminConnectIQ;
