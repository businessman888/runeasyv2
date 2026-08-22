/**
 * Prominent Disclosure de localização — exigência do Google Play
 * ("Prominent Disclosure & Consent"). Aparece DENTRO do app, no fluxo normal
 * de uso (ao entrar na tela de corrida ao ar livre), ANTES de qualquer popup
 * nativo de permissão de localização. Só ao tocar "Permitir localização" é que
 * as chamadas reais de permissão são disparadas (via `onAllow`). "Agora não"
 * apenas fecha, sem consentir e sem disparar popup nativo (via `onDismiss`).
 *
 * Componente puramente apresentacional — a lógica de permissão vive em
 * `useTracking`. Espelha o padrão visual de `RunEnvironmentModal` (RN Modal
 * transparente, backdrop, dialog centralizado com entrada spring/fade) e usa
 * exclusivamente os tokens de `theme`.
 */

import React, { useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  fonts,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '../theme';
import { semanticColors } from '../theme/semanticColors';

interface LocationDisclosureModalProps {
  visible: boolean;
  /** Dispara o pedido real de permissão (foreground → background). */
  onAllow: () => void;
  /** Fecha sem consentir e sem disparar popup nativo. */
  onDismiss: () => void;
}

export function LocationDisclosureModal({
  visible,
  onAllow,
  onDismiss,
}: LocationDisclosureModalProps) {
  const insets = useSafeAreaInsets();

  // Entrada: scale + fade (mesma identidade dos outros modais do app).
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 18, stiffness: 220 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      scale.value = 0.92;
      opacity.value = 0;
    }
  }, [visible, scale, opacity]);

  const dialogAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  // Feedback de press do botão primário (spring-scale, igual ao OptionCard).
  const btnScale = useSharedValue(1);
  const btnAnim = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.dialog,
            { paddingBottom: spacing.lg + insets.bottom * 0.5 },
            dialogAnim,
          ]}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="location-outline" size={44} color={semanticColors.accent} />
          </View>

          <Text
            style={styles.title}
            accessibilityRole="header"
            allowFontScaling={false}
          >
            Precisamos da sua localização
          </Text>

          <Text style={styles.body}>
            O RunEasy coleta sua localização para rastrear sua rota durante a
            corrida, inclusive quando o app está em segundo plano ou com a tela
            bloqueada, para registrar seu trajeto completo.
          </Text>

          <Pressable
            onPressIn={() => {
              btnScale.value = withSpring(0.97, { damping: 20, stiffness: 320 });
            }}
            onPressOut={() => {
              btnScale.value = withSpring(1, { damping: 20, stiffness: 320 });
            }}
            onPress={onAllow}
            accessibilityRole="button"
            accessibilityLabel="Permitir localização"
            accessibilityHint="Abre o pedido de permissão de localização do sistema"
          >
            <Animated.View style={[styles.primaryBtn, btnAnim]}>
              <Text style={styles.primaryBtnText} allowFontScaling={false}>
                Permitir localização
              </Text>
            </Animated.View>
          </Pressable>

          <Pressable
            onPress={onDismiss}
            style={styles.secondaryHit}
            accessibilityRole="button"
            accessibilityLabel="Agora não"
            accessibilityHint="Fecha sem permitir o acesso à localização"
            hitSlop={8}
          >
            <Text style={styles.secondaryText} allowFontScaling={false}>
              Agora não
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const DIALOG_WIDTH = 340;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: semanticColors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  dialog: {
    width: DIALOG_WIDTH,
    maxWidth: '100%',
    backgroundColor: semanticColors.surface2,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: semanticColors.borderSubtle,
    paddingTop: spacing['2xl'],
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    ...shadows.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: semanticColors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: semanticColors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.fontSizes['2xl'],
    textAlign: 'center',
    lineHeight: typography.fontSizes['2xl'] * 1.3,
    marginBottom: spacing.md,
  },
  body: {
    color: semanticColors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    lineHeight: typography.fontSizes.md * 1.55,
    marginBottom: spacing.xl,
  },
  primaryBtn: {
    width: DIALOG_WIDTH - spacing.lg * 2,
    maxWidth: '100%',
    minHeight: 52,
    backgroundColor: semanticColors.accent,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryBtnText: {
    color: semanticColors.textOnAccent,
    fontFamily: fonts.semibold,
    fontSize: typography.fontSizes.lg,
  },
  secondaryHit: {
    minHeight: 44,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  secondaryText: {
    color: semanticColors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.fontSizes.md,
  },
});

export default LocationDisclosureModal;
