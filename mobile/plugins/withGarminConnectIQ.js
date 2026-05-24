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
  withAppBuildGradle,
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

/**
 * Injeta a dependência do Garmin Connect IQ SDK (`.aar`) no `app/build.gradle`.
 *
 * Por que aqui (e não no `build.gradle` do módulo expo-garmin-connect-iq)?
 * O Android Gradle Plugin proíbe que módulos library (que produzem AAR)
 * declarem `.aar` locais como `implementation` — falha em `bundleDebugAar`
 * com "Direct local .aar file dependencies are not supported". Módulos APK
 * (como o app) podem embedar .aar locais sem restrição.
 *
 * O caminho relativo é a partir de `android/app/build.gradle` → módulo expo.
 */
function withGarminAppBuildGradle(config) {
  return withAppBuildGradle(config, (config) => {
    const marker = 'expo-garmin-connect-iq SDK';
    if (config.modResults.contents.includes(marker)) {
      return config;
    }
    const depSnippet = `
    // ${marker} — embedded directly in the APK (cannot be declared inside the
    // library module's build.gradle due to the AGP "Direct local .aar file
    // dependencies are not supported when building an AAR" restriction).
    implementation fileTree(dir: '../../modules/expo-garmin-connect-iq/android/libs', include: ['*.aar'])`;

    let src = config.modResults.contents;
    // Inject before the closing brace of the LAST `dependencies { ... }` block.
    const depsAnchor = /dependencies\s*\{/g;
    let lastMatch;
    let m;
    while ((m = depsAnchor.exec(src)) !== null) {
      lastMatch = m;
    }
    if (!lastMatch) {
      console.warn(
        '[withGarminConnectIQ] could not find a `dependencies {` block in app/build.gradle — Garmin .aar NOT linked',
      );
      return config;
    }
    // Find the matching closing brace, accounting for nesting.
    let depth = 1;
    let idx = lastMatch.index + lastMatch[0].length;
    while (idx < src.length && depth > 0) {
      const ch = src[idx];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      if (depth === 0) break;
      idx += 1;
    }
    if (depth !== 0) {
      console.warn(
        '[withGarminConnectIQ] could not find matching `}` for dependencies block — Garmin .aar NOT linked',
      );
      return config;
    }
    config.modResults.contents = src.slice(0, idx) + depSnippet + '\n' + src.slice(idx);
    return config;
  });
}

function withGarminAndroidManifest(config) {
  return withAndroidManifest(config, (config) => {
    // `config.modResults` é o wrapper { manifest: { ... } }. As APIs do
    // @expo/config-plugins esperam esse wrapper diretamente; o nó interno
    // <manifest> (com queries / application) fica em `config.modResults.manifest`.
    const innerManifest = config.modResults.manifest;

    // <queries> — adicionado no nó interno <manifest>
    innerManifest.queries = innerManifest.queries || [];
    const alreadyQueried = innerManifest.queries.some((q) =>
      (q.package || []).some((p) => p.$['android:name'] === GCM_PACKAGE)
    );
    if (!alreadyQueried) {
      innerManifest.queries.push({ package: [{ $: { 'android:name': GCM_PACKAGE } }] });
    }

    // BLUETOOTH_CONNECT — addPermission recebe o WRAPPER (acessa .manifest internamente)
    AndroidConfig.Permissions.addPermission(
      config.modResults,
      'android.permission.BLUETOOTH_CONNECT',
    );
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
  config = withGarminAppBuildGradle(config);
  return config;
};

module.exports = withGarminConnectIQ;
