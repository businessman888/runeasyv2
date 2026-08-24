/**
 * Treadmill counterpart to the outdoor RunningScreen. Same "iniciar /
 * pausar / finalizar" UX, but without Mapbox and with FTMS or manual
 * telemetry instead of GPS-derived metrics.
 *
 * Visual: pixel-faithful to Figma node 1313-1529. Flat layout, no metric
 * cards/tiles — just `label / big value` pairs in a 2-column grid. The
 * hero "Tempo" block uses HH:MM:SS always.
 */

import React, { useCallback, useEffect, useState } from 'react';
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
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);
import { useNavigation } from '@react-navigation/native';
import { useTreadmillTracking } from '../../hooks/useTreadmillTracking';
import { useTreadmillStore } from '../../stores';
import { MANUAL_TREADMILL_SPEED } from '../../constants/bluetooth';
import { useWorkoutGoals } from '../../hooks/useWorkoutGoals';
import { GoalsModal } from '../../components/GoalsModal';
import type { WorkoutBlockAPI } from '../../types/workoutGoals';
import { fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

const getLocalThemePalette1 = () => ({
  bg: semanticColors.canvas,
  cardSurface: semanticColors.surface2,
  cardBorder: semanticColors.borderSubtle,
  cyan: semanticColors.accent,
  textPrimary: semanticColors.textPrimary,
  textSecondary: semanticColors.textSecondary,
  textMuted: semanticColors.textTertiary,
  warning: '#FFC400',
  warningBg: semanticColors.warningSubtle,
  warningBorder: 'rgba(255, 196, 0, 0.4)',
});

// ─── Visual tokens (Figma-aligned) ────────────────────────────────────────────


interface Props {
  workoutId?: string;
  dayLabel?: string;
  title?: string;
  mode: 'planned' | 'manual' | 'free';
  targetPaceSeconds?: number;
  targetDistanceKm?: number;
  workoutBlocks?: WorkoutBlockAPI[];
}

export function TreadmillRunningView({
  workoutId,
  dayLabel,
  title,
  mode,
  targetPaceSeconds,
  targetDistanceKm,
  workoutBlocks,
}: Props) {
  useThemeSubscription();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [isFinishing, setIsFinishing] = useState(false);
  const [goalsModalVisible, setGoalsModalVisible] = useState(false);

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

  const isCalculating = sessionState === 'calculating';
  const isTraining = sessionState === 'training';
  const isPaused = sessionState === 'paused';

  // Goals system — mirrors OutdoorRunningView. Plan/manual workouts ship
  // `workoutBlocks` (warmup/main/cooldown segments with distance + pace
  // targets); the hook computes completion based on distance/timeMs/state
  // and exposes `hasGoals` so the button is hidden for free runs.
  const { goalSteps, allCompleted, hasGoals } = useWorkoutGoals({
    workoutBlocks,
    distance,
    timeMs,
    sessionState,
  });

  // Reactive backdrop gradient — only visible during an active session:
  //   - training   → cyan layer fades in
  //   - paused     → amber layer fades in (more saturated than idle)
  //   - calculating / finished → both layers stay at 0 (solid bg only)
  // Cross-fade is achieved by animating each layer's `opacity` independently
  // so they can blend if the session transitions between states quickly.
  const cyanOverlay = useSharedValue(isTraining ? 1 : 0);
  const amberOverlay = useSharedValue(isPaused ? 1 : 0);
  useEffect(() => {
    cyanOverlay.value = withTiming(isTraining ? 1 : 0, {
      duration: 500,
      easing: Easing.inOut(Easing.quad),
    });
    amberOverlay.value = withTiming(isPaused ? 1 : 0, {
      duration: 500,
      easing: Easing.inOut(Easing.quad),
    });
  }, [isTraining, isPaused, cyanOverlay, amberOverlay]);
  const cyanOverlayStyle = useAnimatedStyle(() => ({
    opacity: cyanOverlay.value,
  }));
  const amberOverlayStyle = useAnimatedStyle(() => ({
    opacity: amberOverlay.value,
  }));

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

    // Entrega o envio + roteamento à WorkoutProcessingScreen (mesmo fluxo do
    // outdoor). O cache de telemetria da esteira é persistido lá, após o
    // submit resolver o workoutId. Limpeza da sessão fica aqui, antes do
    // handoff, para não voltar ao tracking.
    const treadmillData = tracking.treadmillData;
    // Sem id real de plano/manual → degradar para free-run (nunca inventar um
    // id sintético que o backend rejeita). Ver RunningScreen para o racional.
    const degradeToFree = mode !== 'free' && !workoutId;
    const effectiveMode = degradeToFree ? 'free' : mode;
    const submit =
      mode === 'free' || degradeToFree
        ? {
            kind: 'free' as const,
            payload: {
              localId: `free_${Date.now()}`,
              route_points: [],
              total_distance_meters: tracking.distance,
              duration_seconds: durationSec,
              started_at: startedAtIso,
              environment: 'treadmill',
              treadmill_data: treadmillData,
              average_heartrate: tracking.heartRateAvg ?? undefined,
              max_heartrate: tracking.heartRateMax ?? undefined,
              calories: treadmillData.total_calories,
              avg_pace_seconds_per_km: avgPaceSec,
            },
            treadmillCache: treadmillData,
          }
        : {
            kind: 'workout' as const,
            payload: {
              workoutId: workoutId as string,
              route_points: [],
              total_distance_meters: tracking.distance,
              duration_seconds: durationSec,
              environment: 'treadmill',
              treadmill_data: treadmillData,
              average_heartrate: tracking.heartRateAvg ?? undefined,
              max_heartrate: tracking.heartRateMax ?? undefined,
              calories: treadmillData.total_calories,
              avg_pace_seconds_per_km: avgPaceSec,
            },
            treadmillCache: treadmillData,
          };

    try {
      clearTracking();
      resetTreadmillStore();
    } catch (e) {
      console.warn('[TreadmillRunningView] clearTracking warn:', e);
    }

    const summaryParams = {
      workoutId: workoutId || undefined,
      distance: tracking.distance,
      timeMs: tracking.timeMs,
      routePoints: [],
      routeCoordinates: [],
      mode: effectiveMode,
      environment: 'treadmill' as const,
      treadmillData,
      targetPaceSeconds,
      targetDistanceKm,
      workoutTitle: title,
    };

    try {
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Main' as never, params: { initialTab: 'Home' } as never },
          { name: 'WorkoutProcessing' as never, params: { mode: effectiveMode, submit, summaryParams } as never },
        ],
      });
    } catch {
      (navigation as any).navigate('WorkoutProcessing', { mode: effectiveMode, submit, summaryParams });
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
    clearTracking,
    resetTreadmillStore,
    navigation,
  ]);

  const isFreeMode = mode === 'free';
  const showWorkoutPill = !isFreeMode && (dayLabel || title);

  // Display strings — match Figma placeholders exactly.
  const speedStr = `${currentSpeedKmh.toFixed(1)} km/h`;
  const distanceStr = `${(distance / 1000).toFixed(2)} km`;
  const paceStr =
    currentSpeedKmh > 0 ? `${currentPace} /km` : '--:-- /km';
  const inclineStr =
    treadmillMode === 'smart'
      ? `${currentInclinePercent.toFixed(1)} %`
      : '0.0 %';
  const hrStr = heartRate != null ? `${heartRate} bpm` : '--:-- bpm';
  const caloriesStr = calories > 0 ? `${Math.round(calories)} cal` : '--:-- cal';

  return (
    <View style={styles.container}>
      {/* Reactive gradient overlays — opaque solid bg by default, fades in
          cyan during training and a vivid amber when paused. Calculating
          and finished states show no gradient (solid bg only). */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <AnimatedLinearGradient
          colors={[semanticColors.canvas, semanticColors.accentSubtle, semanticColors.canvas]}
          locations={[0, 0.5, 1]}
          style={[StyleSheet.absoluteFill, cyanOverlayStyle]}
        />
        <AnimatedLinearGradient
          colors={[semanticColors.canvas, semanticColors.warningSubtle, semanticColors.canvas]}
          locations={[0, 0.5, 1]}
          style={[StyleSheet.absoluteFill, amberOverlayStyle]}
        />
      </View>

      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.headerRow}>
          <Pressable
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={24} color={getLocalThemePalette1().textPrimary} />
          </Pressable>

          {showWorkoutPill ? (
            <View style={styles.workoutPill}>
              {dayLabel ? (
                <Text
                  style={styles.workoutPillDay}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {dayLabel}
                </Text>
              ) : null}
              {title ? (
                <Text
                  style={styles.workoutPillTitle}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {title}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.workoutPillFlex} />
          )}

          {/* Right slot:
                - plan/manual com metas → botão de metas (abre GoalsModal),
                  com check verde quando todas estão concluídas;
                - sem metas mas com pill → ícone neutro (mantém balanço
                  visual com o chevron à esquerda);
                - free sem pill → spacer pra equilibrar o flex. */}
          {hasGoals && !isFreeMode ? (
            <Pressable
              style={[
                styles.goalsBtn,
                allCompleted && styles.goalsBtnCompleted,
              ]}
              onPress={() => setGoalsModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Ver metas do treino"
              hitSlop={10}
            >
              {allCompleted ? (
                <Ionicons name="checkmark-circle" size={24} color="#32CD32" />
              ) : (
                <Ionicons name="cellular" size={22} color={getLocalThemePalette1().cyan} />
              )}
            </Pressable>
          ) : showWorkoutPill ? (
            <View style={styles.modeBadge}>
              <Ionicons name="locate" size={20} color={getLocalThemePalette1().bg} />
            </View>
          ) : (
            <View style={styles.backBtn} />
          )}
        </View>

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
              color={getLocalThemePalette1().warning}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.disconnectBannerText} allowFontScaling={false}>
              Conexão perdida — continuando em modo manual.
            </Text>
          </Pressable>
        ) : null}

        {!showWorkoutPill && isConnected && connectedDevice ? (
          <Text style={styles.deviceCaption} numberOfLines={1} allowFontScaling={false}>
            {connectedDevice.name}
          </Text>
        ) : null}
      </SafeAreaView>

      <View style={styles.content}>
        {/* Hero "Tempo" */}
        <View style={styles.heroBlock}>
          <Text style={styles.heroLabel} allowFontScaling={false}>
            Tempo
          </Text>
          <Text
            style={[styles.heroValue, isTraining && styles.heroValueLive]}
            allowFontScaling={false}
          >
            {formattedTime}
          </Text>
        </View>

        {/* Métricas flat — 2 colunas, 3 linhas, sem cards */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricsRow}>
            <FlatMetric label="Velocidade" value={speedStr} />
            <FlatMetric label="Distância" value={distanceStr} />
          </View>
          <View style={styles.metricsRow}>
            <FlatMetric label="Pace" value={paceStr} />
            <FlatMetric label="Inclinação" value={inclineStr} />
          </View>
          <View style={styles.metricsRow}>
            <FlatMetric label="FC" value={hrStr} />
            <FlatMetric label="Calorias" value={caloriesStr} />
          </View>
        </View>
      </View>

      {/* Bottom dock — full-width card with rounded top corners (Figma ref) */}
      <View
        style={[
          styles.bottomDock,
          { paddingBottom: insets.bottom + 18 },
        ]}
      >
        {/* Manual speed strip — only when manual mode + session active */}
        {treadmillMode === 'manual' && (isTraining || isPaused) ? (
          <ManualSpeedStrip
            value={manualSpeed}
            onIncrement={() => bumpManualSpeed(MANUAL_TREADMILL_SPEED.STEP_LARGE)}
            onDecrement={() => bumpManualSpeed(-MANUAL_TREADMILL_SPEED.STEP_LARGE)}
            onIncrementFine={() =>
              bumpManualSpeed(MANUAL_TREADMILL_SPEED.STEP_SMALL)
            }
            onDecrementFine={() =>
              bumpManualSpeed(-MANUAL_TREADMILL_SPEED.STEP_SMALL)
            }
          />
        ) : null}
        {isCalculating && (
          <Pressable
            style={styles.actionBtn}
            onPress={startResumeTracking}
            accessibilityRole="button"
            accessibilityLabel="Iniciar treino na esteira"
          >
            <Ionicons
              name="play"
              size={20}
              color={getLocalThemePalette1().textPrimary}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.actionBtnText} allowFontScaling={false}>
              Iniciar
            </Text>
          </Pressable>
        )}
        {isTraining && (
          <Pressable
            style={[styles.actionBtn, styles.actionBtnCyan]}
            onPress={pauseTracking}
            accessibilityRole="button"
            accessibilityLabel="Pausar treino"
          >
            <Ionicons
              name="pause"
              size={20}
              color={getLocalThemePalette1().cyan}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.actionBtnText, { color: getLocalThemePalette1().cyan }]} allowFontScaling={false}>
              Pausar
            </Text>
          </Pressable>
        )}
        {isPaused && (
          <View style={styles.actionPair}>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnCyan, styles.actionBtnHalf]}
              onPress={startResumeTracking}
              disabled={isFinishing}
              accessibilityRole="button"
              accessibilityLabel="Continuar treino"
            >
              <Ionicons
                name="play"
                size={18}
                color={getLocalThemePalette1().cyan}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.actionBtnText, { color: getLocalThemePalette1().cyan }]} allowFontScaling={false}>
                Continuar
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.actionBtn,
                styles.actionBtnFilled,
                styles.actionBtnHalf,
                isFinishing && { opacity: 0.6 },
              ]}
              onPress={handleFinish}
              disabled={isFinishing}
              accessibilityRole="button"
              accessibilityLabel="Finalizar treino"
            >
              {isFinishing ? (
                <ActivityIndicator size="small" color={getLocalThemePalette1().bg} />
              ) : (
                <>
                  <Ionicons
                    name="flag"
                    size={18}
                    color={getLocalThemePalette1().bg}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.actionBtnText, { color: getLocalThemePalette1().bg }]} allowFontScaling={false}>
                    Finalizar
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </View>

      {isFinishing && (
        <View style={styles.finishingOverlay}>
          <View style={styles.finishingCard}>
            <ActivityIndicator size="large" color={getLocalThemePalette1().cyan} />
            <Text style={styles.finishingTitle} allowFontScaling={false}>
              Finalizando treino
            </Text>
            <Text style={styles.finishingSubtitle}>
              Calculando velocidade média, pace e splits…
            </Text>
          </View>
        </View>
      )}

      {/* Goals modal — same component used in OutdoorRunningView so the
          treadmill flow is consistent for plan/manual workouts. */}
      <GoalsModal
        visible={goalsModalVisible}
        onClose={() => setGoalsModalVisible(false)}
        goalSteps={goalSteps}
      />
    </View>
  );
}

/* ───────────────────────── Sub-components ──────────────────────────────── */

/**
 * Flat "label / value" pair used in the metrics grid. No background, no
 * border — just typography. Matches the Figma 1313-1529 reference where
 * each metric occupies a column with a centered label above and a centered
 * value below.
 */
const FlatMetric = React.memo(function FlatMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  useThemeSubscription();
  return (
    <View style={styles.metricCol}>
      <Text style={styles.metricLabel} allowFontScaling={false}>
        {label}
      </Text>
      <Text
        style={styles.metricValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        allowFontScaling={false}
      >
        {value}
      </Text>
    </View>
  );
});

/**
 * Compact horizontal strip for adjusting manual speed during a session.
 * Stays out of the way visually but is reachable without scrolling.
 */
const ManualSpeedStrip = React.memo(function ManualSpeedStrip({
  value,
  onIncrement,
  onDecrement,
  onIncrementFine,
  onDecrementFine,
}: {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onIncrementFine: () => void;
  onDecrementFine: () => void;
}) {
  useThemeSubscription();
  return (
    <View style={styles.manualStrip}>
      <StripBtn label="−1" onPress={onDecrement} accessibilityLabel="Diminuir 1 km/h" />
      <StripBtn label="−0.1" onPress={onDecrementFine} accessibilityLabel="Diminuir 0,1 km/h" />
      <View style={styles.manualValueBox}>
        <Text style={styles.manualValue} allowFontScaling={false}>
          {value.toFixed(1)} km/h
        </Text>
      </View>
      <StripBtn label="+0.1" onPress={onIncrementFine} accessibilityLabel="Aumentar 0,1 km/h" />
      <StripBtn label="+1" onPress={onIncrement} accessibilityLabel="Aumentar 1 km/h" />
    </View>
  );
});

const StripBtn = React.memo(function StripBtn({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  useThemeSubscription();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.92, { damping: 18, stiffness: 360 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 360 });
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[styles.stripBtn, style]}>
        <Text style={styles.stripBtnText} allowFontScaling={false}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

/* ───────────────────────────── Styles ──────────────────────────────────── */

const styles = createThemeStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: getLocalThemePalette1().bg,
  },
  topSafe: {
    backgroundColor: 'transparent',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    minHeight: 60,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutPillFlex: {
    flex: 1,
  },
  workoutPill: {
    flex: 1,
    minHeight: 50,
    backgroundColor: getLocalThemePalette1().cardSurface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: semanticColors.borderSubtle,
    paddingHorizontal: 18,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutPillDay: {
    color: getLocalThemePalette1().textSecondary,
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 13,
    marginBottom: 2,
  },
  workoutPillTitle: {
    color: getLocalThemePalette1().textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 14,
    fontWeight: '600',
  },
  modeBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: getLocalThemePalette1().cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: getLocalThemePalette1().cardSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: getLocalThemePalette1().cardBorder,
  },
  goalsBtnCompleted: {
    borderWidth: 2,
    borderColor: '#32CD32',
  },
  deviceCaption: {
    color: getLocalThemePalette1().textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 4,
  },
  disconnectBanner: {
    marginHorizontal: 16,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: getLocalThemePalette1().warningBg,
    borderColor: getLocalThemePalette1().warningBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disconnectBannerText: {
    flex: 1,
    color: getLocalThemePalette1().textPrimary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },

  // Content layout
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },

  // Hero "Tempo"
  heroBlock: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 36,
  },
  heroLabel: {
    color: getLocalThemePalette1().textSecondary,
    fontFamily: fonts.medium,
    fontSize: 16,
    marginBottom: 4,
  },
  heroValue: {
    color: getLocalThemePalette1().textPrimary,
    fontFamily: fonts.bold,
    fontSize: 64,
    fontWeight: '700',
    letterSpacing: -1.5,
    lineHeight: 72,
  },
  heroValueLive: {
    color: getLocalThemePalette1().cyan,
  },

  // Flat metrics grid
  metricsGrid: {
    gap: 36,
  },
  metricsRow: {
    flexDirection: 'row',
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    color: getLocalThemePalette1().textSecondary,
    fontFamily: fonts.regular,
    fontSize: 15,
    marginBottom: 6,
  },
  metricValue: {
    color: getLocalThemePalette1().textPrimary,
    fontFamily: fonts.bold,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  // Manual speed strip — sits inside the bottom dock above the action button.
  manualStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 16,
    gap: 8,
  },
  stripBtn: {
    width: 44,
    height: 40,
    backgroundColor: getLocalThemePalette1().bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: getLocalThemePalette1().cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripBtnText: {
    color: getLocalThemePalette1().textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
  },
  manualValueBox: {
    flex: 1,
    alignItems: 'center',
  },
  manualValue: {
    color: getLocalThemePalette1().cyan,
    fontFamily: fonts.bold,
    fontSize: 18,
    fontWeight: '700',
  },

  // Bottom dock — full-width card with rounded top corners. Sits over
  // the gradient backdrop so it reads as a stage lifting off the floor.
  bottomDock: {
    paddingHorizontal: 22,
    paddingTop: 26,
    backgroundColor: getLocalThemePalette1().cardSurface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: semanticColors.canvas,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  actionPair: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 58,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: semanticColors.borderStrong,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  actionBtnCyan: {
    borderColor: getLocalThemePalette1().cyan,
  },
  actionBtnFilled: {
    backgroundColor: getLocalThemePalette1().cyan,
    borderColor: getLocalThemePalette1().cyan,
  },
  actionBtnHalf: {
    flex: 1,
  },
  actionBtnText: {
    color: getLocalThemePalette1().textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 16,
    fontWeight: '600',
  },

  // Finishing overlay
  finishingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: semanticColors.scrim,
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
    backgroundColor: getLocalThemePalette1().cardSurface,
    borderWidth: 1,
    borderColor: getLocalThemePalette1().cardBorder,
  },
  finishingTitle: {
    color: getLocalThemePalette1().textPrimary,
    fontFamily: fonts.bold,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
    textAlign: 'center',
  },
  finishingSubtitle: {
    color: getLocalThemePalette1().textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
  },
}));

export default TreadmillRunningView;
