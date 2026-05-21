import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Text, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation';
import { useNotifications } from './src/hooks/useNotifications';
import Mapbox from '@rnmapbox/maps';
import { SuperwallProvider, CustomPurchaseControllerProvider } from 'expo-superwall';
import type { CustomPurchaseControllerContext } from 'expo-superwall';
import { SuperwallBridge } from './src/components/paywall/SuperwallBridge';
import { initializeRevenueCat, getSuperwallApiKey } from './src/services/paywall';
import { initSubscriptionListener } from './src/stores/authStore';
import { useSubscriptionStore } from './src/stores/subscriptionStore';
import { useDevMenuStore } from './src/stores/devMenuStore';
import { useAppleWatchStore } from './src/stores/appleWatchStore';
import { WatchBridgeDebugBanner } from './src/components/debug/WatchBridgeDebugBanner';
import { useWatchSync } from './src/hooks/useWatchSync';

// Registra Task de Rastreamento (Background GPS)
import './src/tasks/locationTask';

// Inicializa o token de acesso runtime do Mapbox.
// Deve ser chamado antes de qualquer componente MapView ser renderizado.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '');


/**
 * Custom purchase controller — wrapping SuperwallProvider with this puts the
 * Superwall SDK in MANUAL purchase management mode. Without it the SDK runs in
 * automatic mode, manages subscriptionStatus itself from Play Billing, IGNORES
 * our setSubscriptionStatus, and (with no valid billing in dev) leaves the
 * status UNKNOWN — which makes Superwall HOLD every paywall and registerPlacement
 * never present. In manual mode our setSubscriptionStatus (Free→INACTIVE) takes
 * effect and paywalls present.
 *
 * Purchases themselves aren't wired (RevenueCat keys are `test_*` / invalid), so
 * the handlers are graceful no-ops for now — the goal is to PRESENT the paywall.
 * TODO: route onPurchase/onPurchaseRestore through RevenueCat once real
 * `goog_`/`appl_` keys are configured.
 */
const superwallPurchaseController: CustomPurchaseControllerContext = {
  onPurchase: async (params) => {
    console.log('[Superwall] onPurchase →', JSON.stringify(params));
    return { type: 'cancelled' };
  },
  onPurchaseRestore: async () => {
    console.log('[Superwall] onPurchaseRestore');
    return { type: 'failed', error: 'Restore não configurado (dev)' };
  },
};

// Error Boundary to catch rendering errors
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>❌ App Error</Text>
          <Text style={styles.errorMessage}>
            {this.state.error?.message || 'Unknown error'}
          </Text>
          <Text style={styles.errorStack}>
            {this.state.error?.stack?.substring(0, 500)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

/**
 * WatchSyncManager Component
 *
 * Sincroniza treino do dia + nome do usuário do iPhone para o Apple Watch.
 * Renderiza null — só executa o useWatchSync hook que assina os stores.
 */
function WatchSyncManager() {
  useWatchSync();
  return null;
}

/**
 * Notification Manager Component
 *
 * Handles push notification lifecycle.
 * Safe to use anywhere - doesn't require NavigationContainer context
 * because useNotifications uses navigationRef internally.
 */
function NotificationManager() {
  const { expoPushToken, notification, isRegistered } = useNotifications();

  useEffect(() => {
    if (expoPushToken) {
      console.log('[App] Push token registered:', expoPushToken.substring(0, 30) + '...');
    }
  }, [expoPushToken]);

  useEffect(() => {
    if (notification) {
      console.log('[App] Notification received:', notification.request.content.title);
    }
  }, [notification]);

  // This component doesn't render anything, just manages notifications
  return null;
}

export default function App() {
  // Plus Jakarta Sans — fonte do design system. Carregada em runtime; usada
  // (por ora) nos cards de upgrade Pro. fontError evita travar o app se o
  // carregamento falhar — segue com a fonte do sistema.
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // Inicializa RevenueCat e subscription listener uma vez
  useEffect(() => {
    initializeRevenueCat();
    const removeListener = initSubscriptionListener();
    // Hidrata DevMenu override em dev/preview (no-op em prod via __DEV__ check inside hydrate consumers)
    if (__DEV__) {
      void useDevMenuStore.getState().hydrate();
    }
    return () => removeListener();
  }, []);

  // Refetch subscription quando o app volta do background (cobre upgrade
  // feito fora do app — App Store / web — e expiração silenciosa)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void useSubscriptionStore.getState().fetchSubscription();
      }
    });
    return () => sub.remove();
  }, []);

  // Inicializa bridge com Apple Watch (Phase 4)
  useEffect(() => {
    void useAppleWatchStore.getState().bootstrap();
  }, []);

  const superwallApiKey = getSuperwallApiKey();

  // Mantém o splash enquanto a fonte carrega (padrão Expo). Se falhar, segue.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <CustomPurchaseControllerProvider controller={superwallPurchaseController}>
        <SuperwallProvider
          apiKeys={{
            ios: superwallApiKey,
            android: superwallApiKey,
          }}
          options={__DEV__ ? { logging: { level: 'debug' } } : undefined}
          onConfigurationError={(error) =>
            console.warn('[Superwall] Configuration error:', error?.message ?? String(error))
          }
        >
          <GestureHandlerRootView style={styles.container}>
            <StatusBar style="light" translucent backgroundColor="transparent" />
            {/* Bridge que conecta Superwall hooks ao authStore */}
            <SuperwallBridge />
            {/* NotificationManager is safe to use here because it uses navigationRef */}
            <NotificationManager />
            {/* WatchSyncManager: pushes today's workout + user name to Apple Watch */}
            <WatchSyncManager />
            <AppNavigator />
            <WatchBridgeDebugBanner />
          </GestureHandlerRootView>
        </SuperwallProvider>
        </CustomPurchaseControllerProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A18',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTitle: {
    color: '#ff4444',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  errorMessage: {
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  errorStack: {
    color: '#888888',
    fontSize: 12,
    fontFamily: 'monospace',
  },
});
