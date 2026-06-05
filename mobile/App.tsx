import React, { useEffect, useRef } from 'react';
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
import {
  initializeRevenueCat,
  getSuperwallApiKey,
  isRevenueCatReady,
  purchaseProductById,
  restoreRevenueCatPurchases,
} from './src/services/paywall';
import { usePurchaseOutcomeStore } from './src/stores/purchaseOutcomeStore';
import { initSubscriptionListener } from './src/stores/authStore';
import { useSubscriptionStore } from './src/stores/subscriptionStore';
import { useDevMenuStore } from './src/stores/devMenuStore';
import { useWorkoutScopeStore } from './src/stores/workoutScopeStore';
import { useAppleWatchStore } from './src/stores/appleWatchStore';
import { useWatchSync } from './src/hooks/useWatchSync';
import { useGarminSync } from './src/hooks/useGarmin';
import { initGarmin, onCompletedRun } from './src/services/garminConnect';
import { useTrainingStore } from './src/stores/trainingStore';
import { useNetworkRetry } from './src/hooks/useNetworkRetry';

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
 * Purchases route through RevenueCat when a valid `goog_`/`appl_` key is
 * configured (isRevenueCatReady()). Without valid keys (dev), onPurchase stays a
 * graceful no-op returning `cancelled` so paywalls still PRESENT. Either way the
 * outcome is recorded in purchaseOutcomeStore so call sites can tell a real
 * purchase failure from a user-closed paywall.
 */
const superwallPurchaseController: CustomPurchaseControllerContext = {
  onPurchase: async (params) => {
    usePurchaseOutcomeStore.getState().setOutcome('pending');
    // Dev / no valid keys: keep the no-op (buying can't complete without real
    // store keys), but report it so the UI treats it as "stayed Free", not error.
    if (!isRevenueCatReady()) {
      usePurchaseOutcomeStore.getState().setOutcome('cancelled');
      return { type: 'cancelled' };
    }
    const outcome = await purchaseProductById(params.productId);
    usePurchaseOutcomeStore.getState().setOutcome(outcome);
    return { type: outcome };
  },
  onPurchaseRestore: async () => {
    if (!isRevenueCatReady()) {
      usePurchaseOutcomeStore.getState().setOutcome('failed');
      return { type: 'failed', error: 'Restore não configurado (dev)' };
    }
    const outcome = await restoreRevenueCatPurchases();
    usePurchaseOutcomeStore.getState().setOutcome(outcome);
    return { type: outcome };
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
 * GarminSyncManager Component
 *
 * Push do treino do dia para o relógio Garmin (via Connect IQ Mobile SDK) sempre
 * que houver dispositivo conectado + treino disponível. Espelha o WatchSyncManager.
 */
function GarminSyncManager() {
  useGarminSync();
  return null;
}

/**
 * NetworkRetryManager Component
 *
 * Escuta mudanças de conectividade via NetInfo e dispara retry das filas
 * locais de workouts pendentes (`pending-workouts`, `pending-free-runs` MMKV)
 * quando a rede passa de offline → online. Renderiza null.
 */
function NetworkRetryManager() {
  useNetworkRetry();
  return null;
}

/**
 * SubscriptionReconciler Component
 *
 * Closes the post-purchase Free→Pro gap. When a plan is generating, the backend
 * has ALREADY been marked Pro by the RevenueCat webhook (generation is triggered
 * by the same activation handler) — but the client's subscriptionStore may still
 * read Free, since fetchSubscription only runs at discrete moments (paywall close,
 * AppState→active, Dev Menu). That left gated screens (e.g. Wellness) locked for
 * the whole ~3 min generation window.
 *
 * This polls fetchSubscription while `generationStatus === 'generating'` and the
 * client is still Free, app-wide (not bound to any screen's focus), and stops the
 * instant Pro lands — so every screen unlocks within ~3 s of the purchase, well
 * before generation finishes. Self-terminating: no perpetual polling once Pro is
 * reconciled or generation ends.
 */
function SubscriptionReconciler() {
  const generationStatus = useTrainingStore((s) => s.generationStatus);
  const isProUser = useSubscriptionStore((s) => s.isProUser);
  const prevStatusRef = useRef(generationStatus);

  // (1) Poll while a plan is generating and the client still reads Free — flips
  // every screen to Pro within ~3 s, app-wide, well before generation ends.
  useEffect(() => {
    if (generationStatus !== 'generating' || isProUser) return;

    const reconcile = () => useSubscriptionStore.getState().fetchSubscription();
    void reconcile(); // immediate — don't wait a full interval to unlock
    const id = setInterval(() => {
      if (useSubscriptionStore.getState().isProUser) {
        clearInterval(id);
        return;
      }
      void reconcile();
    }, 3000);

    return () => clearInterval(id);
  }, [generationStatus, isProUser]);

  // (2) Belt-and-suspenders: when generation reaches a terminal state
  // (generating → complete/failed) while the client is still Free, run a bounded
  // reconcile burst. Covers the race where the plan finishes before poll (1) saw
  // Pro — which otherwise left the WHOLE app stuck on Free after completion until
  // a forced refetch. Transition-gated (not status-gated), so a cold start that
  // lands on a stale 'complete' plan for a legitimately-Free user never triggers
  // it — no perpetual polling.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = generationStatus;

    const justFinished = prev === 'generating' && generationStatus !== 'generating';
    if (!justFinished || isProUser) return;

    let attempts = 0;
    const reconcile = () => useSubscriptionStore.getState().fetchSubscription();
    void reconcile();
    const id = setInterval(() => {
      attempts += 1;
      if (useSubscriptionStore.getState().isProUser || attempts >= 4) {
        clearInterval(id);
        return;
      }
      void reconcile();
    }, 3000);

    return () => clearInterval(id);
  }, [generationStatus, isProUser]);

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
    // Restaura a aba "Treinos | Atividades" escolhida (Home + Calendário)
    void useWorkoutScopeStore.getState().hydrate();
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

  // Inicializa bridge com Garmin Connect IQ — registra listener de corridas
  // finalizadas no relógio Garmin e roteia para trainingStore.
  useEffect(() => {
    void initGarmin().catch((e) => console.warn('[App] initGarmin failed:', e));

    const unsub = onCompletedRun(async (run) => {
      console.log('[App] Garmin completed run received:', {
        external_id: run.external_id,
        distance_m: run.total_distance_meters,
        duration_s: run.duration_seconds,
        device: run.garmin_device_name,
        workout_id: run.workout_id,
      });

      const sourceMetadata = {
        source: 'garmin_watch' as const,
        external_id: run.external_id,
        started_at: run.started_at,
        average_heartrate: run.avg_heart_rate ?? undefined,
        max_heartrate: run.max_heart_rate ?? undefined,
        calories: run.calories ?? undefined,
        avg_pace_seconds_per_km: run.avg_pace_seconds_per_km,
        garmin_device_name: run.garmin_device_name,
      };

      if (run.workout_id) {
        await useTrainingStore.getState().completeWorkout({
          workoutId: run.workout_id,
          route_points: run.route_points,
          total_distance_meters: run.total_distance_meters,
          duration_seconds: run.duration_seconds,
          ...sourceMetadata,
        });
      } else {
        await useTrainingStore.getState().completeFreeRun({
          localId: run.external_id,
          route_points: run.route_points,
          total_distance_meters: run.total_distance_meters,
          duration_seconds: run.duration_seconds,
          ...sourceMetadata,
        });
      }
    });

    return unsub;
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
            {/* SubscriptionReconciler: destrava Pro app-wide durante a geração do plano */}
            <SubscriptionReconciler />
            {/* NotificationManager is safe to use here because it uses navigationRef */}
            <NotificationManager />
            {/* WatchSyncManager: pushes today's workout + user name to Apple Watch */}
            <WatchSyncManager />
            {/* GarminSyncManager: pushes today's workout to Garmin watch via Connect IQ */}
            <GarminSyncManager />
            {/* NetworkRetryManager: retries pending workouts/free runs when network comes back */}
            <NetworkRetryManager />
            <AppNavigator />
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
