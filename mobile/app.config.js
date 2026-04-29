import 'dotenv/config';

export default {
  owner: "businessman23",
  name: "RunEasy",
  slug: "runeasy",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  scheme: "runeasy",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0E0E1F"
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.oytotec.runeasy",
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
      UIBackgroundModes: ["fetch", "processing", "location", "remote-notification"],
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
      "FOREGROUND_SERVICE_LOCATION"
    ],
    queries: [
      { package: "com.instagram.android" },
      {
        intent: {
          action: "com.instagram.share.ADD_TO_STORY"
        }
      }
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
        iosUrlScheme: "com.googleusercontent.apps.74528549958-hf64h4138o6dr40d59q96bpl1pjk8qh4"
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
    ]
  ],
  notification: {
    icon: "./assets/notification-icon.png",
    color: "#FF6B35",
    androidMode: "default",
    androidCollapsedTitle: "RunEasy"
  }
};
