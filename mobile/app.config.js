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

export default {
  owner: "businessman23",
  name: "RunEasy",
  slug: "runeasy",
  version: "1.0.0",
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
      NSHealthShareUsageDescription: "Precisamos acessar seus dados de treino para sincronizar suas corridas do Apple Watch e personalizar seu plano de treino com IA.",
      NSHealthUpdateUsageDescription: "Precisamos salvar informações dos seus treinos realizados no RunEasy.",
      NSBluetoothAlwaysUsageDescription: "O RunEasy usa o Bluetooth para conectar à sua esteira e receber dados de treino em tempo real (velocidade, distância, inclinação).",
      NSBluetoothPeripheralUsageDescription: "O RunEasy usa o Bluetooth para conectar à sua esteira e receber dados de treino em tempo real.",
      UIBackgroundModes: ["fetch", "location", "remote-notification", "bluetooth-central"],
      LSApplicationQueriesSchemes: [
        "instagram",
        "instagram-stories"
      ]
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
    "@bacons/apple-targets",
    "./plugins/withAppleWatch",
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
    ]
  ],
  notification: {
    icon: "./assets/notification-icon.png",
    color: "#FF6B35",
    androidMode: "default",
    androidCollapsedTitle: "RunEasy"
  }
};
