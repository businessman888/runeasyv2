import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation';
import { useNotifications } from './src/hooks/useNotifications';
import Mapbox from '@rnmapbox/maps';
import { SuperwallProvider } from 'expo-superwall';
import { SuperwallBridge } from './src/components/paywall/SuperwallBridge';
import { initializeRevenueCat, getSuperwallApiKey } from './src/services/paywall';
import { initSubscriptionListener } from './src/stores/authStore';

// Registra Task de Rastreamento (Background GPS)
import './src/tasks/locationTask';

// Inicializa o token de acesso runtime do Mapbox.
// Deve ser chamado antes de qualquer componente MapView ser renderizado.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '');


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
  // Inicializa RevenueCat e subscription listener uma vez
  useEffect(() => {
    initializeRevenueCat();
    const removeListener = initSubscriptionListener();
    return () => removeListener();
  }, []);

  const superwallApiKey = getSuperwallApiKey();

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <SuperwallProvider
          apiKeys={{
            ios: superwallApiKey,
            android: superwallApiKey,
          }}
          options={__DEV__ ? { logging: { level: 'debug' } } : undefined}
        >
          <GestureHandlerRootView style={styles.container}>
            <StatusBar style="light" translucent backgroundColor="transparent" />
            {/* Bridge que conecta Superwall hooks ao authStore */}
            <SuperwallBridge />
            {/* NotificationManager is safe to use here because it uses navigationRef */}
            <NotificationManager />
            <AppNavigator />
          </GestureHandlerRootView>
        </SuperwallProvider>
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
