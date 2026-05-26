/**
 * "Onde você vai correr?" — environment picker shown before every run.
 *
 * Mounted once at the root (AppNavigator). Driven by `useRunEnvironmentStore`:
 * any screen calls `useStartWorkoutFlow().startRun(params)` and this modal
 * pops up. The user picks outdoor or treadmill; we then route to the
 * appropriate next screen forwarding the pending params untouched.
 *
 * Figma node 1315-1609.
 */

import React, { useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableWithoutFeedback,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRunEnvironmentStore } from '../stores/runEnvironmentStore';
import { navigate } from '../navigation/navigationRef';
import {
  colors,
  spacing,
  borderRadius,
  typography,
  fonts,
  shadows,
} from '../theme';

export function RunEnvironmentModal() {
  const visible = useRunEnvironmentStore((s) => s.visible);
  const pendingParams = useRunEnvironmentStore((s) => s.pendingParams);
  const close = useRunEnvironmentStore((s) => s.close);
  const { width } = useWindowDimensions();

  const handleOutdoor = useCallback(() => {
    if (!pendingParams) return;
    close();
    (navigate as any)('Running', {
      ...pendingParams,
      environment: 'outdoor',
    });
  }, [close, pendingParams]);

  const handleTreadmill = useCallback(() => {
    if (!pendingParams) return;
    close();
    (navigate as any)('TreadmillSetup', {
      runParams: pendingParams,
    });
  }, [close, pendingParams]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={close} accessible={false}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { maxWidth: Math.min(420, width - 32) }]}>
              <View style={styles.handle} />
              <Text style={styles.title}>Onde você vai correr?</Text>
              <Text style={styles.subtitle}>
                Escolha o ambiente do seu treino
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.cardPressed,
                ]}
                onPress={handleOutdoor}
                accessibilityRole="button"
                accessibilityLabel="Correr ao ar livre"
                accessibilityHint="Inicia o treino com GPS e mapa em tempo real"
              >
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: 'rgba(0, 212, 255, 0.12)' },
                  ]}
                >
                  <Ionicons name="sunny" size={28} color={colors.primary} />
                </View>
                <View style={styles.cardTextWrap}>
                  <Text style={styles.cardTitle}>Ao ar livre</Text>
                  <Text style={styles.cardSubtitle}>
                    GPS com mapa e rota em tempo real
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.cardPressed,
                ]}
                onPress={handleTreadmill}
                accessibilityRole="button"
                accessibilityLabel="Correr na esteira"
                accessibilityHint="Conecte sua esteira por Bluetooth ou use modo manual"
              >
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: 'rgba(245, 158, 11, 0.14)' },
                  ]}
                >
                  <Ionicons name="walk" size={28} color={colors.accent} />
                </View>
                <View style={styles.cardTextWrap}>
                  <Text style={styles.cardTitle}>Na esteira</Text>
                  <Text style={styles.cardSubtitle}>
                    Conecte sua esteira ou corra no modo manual
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </Pressable>

              <Pressable
                style={styles.cancelBtn}
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
                hitSlop={12}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
  },
  sheet: {
    alignSelf: 'center',
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: borderRadius['2xl'],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    ...shadows.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
    marginBottom: spacing.base,
  },
  title: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: typography.fontSizes['2xl'],
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.md,
    minHeight: 84,
  },
  cardPressed: {
    borderColor: colors.primary,
    backgroundColor: colors.highlight,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.base,
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    color: colors.white,
    fontFamily: fonts.semibold,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: 2,
  },
  cardSubtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
  },
  cancelBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
  },
});

export default RunEnvironmentModal;
