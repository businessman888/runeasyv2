/**
 * Treadmill setup — scan/connect FTMS or fall back to manual mode.
 *
 * Routed from the RunEnvironmentModal when the user picks "Na esteira".
 * Forwards the original run params (workoutId, mode, target pace/distance,
 * etc.) through to the Running screen with `environment='treadmill'`.
 *
 * Visual: Figma node 1315-1642 + premium polish — animated radar pulse
 * during scan, glow-cyan manual speed card, no generic AI-grey cards.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withDelay,
  cancelAnimation,
} from 'react-native-reanimated';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTreadmillStore, BluetoothState } from '../../stores/treadmillStore';
import type { TreadmillDevice } from '../../services/treadmillService';
import { MANUAL_TREADMILL_SPEED } from '../../constants/bluetooth';
import { fonts } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

// ─── Visual tokens (Figma-aligned + brand neon) ───────────────────────────────
const T = {
  bg: semanticColors.canvas,
  bgGradient: semanticColors.surface1,
  card: semanticColors.surface2,
  cardTranslucent: semanticColors.surface2,
  cardElevated: semanticColors.surface1,
  cardBorderSubtle: semanticColors.borderSubtle,
  cardBorderNeon: semanticColors.borderSubtle,
  cardBorderNeonStrong: semanticColors.borderStrong,
  cyan: semanticColors.accent,
  cyanGlow: semanticColors.accentSubtle,
  textPrimary: semanticColors.textPrimary,
  textSecondary: semanticColors.textSecondary,
  textMuted: semanticColors.textTertiary,
  divider: semanticColors.borderSubtle,
  success: '#10B981',
  warning: '#FFC400',
  warningBg: semanticColors.warningSubtle,
  warningBorder: 'rgba(255, 196, 0, 0.4)',
  danger: '#FF453A',
};

type SetupRouteParams = {
  TreadmillSetup: {
    runParams: {
      workoutId?: string;
      dayLabel?: string;
      title?: string;
      workoutBlocks?: any[];
      mode: 'planned' | 'manual' | 'free';
      targetPaceSeconds?: number;
      targetDistanceKm?: number;
    };
  };
};

function signalBars(rssi: number): number {
  if (rssi >= -55) return 4;
  if (rssi >= -67) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

function bluetoothStateMessage(state: BluetoothState): string | null {
  switch (state) {
    case 'off':
      return 'O Bluetooth está desligado. Ligue para conectar sua esteira.';
    case 'unauthorized':
      return 'Permissão de Bluetooth negada. Habilite nas configurações.';
    case 'unsupported':
      return 'Este dispositivo não suporta Bluetooth.';
    default:
      return null;
  }
}

export function TreadmillSetupScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<SetupRouteParams, 'TreadmillSetup'>>();
  const runParams = route.params.runParams;
  const insets = useSafeAreaInsets();

  const isScanning = useTreadmillStore((s) => s.isScanning);
  const foundDevices = useTreadmillStore((s) => s.foundDevices);
  const isConnecting = useTreadmillStore((s) => s.isConnecting);
  const isConnected = useTreadmillStore((s) => s.isConnected);
  const connectedDevice = useTreadmillStore((s) => s.connectedDevice);
  const connectionError = useTreadmillStore((s) => s.connectionError);
  const bluetoothState = useTreadmillStore((s) => s.bluetoothState);
  const manualSpeed = useTreadmillStore((s) => s.manualSpeedKmh);
  const startScan = useTreadmillStore((s) => s.startScan);
  const stopScan = useTreadmillStore((s) => s.stopScan);
  const connectDevice = useTreadmillStore((s) => s.connectDevice);
  const refreshBluetoothState = useTreadmillStore((s) => s.refreshBluetoothState);
  const setMode = useTreadmillStore((s) => s.setMode);
  const setManualSpeed = useTreadmillStore((s) => s.setManualSpeed);
  const disconnect = useTreadmillStore((s) => s.disconnect);
  const bumpManualSpeed = useTreadmillStore((s) => s.bumpManualSpeed);

  const [usingManual, setUsingManual] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshBluetoothState();
      if (!cancelled) {
        startScan();
      }
    })();
    return () => {
      cancelled = true;
      stopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bluetoothMsg = bluetoothStateMessage(bluetoothState);

  const handleConnect = useCallback(
    async (device: TreadmillDevice) => {
      const ok = await connectDevice(device);
      if (!ok) {
        Alert.alert(
          'Não foi possível conectar',
          'A esteira recusou a conexão. Tente novamente ou siga em modo manual.',
        );
      }
    },
    [connectDevice],
  );

  const handleSwitchToManual = useCallback(() => {
    stopScan();
    setMode('manual');
    setUsingManual(true);
  }, [stopScan, setMode]);

  const handleStart = useCallback(() => {
    (navigation as any).replace('Running', {
      ...runParams,
      environment: 'treadmill',
    });
  }, [navigation, runParams]);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  const isReadyToStart = isConnected || usingManual;

  // ── Header status label (drives subtitle below the title) ──────────────
  const statusLabel = isConnected
    ? 'Esteira conectada'
    : isConnecting
      ? 'Conectando…'
      : usingManual
        ? 'Modo manual ativo'
        : isScanning
          ? 'Procurando esteira'
          : foundDevices.length > 0
            ? 'Esteiras encontradas'
            : 'Nenhuma esteira encontrada';

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeTop} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => {
              stopScan();
              navigation.goBack();
            }}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={24} color={T.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} allowFontScaling={false}>
              Treino em esteira
            </Text>
          </View>
          <View style={styles.iconBtn} />
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 180 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.statusOverline} allowFontScaling={false}>
          {statusLabel.toUpperCase()}
        </Text>

        {bluetoothMsg && !isConnected ? (
          <View style={styles.warningCard}>
            <View style={styles.warningIconWrap}>
              <Ionicons name="warning" size={20} color={T.warning} />
            </View>
            <Text style={styles.warningText}>{bluetoothMsg}</Text>
            {bluetoothState === 'off' || bluetoothState === 'unauthorized' ? (
              <Pressable
                onPress={handleOpenSettings}
                style={styles.warningCta}
                accessibilityRole="button"
                accessibilityLabel="Abrir configurações"
              >
                <Text style={styles.warningCtaText}>Abrir configurações</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!usingManual && !isConnected ? (
          isScanning ? (
            <RadarScanning />
          ) : foundDevices.length === 0 ? (
            <EmptyState onRetry={() => startScan()} />
          ) : (
            <>
              <Text style={styles.devicesHeader} allowFontScaling={false}>
                Lista de esteiras encontradas
              </Text>
              <View style={styles.devicesDivider} />
              <View style={styles.devicesList}>
                {foundDevices.map((device) => (
                  <DeviceRow
                    key={device.id}
                    device={device}
                    loading={isConnecting}
                    onPress={() => handleConnect(device)}
                  />
                ))}
              </View>
            </>
          )
        ) : null}

        {connectionError ? (
          <Text style={styles.errorText} allowFontScaling={false}>
            Falha ao conectar: {connectionError}
          </Text>
        ) : null}

        {isConnected && connectedDevice ? (
          <ConnectedCard
            device={connectedDevice}
            onDisconnect={() => disconnect()}
          />
        ) : null}

        {usingManual && !isConnected ? (
          <ManualSpeedCard
            value={manualSpeed}
            onIncrement={() => bumpManualSpeed(MANUAL_TREADMILL_SPEED.STEP_LARGE)}
            onDecrement={() => bumpManualSpeed(-MANUAL_TREADMILL_SPEED.STEP_LARGE)}
            onIncrementFine={() =>
              bumpManualSpeed(MANUAL_TREADMILL_SPEED.STEP_SMALL)
            }
            onDecrementFine={() =>
              bumpManualSpeed(-MANUAL_TREADMILL_SPEED.STEP_SMALL)
            }
            onReset={() => setManualSpeed(MANUAL_TREADMILL_SPEED.DEFAULT)}
          />
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {!isReadyToStart ? (
          <Pressable
            onPress={handleSwitchToManual}
            style={styles.secondaryBtn}
            accessibilityRole="button"
            accessibilityLabel="Continuar sem conexão"
          >
            <Text style={styles.secondaryBtnText}>Continuar sem conexão</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleStart}
          style={[styles.primaryBtn, !isReadyToStart && styles.primaryBtnDisabled]}
          disabled={!isReadyToStart}
          accessibilityRole="button"
          accessibilityLabel="Iniciar treino"
          accessibilityState={{ disabled: !isReadyToStart }}
        >
          <Ionicons
            name="play"
            size={20}
            color={T.bg}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.primaryBtnText} allowFontScaling={false}>
            Iniciar treino
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ───────────────────────── Sub-components ──────────────────────────────── */

/**
 * Animated radar pulse — three concentric rings expanding outward in a
 * staggered loop, anchored by a glowing bluetooth icon. Communicates
 * "actively scanning" much better than a generic spinner does.
 */
const RadarScanning = React.memo(function RadarScanning() {
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);
  const p3 = useSharedValue(0);

  useEffect(() => {
    const config = { duration: 2400, easing: Easing.out(Easing.quad) };
    p1.value = withRepeat(withTiming(1, config), -1, false);
    p2.value = withDelay(800, withRepeat(withTiming(1, config), -1, false));
    p3.value = withDelay(1600, withRepeat(withTiming(1, config), -1, false));
    return () => {
      cancelAnimation(p1);
      cancelAnimation(p2);
      cancelAnimation(p3);
    };
  }, [p1, p2, p3]);

  const ring1Style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - p1.value),
    transform: [{ scale: 0.5 + p1.value * 1.6 }],
  }));
  const ring2Style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - p2.value),
    transform: [{ scale: 0.5 + p2.value * 1.6 }],
  }));
  const ring3Style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - p3.value),
    transform: [{ scale: 0.5 + p3.value * 1.6 }],
  }));

  return (
    <View style={styles.radarCard}>
      <View style={styles.radarStage}>
        <Animated.View style={[styles.radarRing, ring1Style]} />
        <Animated.View style={[styles.radarRing, ring2Style]} />
        <Animated.View style={[styles.radarRing, ring3Style]} />
        <View style={styles.radarCore}>
          <Ionicons name="bluetooth" size={28} color={T.cyan} />
        </View>
      </View>
      <Text style={styles.radarTitle} allowFontScaling={false}>
        Procurando esteiras
      </Text>
      <Text style={styles.radarSubtitle} allowFontScaling={false}>
        Mantenha o celular próximo da esteira. Só pegamos modelos compatíveis com
        Bluetooth FTMS.
      </Text>
    </View>
  );
});

const EmptyState = React.memo(function EmptyState({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="bluetooth-outline" size={32} color={T.textSecondary} />
      </View>
      <Text style={styles.emptyTitle} allowFontScaling={false}>
        Nenhuma esteira encontrada
      </Text>
      <Text style={styles.emptySubtitle}>
        Verifique se a esteira está ligada com Bluetooth ativo, ou siga em modo
        manual.
      </Text>
      <Pressable
        style={styles.retryBtn}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Procurar novamente"
      >
        <Ionicons name="refresh" size={16} color={T.cyan} />
        <Text style={styles.retryBtnText}>Procurar novamente</Text>
      </Pressable>
    </View>
  );
});

const DeviceRow = React.memo(function DeviceRow({
  device,
  loading,
  onPress,
}: {
  device: TreadmillDevice;
  loading: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const bars = signalBars(device.rssi);
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 20, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 20, stiffness: 320 });
      }}
      accessibilityRole="button"
      accessibilityLabel={`Conectar a ${device.name}`}
    >
      <Animated.View style={[styles.deviceRow, animStyle]}>
        <Text style={styles.deviceName} numberOfLines={1} allowFontScaling={false}>
          {device.name}
        </Text>
        <View style={styles.deviceRight}>
          {loading ? (
            <ActivityIndicator size="small" color={T.cyan} />
          ) : (
            <SignalBars bars={bars} />
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
});

/**
 * 4-bar signal indicator that picks its color from signal strength.
 * Matches Figma 1315-1642 where weak signals are amber, mid are cyan,
 * strong are green — gives the user immediate "should I move closer?"
 * feedback without a textual label.
 */
const SignalBars = React.memo(function SignalBars({ bars }: { bars: number }) {
  const color = bars >= 4 ? T.success : bars >= 3 ? T.cyan : T.warning;
  return (
    <View style={styles.signalRow}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            styles.signalBar,
            { height: 5 + i * 3 },
            i <= bars
              ? { backgroundColor: color }
              : styles.signalBarInactive,
          ]}
        />
      ))}
    </View>
  );
});

const ConnectedCard = React.memo(function ConnectedCard({
  device,
  onDisconnect,
}: {
  device: TreadmillDevice;
  onDisconnect: () => void;
}) {
  return (
    <View style={styles.connectedCard}>
      <View style={styles.connectedCheck}>
        <Ionicons name="checkmark" size={28} color={T.bg} />
      </View>
      <Text style={styles.connectedTitle} allowFontScaling={false}>
        {device.name}
      </Text>
      <Text style={styles.connectedSubtitle}>
        {device.supportsControl
          ? 'Esteira Smart — leitura completa de dados FTMS.'
          : 'Esteira FTMS — velocidade, distância e inclinação em tempo real.'}
      </Text>
      <Pressable
        onPress={onDisconnect}
        style={styles.disconnectBtn}
        accessibilityRole="button"
        accessibilityLabel="Desconectar"
        hitSlop={8}
      >
        <Text style={styles.disconnectText}>Desconectar</Text>
      </Pressable>
    </View>
  );
});

const ManualSpeedCard = React.memo(function ManualSpeedCard({
  value,
  onIncrement,
  onDecrement,
  onIncrementFine,
  onDecrementFine,
  onReset,
}: {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onIncrementFine: () => void;
  onDecrementFine: () => void;
  onReset: () => void;
}) {
  return (
    <View style={styles.manualCard}>
      <Text style={styles.manualTitle} allowFontScaling={false}>
        Velocidade inicial
      </Text>
      <Text style={styles.manualHelp}>
        Ajuste para o ritmo que você vai começar. Você pode mudar durante o
        treino.
      </Text>

      <View style={styles.speedRow}>
        <SpeedRoundBtn
          icon="remove"
          onPress={onDecrement}
          accessibilityLabel="Diminuir 1 km/h"
        />
        <View style={styles.speedValueWrap}>
          <Text style={styles.speedValue} allowFontScaling={false}>
            {value.toFixed(1)}
          </Text>
          <Text style={styles.speedUnit} allowFontScaling={false}>
            km/h
          </Text>
        </View>
        <SpeedRoundBtn
          icon="add"
          onPress={onIncrement}
          accessibilityLabel="Aumentar 1 km/h"
        />
      </View>

      <View style={styles.fineRow}>
        <FineBtn
          label="−0.1"
          onPress={onDecrementFine}
          accessibilityLabel="Diminuir 0,1 km/h"
        />
        <FineBtn
          label="Resetar"
          onPress={onReset}
          accessibilityLabel="Resetar para padrão"
        />
        <FineBtn
          label="+0.1"
          onPress={onIncrementFine}
          accessibilityLabel="Aumentar 0,1 km/h"
        />
      </View>
    </View>
  );
});

const SpeedRoundBtn = React.memo(function SpeedRoundBtn({
  icon,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.9, { damping: 18, stiffness: 360 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 360 });
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[styles.speedBtn, style]}>
        <Ionicons name={icon} size={26} color={T.cyan} />
      </Animated.View>
    </Pressable>
  );
});

const FineBtn = React.memo(function FineBtn({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.95, { damping: 20, stiffness: 360 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 20, stiffness: 360 });
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ flex: 1 }}
    >
      <Animated.View style={[styles.fineBtn, style]}>
        <Text style={styles.fineBtnText} allowFontScaling={false}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

/* ───────────────────────────── Styles ──────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
  },
  safeTop: {
    backgroundColor: T.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 56,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: T.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  statusOverline: {
    color: T.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: 14,
  },

  // Warning card
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: T.warningBg,
    borderColor: T.warningBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
    gap: 10,
  },
  warningIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: semanticColors.warningSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningText: {
    flex: 1,
    color: T.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  warningCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: T.warning,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  warningCtaText: {
    color: T.bg,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
  },

  // Radar scanning
  radarCard: {
    alignItems: 'center',
    backgroundColor: T.card,
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.cardBorderSubtle,
    overflow: 'hidden',
  },
  radarStage: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  radarRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: T.cyan,
  },
  radarCore: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: semanticColors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: T.cyan,
    shadowColor: T.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 12,
  },
  radarTitle: {
    color: T.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  radarSubtitle: {
    color: T.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    backgroundColor: T.card,
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.cardBorderSubtle,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: semanticColors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    color: T.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: T.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
    maxWidth: 280,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderColor: T.cyan,
    borderWidth: 1,
    minHeight: 44,
  },
  retryBtnText: {
    color: T.cyan,
    fontFamily: fonts.semibold,
    fontSize: 14,
    fontWeight: '600',
  },

  // Devices header (Figma)
  devicesHeader: {
    color: T.cyan,
    fontFamily: fonts.bold,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  devicesDivider: {
    height: 1,
    backgroundColor: T.cardBorderSubtle,
    marginBottom: 14,
  },
  // Device list
  devicesList: {
    gap: 10,
    marginBottom: 12,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.card,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: T.cardBorderSubtle,
    minHeight: 78,
  },
  deviceName: {
    flex: 1,
    color: T.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 17,
    fontWeight: '700',
    marginRight: 12,
  },
  deviceRight: {
    minWidth: 30,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  signalBar: {
    width: 4,
    borderRadius: 1,
  },
  signalBarInactive: {
    backgroundColor: semanticColors.borderStrong,
  },

  // Connected card
  connectedCard: {
    alignItems: 'center',
    backgroundColor: T.card,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.30)',
  },
  connectedCheck: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: T.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: T.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 10,
  },
  connectedTitle: {
    color: T.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  connectedSubtitle: {
    color: T.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
  disconnectBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  disconnectText: {
    color: T.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
    textDecorationLine: 'underline',
  },

  // Manual speed card — clean, no neon glow, just a subtle card with cyan
  // accents on the number and round buttons.
  manualCard: {
    backgroundColor: T.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.cardBorderSubtle,
  },
  manualTitle: {
    color: T.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  manualHelp: {
    color: T.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 22,
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  speedBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: T.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedValueWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedValue: {
    color: T.cyan,
    fontFamily: fonts.bold,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 50,
  },
  speedUnit: {
    color: T.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginTop: -2,
  },
  fineRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fineBtn: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: T.bg,
    borderWidth: 1,
    borderColor: T.cardBorderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fineBtnText: {
    color: T.textPrimary,
    fontFamily: fonts.medium,
    fontSize: 13,
    fontWeight: '500',
  },

  errorText: {
    color: T.danger,
    fontFamily: fonts.medium,
    fontSize: 13,
    marginBottom: 10,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
    backgroundColor: T.bg,
    borderTopWidth: 1,
    borderTopColor: T.cardBorderSubtle,
  },
  secondaryBtn: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.cardBorderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: T.textPrimary,
    fontFamily: fonts.medium,
    fontSize: 14,
    fontWeight: '500',
  },
  primaryBtn: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: T.cyan,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
  },
  primaryBtnText: {
    color: T.bg,
    fontFamily: fonts.bold,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default TreadmillSetupScreen;
