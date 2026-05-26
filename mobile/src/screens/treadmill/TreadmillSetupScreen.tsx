/**
 * Treadmill setup — scan/connect FTMS or fall back to manual mode.
 *
 * Routed from the RunEnvironmentModal when the user picks "Na esteira".
 * Forwards the original run params (workoutId, mode, target pace/distance,
 * etc.) through to the Running screen with `environment='treadmill'`.
 *
 * Figma node 1315-1642.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTreadmillStore, BluetoothState } from '../../stores/treadmillStore';
import type { TreadmillDevice } from '../../services/treadmillService';
import { MANUAL_TREADMILL_SPEED } from '../../constants/bluetooth';
import {
  colors,
  spacing,
  borderRadius,
  typography,
  fonts,
} from '../../theme';

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
      return 'Permissão de Bluetooth negada. Habilite nas configurações para usar a esteira.';
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
    // `Linking.openSettings()` opens the iOS Settings page for this specific
    // app (which lists Bluetooth + Location together) and the Android app
    // settings page. The legacy `App-Prefs:Bluetooth` URL scheme is no
    // longer accepted by App Review on iOS and can cause rejection.
    Linking.openSettings();
  }, []);

  const isReadyToStart = isConnected || usingManual;
  const headerLabel = isConnected
    ? 'Esteira conectada'
    : usingManual
      ? 'Modo manual'
      : 'Procurando esteira';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => {
            stopScan();
            navigation.goBack();
          }}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Treino em esteira</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>{headerLabel}</Text>

        {bluetoothMsg && !isConnected ? (
          <View style={styles.warningCard}>
            <Ionicons
              name="warning"
              size={22}
              color={colors.warning}
              style={{ marginRight: spacing.sm }}
            />
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
          <View style={styles.devicesSection}>
            {isScanning ? (
              <View style={styles.scanningRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.scanningText}>
                  Procurando esteiras próximas…
                </Text>
              </View>
            ) : foundDevices.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="bluetooth"
                  size={40}
                  color={colors.textSecondary}
                />
                <Text style={styles.emptyTitle}>Nenhuma esteira encontrada</Text>
                <Text style={styles.emptySubtitle}>
                  Verifique se a esteira está ligada e com o Bluetooth ativo, ou
                  siga em modo manual.
                </Text>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => startScan()}
                  accessibilityRole="button"
                  accessibilityLabel="Procurar novamente"
                >
                  <Ionicons
                    name="refresh"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.secondaryBtnText}>Procurar novamente</Text>
                </Pressable>
              </View>
            ) : (
              foundDevices.map((device) => (
                <Pressable
                  key={device.id}
                  style={styles.deviceRow}
                  onPress={() => handleConnect(device)}
                  disabled={isConnecting}
                  accessibilityRole="button"
                  accessibilityLabel={`Conectar a ${device.name}`}
                >
                  <View style={styles.deviceLeft}>
                    <Ionicons
                      name="hardware-chip"
                      size={22}
                      color={colors.primary}
                      style={{ marginRight: spacing.sm }}
                    />
                    <View style={{ flexShrink: 1 }}>
                      <Text style={styles.deviceName} numberOfLines={1}>
                        {device.name}
                      </Text>
                      <Text style={styles.deviceMeta}>
                        Sinal {signalBars(device.rssi)}/4
                      </Text>
                    </View>
                  </View>
                  {isConnecting ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={colors.textSecondary}
                    />
                  )}
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        {connectionError ? (
          <Text style={styles.errorText}>
            Falha ao conectar: {connectionError}
          </Text>
        ) : null}

        {isConnected && connectedDevice ? (
          <View style={styles.connectedCard}>
            <Ionicons
              name="checkmark-circle"
              size={28}
              color={colors.success}
            />
            <Text style={styles.connectedTitle}>{connectedDevice.name}</Text>
            <Text style={styles.connectedSubtitle}>
              {connectedDevice.supportsControl
                ? 'Esteira Smart — leitura completa de dados FTMS.'
                : 'Esteira FTMS — leitura de velocidade, distância e inclinação.'}
            </Text>
            <Pressable
              onPress={() => disconnect()}
              style={styles.linkBtn}
              accessibilityRole="button"
              accessibilityLabel="Desconectar"
            >
              <Text style={styles.linkBtnText}>Desconectar</Text>
            </Pressable>
          </View>
        ) : null}

        {usingManual && !isConnected ? (
          <View style={styles.manualCard}>
            <Text style={styles.manualTitle}>Velocidade inicial</Text>
            <Text style={styles.manualSubtitle}>
              Ajuste para o ritmo que você vai começar. Você pode mudar durante
              o treino.
            </Text>
            <View style={styles.manualRow}>
              <Pressable
                style={styles.manualBtn}
                onPress={() => bumpManualSpeed(-MANUAL_TREADMILL_SPEED.STEP_LARGE)}
                accessibilityRole="button"
                accessibilityLabel="Diminuir 1 km/h"
              >
                <Ionicons name="remove" size={22} color={colors.white} />
              </Pressable>
              <View style={styles.manualValueBox}>
                <Text style={styles.manualValue}>
                  {manualSpeed.toFixed(1)}
                </Text>
                <Text style={styles.manualUnit}>km/h</Text>
              </View>
              <Pressable
                style={styles.manualBtn}
                onPress={() => bumpManualSpeed(MANUAL_TREADMILL_SPEED.STEP_LARGE)}
                accessibilityRole="button"
                accessibilityLabel="Aumentar 1 km/h"
              >
                <Ionicons name="add" size={22} color={colors.white} />
              </Pressable>
            </View>
            <View style={styles.fineRow}>
              <Pressable
                style={styles.fineBtn}
                onPress={() => bumpManualSpeed(-MANUAL_TREADMILL_SPEED.STEP_SMALL)}
                accessibilityRole="button"
                accessibilityLabel="Diminuir 0,1 km/h"
              >
                <Text style={styles.fineBtnText}>−0.1</Text>
              </Pressable>
              <Pressable
                style={styles.fineBtn}
                onPress={() => setManualSpeed(MANUAL_TREADMILL_SPEED.DEFAULT)}
                accessibilityRole="button"
                accessibilityLabel="Resetar para padrão"
              >
                <Text style={styles.fineBtnText}>Resetar</Text>
              </Pressable>
              <Pressable
                style={styles.fineBtn}
                onPress={() => bumpManualSpeed(MANUAL_TREADMILL_SPEED.STEP_SMALL)}
                accessibilityRole="button"
                accessibilityLabel="Aumentar 0,1 km/h"
              >
                <Text style={styles.fineBtnText}>+0.1</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {!isReadyToStart ? (
          <Pressable
            onPress={handleSwitchToManual}
            style={styles.outlinedBtn}
            accessibilityRole="button"
            accessibilityLabel="Continuar sem conexão"
          >
            <Text style={styles.outlinedBtnText}>
              Continuar sem conexão
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleStart}
          style={[styles.primaryBtn, !isReadyToStart && styles.primaryBtnDisabled]}
          disabled={!isReadyToStart}
          accessibilityRole="button"
          accessibilityLabel="Iniciar treino na esteira"
          accessibilityState={{ disabled: !isReadyToStart }}
        >
          <Ionicons
            name="play"
            size={20}
            color={colors.background}
            style={{ marginRight: spacing.sm }}
          />
          <Text style={styles.primaryBtnText}>Iniciar treino</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.white,
    fontFamily: fonts.semibold,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.fontSizes.sm,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(255, 196, 0, 0.10)',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  warningText: {
    flex: 1,
    color: colors.textLight,
    fontSize: typography.fontSizes.md,
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
  },
  warningCta: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.warning,
  },
  warningCtaText: {
    color: colors.background,
    fontFamily: fonts.semibold,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  devicesSection: {
    marginBottom: spacing.lg,
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.base,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    minHeight: 64,
    marginBottom: spacing.sm,
  },
  scanningText: {
    color: colors.textLight,
    fontSize: typography.fontSizes.md,
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.white,
    fontFamily: fonts.semibold,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
    marginBottom: spacing.sm,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderColor: colors.primary,
    borderWidth: 1,
    minHeight: 44,
  },
  secondaryBtnText: {
    color: colors.primary,
    fontFamily: fonts.semibold,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    minHeight: 64,
    marginBottom: spacing.sm,
  },
  deviceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceName: {
    color: colors.white,
    fontFamily: fonts.semibold,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  deviceMeta: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    marginTop: 2,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSizes.sm,
    marginBottom: spacing.sm,
  },
  connectedCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.30)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  connectedTitle: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    marginTop: spacing.sm,
  },
  connectedSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
  },
  linkBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  linkBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    textDecorationLine: 'underline',
  },
  manualCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  manualTitle: {
    color: colors.white,
    fontFamily: fonts.semibold,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  manualSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: spacing.xs,
    marginBottom: spacing.base,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.base,
  },
  manualBtn: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualValueBox: {
    flex: 1,
    alignItems: 'center',
  },
  manualValue: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 44,
    fontWeight: typography.fontWeights.bold,
  },
  manualUnit: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.md,
    marginTop: -4,
  },
  fineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fineBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fineBtnText: {
    color: colors.textLight,
    fontFamily: fonts.medium,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  outlinedBtn: {
    minHeight: 50,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlinedBtnText: {
    color: colors.textLight,
    fontFamily: fonts.medium,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
  },
  primaryBtn: {
    minHeight: 54,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnText: {
    color: colors.background,
    fontFamily: fonts.bold,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
});

export default TreadmillSetupScreen;
