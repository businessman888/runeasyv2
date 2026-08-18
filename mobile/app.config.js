import { config } from 'dotenv';

// Local env loading. EAS cloud builds inject EXPO_PUBLIC_* from the matching
// eas.json profile `env` block, so this only affects local runs (expo start /
// run:*). Base `.env` points at production; setting APP_ENV=staging overlays
// `.env.staging` (only the 3 environment-defining vars) on top, so a local run
// can target the staging Supabase + backend without editing `.env`.
config();
if (process.env.APP_ENV === 'staging') {
  config({ path: '.env.staging', override: true });
}

// With remote app versioning, EAS injects the effective iOS build number only
// during the cloud build. Exposing it through `ios.buildNumber` is also needed
// by @bacons/apple-targets, otherwise the generated Watch target falls back to
// CURRENT_PROJECT_VERSION=1 while EAS increments only the iPhone target.
const iosBuildNumber = process.env.EAS_BUILD_IOS_BUILD_NUMBER || "1";

export default {
  owner: "businessman23",
  name: "RunEasy",
  slug: "runeasy",
  version: "1.0.6",
  // "default" libera rotação no nível nativo; o lock por device (phone trava em
  // portrait, tablet/iPad rotaciona) é feito em runtime no App.tsx via
  // expo-screen-orientation. Ver TABLET_RESPONSIVENESS_PLAN.md.
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  scheme: "runeasy",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0E0E1F"
  },
  ios: {
    buildNumber: iosBuildNumber,
    // Habilita iPad. PRÉ-REQUISITO DE SUBMIT (Fase 7): com supportsTablet=true,
    // o App Store Connect passa a EXIGIR screenshots de iPad 12.9" (2048×2732px).
    // Ver TABLET_RESPONSIVENESS_PLAN.md §7.
    supportsTablet: true,
    bundleIdentifier: "com.oytotec.runeasy",
    appleTeamId: "Z6NSSC9399",
    newArchEnabled: true,
    usesAppleSignIn: true,
    googleServicesFile: "./GoogleService-Info.plist",
    infoPlist: {
      NSMotionUsageDescription: "RunEasy usa sensores de movimento para melhorar a precisão do treino",
      NSLocationWhenInUseUsageDescription: "RunEasy precisa de acesso à sua localização para rastrear sua corrida.",
      NSLocationAlwaysAndWhenInUseUsageDescription: "RunEasy rastreia sua corrida mesmo com a tela desligada.",
      NSLocationAlwaysUsageDescription: "RunEasy rastreia sua corrida mesmo em background.",
      NSPhotoLibraryAddUsageDescription: "RunEasy precisa de acesso para salvar imagens dos seus treinos na galeria.",
      NSPhotoLibraryUsageDescription: "Usado para selecionar uma foto de perfil personalizada exibida no seu perfil de corredor dentro do RunEasy.",
      NSHealthShareUsageDescription: "Precisamos acessar seus dados de treino para sincronizar suas corridas do Apple Watch e personalizar seu plano de treino com IA.",
      NSHealthUpdateUsageDescription: "Precisamos salvar informações dos seus treinos realizados no RunEasy.",
      NSBluetoothAlwaysUsageDescription: "O RunEasy usa o Bluetooth para conectar à sua esteira e receber dados de treino em tempo real (velocidade, distância, inclinação).",
      NSBluetoothPeripheralUsageDescription: "O RunEasy usa o Bluetooth para conectar à sua esteira e receber dados de treino em tempo real.",
      // "audio" habilita o coach de voz falar com a tela apagada (celular no bolso,
      // fone no ouvido). Justificativa p/ revisão Apple: coaching por voz durante a
      // corrida em background. Disparo real vem da locationTask (ver coachOrchestrator).
      UIBackgroundModes: ["fetch", "location", "remote-notification", "bluetooth-central", "audio"],
      LSApplicationQueriesSchemes: [
        "instagram",
        "instagram-stories"
      ],
      // Export compliance: app declares it uses non-exempt encryption, paired with
      // the approved annual compliance code from App Store Connect. This skips the
      // per-build "export compliance" question on every TestFlight/App Store upload.
      ITSAppUsesNonExemptEncryption: true,
      ITSEncryptionExportComplianceCode: "eff161a3-6baf-4032-accd-f27a7a9d1a35"
    }
  },
  android: {
    newArchEnabled: true,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0E0E1F"
    },
    package: "com.runeasy.app",
    googleServicesFile: "./google-services.json",
    permissions: [
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.VIBRATE",
      "android.permission.SCHEDULE_EXACT_ALARM",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
      // Health Connect — reads from Galaxy Watch / Samsung Health / any HC writer
      "android.permission.health.READ_EXERCISE",
      "android.permission.health.READ_HEART_RATE",
      "android.permission.health.READ_DISTANCE",
      "android.permission.health.READ_TOTAL_CALORIES_BURNED"
    ],
    queries: [
      { package: "com.instagram.android" },
      {
        intent: {
          action: "com.instagram.share.ADD_TO_STORY"
        }
      },
      // Allows the app to detect whether Health Connect is installed and to
      // resolve its `read_*` permission rationale activity.
      { package: "com.google.android.apps.healthdata" }
    ]
  },
  web: {
    favicon: "./assets/favicon.png"
  },
  extra: {
    eas: {
      projectId: "8a2dbe01-0124-4565-bf1d-ca858507e3ae"
    },
    facebookAppId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || ""
  },
  plugins: [
    "expo-apple-authentication",
    "./plugins/withMapboxAndroid",
    "expo-secure-store",
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#FF6B35",
        defaultChannel: "default",
        sounds: []
      }
    ],
    "expo-web-browser",
    // Coach de áudio: só REPRODUÇÃO de voz (expo-speech) — nunca gravação. Desliga
    // a permissão de microfone (iOS NSMicrophoneUsageDescription + Android RECORD_AUDIO)
    // que o plugin declara por padrão, evitando escrutínio de loja sem uso legítimo.
    ["expo-audio", { microphonePermission: false, recordAudioAndroid: false }],
    [
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme: "com.googleusercontent.apps.911159721571-ltiean858pjt83qsbnmvim5o3slf5aph"
      }
    ],
    [
      "@rnmapbox/maps",
      {
        // O token de download é lido automaticamente de process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN
      }
    ],
    [
      "@kingstinct/react-native-healthkit",
      {
        background: true,
        NSHealthShareUsageDescription: "Precisamos acessar seus dados de treino para sincronizar suas corridas do Apple Watch e personalizar seu plano de treino com IA.",
        NSHealthUpdateUsageDescription: "Precisamos salvar informações dos seus treinos realizados no RunEasy."
      }
    ],
    // O target watchOS vive em `targets/runeasy-watch/`. O @bacons/apple-targets
    // aponta INFOPLIST_FILE e CODE_SIGN_ENTITLEMENTS direto para os arquivos
    // daquela pasta, então Info.plist e entitlements já entram na build sem
    // nenhum plugin de cópia. (Havia um `./plugins/withAppleWatch` copiando
    // para `ios/RunEasyWatch/` — caminho que o build nem consulta. Era no-op.)
    "@bacons/apple-targets",
    [
      "./plugins/withGarminConnectIQ",
      { appUuid: "8338c29a-1ddf-40d4-892c-b1a3038a1cf5" }
    ],
    [
      "react-native-ble-plx",
      {
        isBackgroundEnabled: true,
        modes: ["central"],
        bluetoothAlwaysPermission: "O RunEasy usa o Bluetooth para conectar à sua esteira e receber dados de treino em tempo real (velocidade, distância, inclinação)."
      }
    ],
    "./plugins/withBluetoothNeverForLocation",
    // Android-only: injects the `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`
    // intent filter on MainActivity so Health Connect can deep-link back to the
    // app when the user denies permission and needs the rationale screen.
    "react-native-health-connect",
    // Bumps the Android `minSdkVersion` to 26 (Android 8.0). Required by
    // `androidx.health.connect:connect-client`, which is the transitive
    // dependency that powers `react-native-health-connect`. Without this the
    // manifest merger fails with "minSdkVersion 24 cannot be smaller than 26".
    // Android 8.0+ already covers ~99% of active devices, so the user-facing
    // impact is negligible.
    [
      "expo-build-properties",
      {
        "android": {
          "minSdkVersion": 26
        },
        // iOS: o Google Sign-In puxa o Swift pod `AppCheckCore`, que depende de
        // `GoogleUtilities` e `RecaptchaInterop` (ObjC, sem module map). Em
        // linkagem estática o CocoaPods exige modular headers nesses dois para
        // o AppCheckCore conseguir importá-los do Swift. Declará-los aqui com
        // `modular_headers: true` resolve o `pod install` (mesmo tratamento que
        // o Expo já dá a dezenas de outros pods). NÃO relacionado a tablet.
        "ios": {
          "extraPods": [
            { "name": "GoogleUtilities", "modular_headers": true },
            { "name": "RecaptchaInterop", "modular_headers": true }
          ]
        }
      }
    ],
    // Configure expo-media-library explicitly so it does NOT declare the broad
    // media-READ permissions. Default `granularPermissions` is [photo,video,audio]
    // → READ_MEDIA_IMAGES/VIDEO/AUDIO, which Google Play rejects for occasional
    // photo access. We only WRITE (saveToLibraryAsync) and pick via the system
    // Photo Picker (no permission), so we need none of them → granularPermissions: [].
    // Listing it here (vs the auto-applied default) makes createRunOncePlugin use
    // these options and skip the default injection.
    [
      "expo-media-library",
      {
        "granularPermissions": []
      }
    ],
    // Must run AFTER expo-media-library: bounds the legacy READ/WRITE_EXTERNAL_STORAGE
    // permissions with android:maxSdkVersion (they have no effect on modern Android
    // and otherwise sit unbounded in the manifest).
    "./plugins/withScopedLegacyStoragePermissions"
  ],
  notification: {
    icon: "./assets/notification-icon.png",
    color: "#FF6B35",
    androidMode: "default",
    androidCollapsedTitle: "RunEasy"
  }
};
