/**
 * PlanGeneratingOverlay — premium full-screen "lock" shown while the AI builds
 * the training plan (a ~3 min wait). Reuses the app's frosted-glass recipe
 * (BlurView + strong veil + sheen, mirrored from GlassTeaseOverlay) with a
 * cyan RippleLoader and rotating reassurance messages. Blocks interaction with
 * the screen until generation finishes.
 *
 * Mount/unmount is controlled by the parent (render it conditionally) so the
 * reanimated enter/exit fades play. Two modes: 'generating' and 'error'.
 */
import React, { memo, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, shadows, spacing, createThemeStyles, useThemeSubscription, getThemeBlurTint, getThemeGlassSheenColors } from '../../theme';
import { RippleLoader } from './RippleLoader';
import { semanticColors } from '../../theme/semanticColors';

// Real frosted blur on Android needs expo-blur's experimental method; iOS
// ignores it and uses native blur. Same approach as GlassTeaseOverlay.
const ANDROID_BLUR_METHOD: 'dimezisBlurView' | undefined =
  Platform.OS === 'android' ? 'dimezisBlurView' : undefined;

const SHEEN_LOCATIONS = [0, 0.5, 1] as const;

const GENERATING_MESSAGES = [
  'Finalizando treinos personalizados',
  'Criando periodização de dias de treino',
  'Planejando de acordo com as suas metas',
  'Montando cronograma',
];
const MESSAGE_INTERVAL_MS = 2600;

// Rotating reassurance line. Isolated so its state updates don't re-render the
// (animated) rings.
const RotatingMessage = memo(() => {
  useThemeSubscription();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % GENERATING_MESSAGES.length);
    }, MESSAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.messageWrap}>
      <Animated.Text
        key={index}
        entering={FadeIn.duration(400)}
        exiting={FadeOut.duration(300)}
        style={styles.title}
      >
        {GENERATING_MESSAGES[index]}
      </Animated.Text>
    </View>
  );
});
RotatingMessage.displayName = 'RotatingMessage';

export interface PlanGeneratingOverlayProps {
  mode?: 'generating' | 'error';
  onRetry?: () => void;
  canRetry?: boolean;
}

function PlanGeneratingOverlayImpl({
  mode = 'generating',
  onRetry,
  canRetry = true,
}: PlanGeneratingOverlayProps) {
  useThemeSubscription();
  const isError = mode === 'error';

  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(250)}
      // pointerEvents 'auto' (default) captures all touches → blocks the screen.
      // zIndex + elevation lift it above sibling content (iOS uses zIndex, Android
      // needs elevation) so the blur frosts the real screen. The floating tab bar
      // lives in the navigator (above the scene), so it stays on top — exactly
      // "covers everything except the tab bar".
      style={[StyleSheet.absoluteFill, styles.lift]}
      accessibilityViewIsModal
      accessibilityRole={isError ? 'alert' : 'progressbar'}
      accessibilityLabel={
        isError ? 'Erro ao gerar seu plano' : 'Gerando seu plano de treino'
      }
      accessibilityState={{ busy: !isError }}
    >
      <BlurView
        intensity={60}
        tint={getThemeBlurTint()}
        experimentalBlurMethod={ANDROID_BLUR_METHOD}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.proGlassOverlayStrong },
        ]}
      />
      <LinearGradient
        colors={getThemeGlassSheenColors()}
        locations={SHEEN_LOCATIONS}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        {!isError ? (
          <>
            <RippleLoader size={220} />
            <View style={styles.textBlock}>
              <RotatingMessage />
              <Text style={styles.subtitle}>
                Isso pode levar alguns instantes…
              </Text>
            </View>
          </>
        ) : (
          <>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={56}
              color={colors.error}
            />
            <View style={styles.textBlock}>
              <Text style={styles.title}>Erro ao gerar seu plano</Text>
              <Text style={styles.subtitle}>
                {canRetry
                  ? 'Houve um problema. Tente novamente.'
                  : 'Entre em contato com o suporte para ajuda.'}
              </Text>
            </View>
            {canRetry && onRetry ? (
              <Pressable
                onPress={onRetry}
                style={styles.retryButton}
                accessibilityRole="button"
                accessibilityLabel="Tentar novamente"
              >
                <Text style={styles.retryText}>Tentar novamente</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </Animated.View>
  );
}

export const PlanGeneratingOverlay = memo(PlanGeneratingOverlayImpl);

const styles = createThemeStyles(() => ({
  lift: {
    zIndex: 50,
    elevation: 50,
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  textBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  messageWrap: {
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: semanticColors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: semanticColors.borderSubtle,
    backgroundColor: semanticColors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.neon,
  },
  retryText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.primary,
  },
}));

export default PlanGeneratingOverlay;
