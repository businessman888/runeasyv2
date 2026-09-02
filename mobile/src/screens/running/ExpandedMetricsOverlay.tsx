import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  SlideInDown,
  SlideOutDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { SplitsBars } from '../../components/coach/SplitsBars';
import type { LiveSplit } from '../../utils/livePace';

const getLocalThemePalette1 = () => ({
  bg: semanticColors.canvas,
  cardSurface: semanticColors.surface2,
  cardBorder: semanticColors.borderSubtle,
  cyan: semanticColors.accent,
  textPrimary: semanticColors.textPrimary,
  textSecondary: semanticColors.textSecondary,
  textMuted: semanticColors.textTertiary,
});

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// Tokens espelhados do TreadmillRunningView (mesmo design Figma).


interface Props {
  onClose: () => void;
  /** Tempo formatado (HH:MM:SS) — hero principal. */
  timeText: string;
  /** Pace atual formatado (MM:SS /km). */
  paceText: string;
  /** Distância já formatada em km (string com 2 casas). */
  distanceText: string;
  /** Estados de sessão (espelham o RunningScreen). */
  isCalculating: boolean;
  isTraining: boolean;
  isPaused: boolean;
  /** Finalização em andamento — desabilita os botões e mostra spinner. */
  isFinishing: boolean;
  /** Texto de status do GPS (só relevante antes de iniciar). */
  gpsStatusText: string;
  /** Ações — mesmos handlers do painel recolhido. */
  onStart: () => void;
  onPause: () => void;
  onFinish: () => void;
  dayLabel?: string;
  workoutTitle?: string;
  /** Splits de km já completados (Fase 2). Renderizados como barras aqui. */
  splits?: LiveSplit[];
}

/** Par "label / valor" sem fundo nem borda — idêntico ao FlatMetric da esteira. */
function FlatMetric({ label, value }: { label: string; value: string }) {
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
}

/**
 * Visão de métricas em tela cheia (estilo Strava), espelhando fielmente o
 * TreadmillRunningView: fundo reativo ao estado (cyan treinando / âmbar pausado),
 * hero "Tempo" 64px, grid flat de métricas e dock inferior com o botão de ação
 * que respeita o estado (Iniciar / Parar / Continuar + Finalizar).
 *
 * Puramente apresentacional — recebe os mesmos handlers/estado do painel recolhido,
 * não duplica lógica de tracking/GPS/navegação.
 */
export function ExpandedMetricsOverlay({
  onClose,
  timeText,
  paceText,
  distanceText,
  isCalculating,
  isTraining,
  isPaused,
  isFinishing,
  gpsStatusText,
  onStart,
  onPause,
  onFinish,
  dayLabel,
  workoutTitle,
  splits,
}: Props) {
  useThemeSubscription();
  const insets = useSafeAreaInsets();
  const showWorkoutPill = !!(dayLabel || workoutTitle);

  // Cross-fade dos overlays reativos — idêntico à esteira.
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
  const cyanOverlayStyle = useAnimatedStyle(() => ({ opacity: cyanOverlay.value }));
  const amberOverlayStyle = useAnimatedStyle(() => ({ opacity: amberOverlay.value }));

  return (
    <Animated.View
      style={styles.container}
      entering={SlideInDown.duration(300)}
      exiting={SlideOutDown.duration(250)}
      pointerEvents="auto"
    >
      {/* Gradientes reativos — bg sólido por padrão, cyan treinando, âmbar pausado. */}
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
          {/* Recolher — ocupa o slot do "voltar" da esteira */}
          <Pressable
            style={styles.backBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Recolher métricas"
            hitSlop={10}
          >
            <Ionicons name="chevron-down" size={26} color={getLocalThemePalette1().textPrimary} />
          </Pressable>

          {showWorkoutPill ? (
            <View style={styles.workoutPill}>
              {dayLabel ? (
                <Text style={styles.workoutPillDay} numberOfLines={1} allowFontScaling={false}>
                  {dayLabel}
                </Text>
              ) : null}
              {workoutTitle ? (
                <Text style={styles.workoutPillTitle} numberOfLines={1} allowFontScaling={false}>
                  {workoutTitle}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.workoutPillFlex} />
          )}

          {/* Slot direito — spacer para equilibrar o chevron à esquerda. */}
          <View style={styles.backBtn} />
        </View>

        {/* Status do GPS — só antes de iniciar (caption discreta, estilo esteira). */}
        {isCalculating ? (
          <Text style={styles.gpsCaption} numberOfLines={1} allowFontScaling={false}>
            {gpsStatusText}
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
            {timeText}
          </Text>
        </View>

        {/* Métricas flat — Pace | Distância (métricas reais do outdoor). */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricsRow}>
            <FlatMetric label="Pace" value={paceText} />
            <FlatMetric label="Distância" value={`${distanceText} km`} />
          </View>
        </View>

        {/* Splits por km já completados (barras, estilo Strava). Visíveis direto
            no expandido — sem 2º nível de colapso. */}
        {!!splits && splits.length > 0 && <SplitsBars splits={splits} />}
      </View>

      {/* Dock inferior — idêntico à esteira, botões reativos ao estado. */}
      <View style={[styles.bottomDock, { paddingBottom: insets.bottom + 18 }]}>
        {isCalculating && (
          <Pressable
            style={styles.actionBtn}
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel="Iniciar treino"
          >
            <Ionicons name="play" size={20} color={getLocalThemePalette1().textPrimary} style={{ marginRight: 8 }} />
            <Text style={styles.actionBtnText} allowFontScaling={false}>
              Iniciar
            </Text>
          </Pressable>
        )}

        {isTraining && (
          <Pressable
            style={[styles.actionBtn, styles.actionBtnCyan]}
            onPress={onPause}
            accessibilityRole="button"
            accessibilityLabel="Parar treino"
          >
            <Ionicons name="pause" size={20} color={getLocalThemePalette1().cyan} style={{ marginRight: 8 }} />
            <Text style={[styles.actionBtnText, { color: getLocalThemePalette1().cyan }]} allowFontScaling={false}>
              Parar
            </Text>
          </Pressable>
        )}

        {isPaused && (
          <View style={styles.actionPair}>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnCyan, styles.actionBtnHalf]}
              onPress={onStart}
              disabled={isFinishing}
              accessibilityRole="button"
              accessibilityLabel="Continuar treino"
            >
              <Ionicons name="play" size={18} color={getLocalThemePalette1().cyan} style={{ marginRight: 8 }} />
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
              onPress={onFinish}
              disabled={isFinishing}
              accessibilityRole="button"
              accessibilityLabel="Finalizar treino"
            >
              {isFinishing ? (
                <ActivityIndicator size="small" color={getLocalThemePalette1().bg} />
              ) : (
                <>
                  <Ionicons name="flag" size={18} color={getLocalThemePalette1().bg} style={{ marginRight: 8 }} />
                  <Text style={[styles.actionBtnText, { color: getLocalThemePalette1().bg }]} allowFontScaling={false}>
                    Finalizar
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = createThemeStyles(() => ({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: getLocalThemePalette1().bg,
    zIndex: 50,
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
  gpsCaption: {
    color: getLocalThemePalette1().textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 4,
  },

  // Content layout
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
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

  // Bottom dock — idêntico à esteira.
  bottomDock: {
    paddingHorizontal: 22,
    paddingTop: 26,
    backgroundColor: getLocalThemePalette1().cardSurface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    // Upward shadow — the sheet lifts off the screen below it.
    shadowColor: semanticColors.shadow,
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
}));
