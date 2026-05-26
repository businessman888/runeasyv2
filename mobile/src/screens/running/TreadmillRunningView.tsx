/**
 * Treadmill counterpart to the outdoor RunningScreen. Renders the same
 * "iniciar / pausar / finalizar" UX, but without Mapbox and with FTMS or
 * manual telemetry instead of GPS-derived metrics.
 *
 * Mounted inline by RunningScreen when `route.params.environment === 'treadmill'`,
 * so all four "Iniciar Treino" entry points work transparently.
 *
 * Figma node 1313-1529.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTreadmillTracking } from '../../hooks/useTreadmillTracking';
import {
  useTreadmillStore,
  useTrainingStore,
} from '../../stores';
import { MANUAL_TREADMILL_SPEED } from '../../constants/bluetooth';

const T = {
  bgPrimary: '#0E0E1F',
  cardSurface: '#1C1C2E',
  cyan: '#00D4FF',
  warning: '#FFC400',
  textPrimary: '#EBEBF5',
  textSecondary: 'rgba(235, 235, 245, 0.60)',
  border: 'rgba(235,235,245,0.10)',
};

interface Props {
  workoutId?: string;
  dayLabel?: string;
  title?: string;
  mode: 'planned' | 'manual' | 'free';
  targetPaceSeconds?: number;
  targetDistanceKm?: number;
}

export function TreadmillRunningView({
  workoutId,
  dayLabel,
  title,
  mode,
  targetPaceSeconds,
  targetDistanceKm,
}: Props) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [isFinishing, setIsFinishing] = useState(false);

  const treadmillMode = useTreadmillStore((s) => s.mode);
  const manualSpeed = useTreadmillStore((s) => s.manualSpeedKmh);
  const bumpManualSpeed = useTreadmillStore((s) => s.bumpManualSpeed);
  const isConnected = useTreadmillStore((s) => s.isConnected);
  const connectedDevice = useTreadmillStore((s) => s.connectedDevice);
  const resetTreadmillStore = useTreadmillStore((s) => s.reset);
  const unexpectedDisconnect = useTreadmillStore((s) => s.unexpectedDisconnect);
  const acknowledgeDisconnect = useTreadmillStore((s) => s.acknowledgeDisconnect);

  const {
    sessionState,
    distance,
    timeMs,
    currentPace,
    formattedTime,
    currentSpeedKmh,
    currentInclinePercent,
    heartRate,
    calories,
    startResumeTracking,
    pauseTracking,
    finishTracking,
    clearTracking,
  } = useTreadmillTracking(treadmillMode);

  const completeWorkout = useTrainingStore((s) => s.completeWorkout);
  const completeFreeRun = useTrainingStore((s) => s.completeFreeRun);

  const isCalculating = sessionState === 'calculating';
  const isTraining = sessionState === 'training';
  const isPaused = sessionState === 'paused';

  const handleFinish = useCallback(async () => {
    setIsFinishing(true);
    let tracking: Awaited<ReturnType<typeof finishTracking>>;
    try {
      tracking = await finishTracking();
    } catch (error) {
      console.error('[TreadmillRunningView] finishTracking erro:', error);
      Alert.alert(
        'Erro ao finalizar',
        'Não foi possível capturar os dados da esteira. Tente novamente.',
        [{ text: 'OK' }],
      );
      setIsFinishing(false);
      return;
    }

    const startedAtIso = new Date(Date.now() - tracking.timeMs).toISOString();
    const durationSec = Math.round(tracking.timeMs / 1000);
    const avgPaceSec =
      tracking.distance > 0
        ? Math.round(durationSec / (tracking.distance / 1000))
        : undefined;

    let savedLocally = false;
    let resolvedWorkoutId: string | undefined = workoutId;
    try {
      if (mode === 'free') {
        const result = await completeFreeRun({
          localId: `free_${Date.now()}`,
          route_points: [],
          total_distance_meters: tracking.distance,
          duration_seconds: durationSec,
          started_at: startedAtIso,
          environment: 'treadmill',
          treadmill_data: tracking.treadmillData,
          average_heartrate: tracking.heartRateAvg ?? undefined,
          max_heartrate: tracking.heartRateMax ?? undefined,
          calories: tracking.treadmillData.total_calories,
          avg_pace_seconds_per_km: avgPaceSec,
        });
        savedLocally = result.savedLocally;
        if (result.workout?.id) resolvedWorkoutId = result.workout.id;
      } else {
        const result = await completeWorkout({
          workoutId: workoutId || `local_${Date.now()}`,
          route_points: [],
          total_distance_meters: tracking.distance,
          duration_seconds: durationSec,
          environment: 'treadmill',
          treadmill_data: tracking.treadmillData,
          average_heartrate: tracking.heartRateAvg ?? undefined,
          max_heartrate: tracking.heartRateMax ?? undefined,
          calories: tracking.treadmillData.total_calories,
          avg_pace_seconds_per_km: avgPaceSec,
        });
        savedLocally = result.savedLocally;
      }
    } catch (error) {
      console.error('[TreadmillRunningView] completeWorkout/free erro:', error);
      savedLocally = true;
    }

    try {
      clearTracking();
      resetTreadmillStore();
    } catch (e) {
      console.warn('[TreadmillRunningView] clearTracking warn:', e);
    }

    const summaryParams = {
      workoutId: resolvedWorkoutId || undefined,
      distance: tracking.distance,
      timeMs: tracking.timeMs,
      routePoints: [],
      routeCoordinates: [],
      savedLocally,
      mode,
      environment: 'treadmill' as const,
      treadmillData: tracking.treadmillData,
      targetPaceSeconds,
      targetDistanceKm,
      workoutTitle: title,
    };

    try {
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Main' as never, params: { initialTab: 'Home' } as never },
          { name: 'RunSummary' as never, params: summaryParams as never },
        ],
      });
    } catch {
      (navigation as any).navigate('RunSummary', summaryParams);
    } finally {
      setIsFinishing(false);
    }
  }, [
    finishTracking,
    workoutId,
    mode,
    title,
    targetPaceSeconds,
    targetDistanceKm,
    completeFreeRun,
    completeWorkout,
    clearTracking,
    resetTreadmillStore,
    navigation,
  ]);

  const deviceLabel = isConnected
    ? connectedDevice?.name ?? 'Esteira'
    : 'Modo Manual';

  const distanceFormatted = (distance / 1000).toFixed(2);
  const speedLabel = currentSpeedKmh.toFixed(1);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        <View style={styles.headerRow}>
          <Pressable
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={T.textPrimary} />
          </Pressable>

          <View style={styles.deviceCard}>
            <Ionicons
              name={isConnected ? 'bluetooth' : 'walk'}
              size={14}
              color={isConnected ? T.cyan : T.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.deviceText} numberOfLines={1}>
              {deviceLabel}
            </Text>
          </View>

          <View style={styles.backBtn} />
        </View>

        {mode !== 'free' && (title || dayLabel) ? (
          <View style={styles.workoutBanner}>
            {dayLabel ? (
              <Text style={styles.workoutDay}>{dayLabel}</Text>
            ) : null}
            {title ? (
              <Text style={styles.workoutTitle} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
          </View>
        ) : null}

        {unexpectedDisconnect ? (
          <Pressable
            style={styles.disconnectBanner}
            onPress={acknowledgeDisconnect}
            accessibilityRole="button"
            accessibilityLabel="Conexão perdida — toque para descartar aviso"
          >
            <Ionicons
              name="warning"
              size={16}
              color={T.warning}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.disconnectBannerText}>
              Conexão com a esteira perdida. Continuando em modo manual — ajuste
              a velocidade manualmente.
            </Text>
          </Pressable>
        ) : null}
      </SafeAreaView>

      <View style={styles.metricsArea}>
        <Text style={styles.timeLabel}>TEMPO</Text>
        <Text style={[styles.timeValue, isTraining && { color: T.cyan }]}>
          {formattedTime}
        </Text>

        <View style={styles.metricsGrid}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricBig}>{speedLabel}</Text>
            <Text style={styles.metricUnit}>km/h</Text>
            <Text style={styles.metricCaption}>Velocidade</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBlock}>
            <Text style={styles.metricBig}>{distanceFormatted}</Text>
            <Text style={styles.metricUnit}>km</Text>
            <Text style={styles.metricCaption}>Distância</Text>
          </View>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricMedium}>{currentPace}</Text>
            <Text style={styles.metricCaption}>Pace /km</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBlock}>
            <Text style={styles.metricMedium}>
              {treadmillMode === 'smart'
                ? `${currentInclinePercent.toFixed(1)}%`
                : 'Plano'}
            </Text>
            <Text style={styles.metricCaption}>Inclinação</Text>
          </View>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricMedium}>
              {heartRate != null ? `${heartRate}` : '--'}
            </Text>
            <Text style={styles.metricCaption}>FC bpm</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBlock}>
            <Text style={styles.metricMedium}>{Math.round(calories)}</Text>
            <Text style={styles.metricCaption}>Calorias</Text>
          </View>
        </View>

        {treadmillMode === 'manual' && (
          <View style={styles.manualControls}>
            <Text style={styles.manualLabel}>Ajustar velocidade</Text>
            <View style={styles.manualButtonsRow}>
              <ManualButton
                label="−1"
                onPress={() => bumpManualSpeed(-MANUAL_TREADMILL_SPEED.STEP_LARGE)}
                accessibilityLabel="Diminuir 1 km/h"
              />
              <ManualButton
                label="−0.1"
                onPress={() => bumpManualSpeed(-MANUAL_TREADMILL_SPEED.STEP_SMALL)}
                accessibilityLabel="Diminuir 0,1 km/h"
              />
              <Text style={styles.manualSpeedValue}>
                {manualSpeed.toFixed(1)} km/h
              </Text>
              <ManualButton
                label="+0.1"
                onPress={() => bumpManualSpeed(MANUAL_TREADMILL_SPEED.STEP_SMALL)}
                accessibilityLabel="Aumentar 0,1 km/h"
              />
              <ManualButton
                label="+1"
                onPress={() => bumpManualSpeed(MANUAL_TREADMILL_SPEED.STEP_LARGE)}
                accessibilityLabel="Aumentar 1 km/h"
              />
            </View>
          </View>
        )}
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        {isCalculating && (
          <Pressable
            style={[styles.ctaBtn, styles.ctaBtnOutline]}
            onPress={startResumeTracking}
            accessibilityRole="button"
            accessibilityLabel="Iniciar treino na esteira"
          >
            <Ionicons
              name="play"
              size={20}
              color={T.textPrimary}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.ctaText, { color: T.textPrimary }]}>
              Iniciar
            </Text>
          </Pressable>
        )}
        {isTraining && (
          <Pressable
            style={[styles.ctaBtn, styles.ctaBtnOutlineCyan]}
            onPress={pauseTracking}
            accessibilityRole="button"
            accessibilityLabel="Pausar treino"
          >
            <Ionicons
              name="pause"
              size={20}
              color={T.cyan}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.ctaText, { color: T.cyan }]}>Pausar</Text>
          </Pressable>
        )}
        {isPaused && (
          <>
            <Pressable
              style={[styles.ctaBtn, styles.ctaBtnOutlineCyan, { flex: 1 }]}
              onPress={startResumeTracking}
              disabled={isFinishing}
              accessibilityRole="button"
              accessibilityLabel="Continuar treino"
            >
              <Ionicons
                name="play"
                size={20}
                color={T.cyan}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.ctaText, { color: T.cyan }]}>Continuar</Text>
            </Pressable>
            <Pressable
              style={[
                styles.ctaBtn,
                styles.ctaBtnFilled,
                { flex: 1 },
                isFinishing && { opacity: 0.6 },
              ]}
              onPress={handleFinish}
              disabled={isFinishing}
              accessibilityRole="button"
              accessibilityLabel="Finalizar treino"
            >
              {isFinishing ? (
                <ActivityIndicator size="small" color={T.bgPrimary} />
              ) : (
                <>
                  <Ionicons
                    name="flag"
                    size={20}
                    color={T.bgPrimary}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.ctaText, { color: T.bgPrimary }]}>
                    Finalizar
                  </Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </View>

      {isFinishing && (
        <View style={styles.finishingOverlay}>
          <View style={styles.finishingCard}>
            <ActivityIndicator size="large" color={T.cyan} />
            <Text style={styles.finishingTitle}>Finalizando treino</Text>
            <Text style={styles.finishingSubtitle}>
              Calculando velocidade média, pace e splits…
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const ManualButton = React.memo(function ManualButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.manualBtn,
        pressed && styles.manualBtnPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={styles.manualBtnText}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bgPrimary },
  topOverlay: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceCard: {
    flex: 1,
    height: 44,
    backgroundColor: T.cardSurface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  deviceText: {
    color: T.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  workoutBanner: {
    marginTop: 4,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  disconnectBanner: {
    marginTop: 8,
    marginHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 196, 0, 0.10)',
    borderColor: T.warning,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disconnectBannerText: {
    flex: 1,
    color: T.textPrimary,
    fontSize: 12,
    lineHeight: 16,
  },
  workoutDay: {
    color: T.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  workoutTitle: {
    color: T.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  metricsArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  timeLabel: {
    color: T.textSecondary,
    fontSize: 11,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 16,
  },
  timeValue: {
    color: T.textPrimary,
    fontSize: 56,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
  },
  metricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.cardSurface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  metricBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricDivider: {
    width: 1,
    height: 40,
    backgroundColor: T.border,
  },
  metricBig: {
    color: T.textPrimary,
    fontSize: 28,
    fontWeight: '700',
  },
  metricMedium: {
    color: T.textPrimary,
    fontSize: 22,
    fontWeight: '600',
  },
  metricUnit: {
    color: T.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: -2,
  },
  metricCaption: {
    color: T.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  manualControls: {
    marginTop: 12,
    backgroundColor: T.cardSurface,
    borderRadius: 16,
    padding: 14,
  },
  manualLabel: {
    color: T.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.4,
  },
  manualButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  manualBtn: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualBtnPressed: {
    borderColor: T.cyan,
  },
  manualBtnText: {
    color: T.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  manualSpeedValue: {
    flex: 1,
    color: T.cyan,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
    backgroundColor: T.bgPrimary,
  },
  ctaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 20,
    paddingHorizontal: 20,
  },
  ctaBtnOutline: {
    backgroundColor: T.cardSurface,
    borderWidth: 1,
    borderColor: T.textPrimary,
  },
  ctaBtnOutlineCyan: {
    backgroundColor: T.cardSurface,
    borderWidth: 1,
    borderColor: T.cyan,
  },
  ctaBtnFilled: {
    backgroundColor: T.cyan,
    borderWidth: 1,
    borderColor: T.cyan,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
  },
  finishingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14, 14, 31, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    paddingHorizontal: 32,
  },
  finishingCard: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    padding: 28,
    borderRadius: 24,
    backgroundColor: T.cardSurface,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.20)',
  },
  finishingTitle: {
    color: T.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
    textAlign: 'center',
  },
  finishingSubtitle: {
    color: T.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
  },
});

export default TreadmillRunningView;
