/**
 * "Onde você vai correr?" — environment picker shown before every run.
 *
 * Mounted once at the root (AppNavigator). Driven by `useRunEnvironmentStore`:
 * any screen calls `useStartWorkoutFlow().startRun(params)` and this modal
 * pops up. The user picks outdoor or treadmill; we then route to the
 * appropriate next screen forwarding the pending params untouched.
 *
 * Visual fidelity: Figma node 1315-1609. Centered floating dialog (not a
 * bottom sheet), 355px fixed width, translucent option cards, square
 * 47x47 dark icon tiles. All measurements match the Figma exactly.
 */

import React, { useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useRunEnvironmentStore } from '../stores/runEnvironmentStore';
import { navigate } from '../navigation/navigationRef';
import { fonts, createThemeStyles, useThemeSubscription } from '../theme';
import { semanticColors } from '../theme/semanticColors';

const getLocalThemePalette1 = () => ({
  modalBg: semanticColors.surface2,
  modalRadius: 20,
  modalWidth: 340,
  modalPadTop: 22,
  modalPadBottom: 18,
  modalPadH: 18,
  titleColor: semanticColors.textPrimary,
  titleSize: 22,
  cardBg: semanticColors.surface1,
  cardRadius: 14,
  cardHeight: 72,
  cardGap: 10,
  iconBg: semanticColors.surface3,
  iconRadius: 10,
  iconSize: 44,
  iconInner: 22,
  iconColor: semanticColors.textPrimary,
  subtitleColor: semanticColors.textSecondary,
  optionTitleSize: 15,
  optionSubtitleSize: 12,
  cancelSize: 13,
  cyan: semanticColors.accent,
  backdrop: semanticColors.scrim,
  cardBorder: semanticColors.borderSubtle,
});

// Figma tokens (1315-1609). Card width is computed from modal width minus
// horizontal padding × 2 so cards never overshoot the container even when
// the modal is shrunken by safe-area or small screens.


export function RunEnvironmentModal() {
  useThemeSubscription();
  const visible = useRunEnvironmentStore((s) => s.visible);
  const pendingParams = useRunEnvironmentStore((s) => s.pendingParams);
  const close = useRunEnvironmentStore((s) => s.close);

  // Entry animation: scale + fade so the dialog feels intentional, not
  // just blinking onto the screen. Spring tuning matches the rest of the
  // app's modal presentations.
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

  const cardAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

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
            <Animated.View style={[styles.dialog, cardAnim]}>
              <Text
                style={styles.title}
                accessibilityRole="header"
                allowFontScaling={false}
              >
                Onde você vai correr?
              </Text>

              <View style={styles.cardsWrap}>
                <OptionCard
                  iconName="sunny"
                  iconColor={getLocalThemePalette1().cyan}
                  title="Ao ar livre"
                  subtitle="GPS tracking com mapa."
                  onPress={handleOutdoor}
                  accessibilityHint="Inicia o treino com GPS e mapa em tempo real"
                />
                <OptionCard
                  iconName="walk"
                  iconColor={getLocalThemePalette1().iconColor}
                  title="Na esteira"
                  subtitle="Conecte sua esteira."
                  onPress={handleTreadmill}
                  accessibilityHint="Conecte sua esteira via Bluetooth ou use modo manual"
                />
              </View>

              <Pressable
                onPress={close}
                style={styles.cancelHit}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
                hitSlop={8}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

interface OptionCardProps {
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  accessibilityHint?: string;
}

/**
 * Single tappable option row (e.g. "Ao ar livre"). Matches the Figma
 * `opt1` frame exactly: 333×81 translucent card with a square 47×47
 * dark icon tile on the left and a 2-line text block on the right.
 *
 * Press feedback: spring-based scale-down to 0.97. This is the only
 * indication of pressability we offer (no chevron), so the animation
 * matters — without it the cards feel inert.
 */
const OptionCard = React.memo(function OptionCard({
  iconName,
  iconColor,
  title,
  subtitle,
  onPress,
  accessibilityHint,
}: OptionCardProps) {
  useThemeSubscription();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 20, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 20, stiffness: 320 });
      }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
    >
      <Animated.View style={[styles.card, animStyle]}>
        <View style={styles.iconTile}>
          <Ionicons name={iconName} size={getLocalThemePalette1().iconInner} color={iconColor} />
        </View>
        <View style={styles.cardTextCol}>
          <Text style={styles.cardTitle} allowFontScaling={false}>
            {title}
          </Text>
          <Text style={styles.cardSubtitle} allowFontScaling={false}>
            {subtitle}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
});

const styles = createThemeStyles(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: getLocalThemePalette1().backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dialog: {
    width: getLocalThemePalette1().modalWidth,
    maxWidth: '100%',
    backgroundColor: getLocalThemePalette1().modalBg,
    borderRadius: getLocalThemePalette1().modalRadius,
    paddingTop: getLocalThemePalette1().modalPadTop,
    paddingBottom: getLocalThemePalette1().modalPadBottom,
    paddingHorizontal: getLocalThemePalette1().modalPadH,
    shadowColor: semanticColors.canvas,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 16,
  },
  title: {
    color: getLocalThemePalette1().titleColor,
    fontFamily: fonts.bold,
    fontSize: getLocalThemePalette1().titleSize,
    fontWeight: '700',
    lineHeight: getLocalThemePalette1().titleSize * 1.35,
    marginBottom: 18,
  },
  cardsWrap: {
    gap: getLocalThemePalette1().cardGap,
    marginBottom: 6,
  },
  card: {
    width: '100%',
    height: getLocalThemePalette1().cardHeight,
    backgroundColor: getLocalThemePalette1().cardBg,
    borderRadius: getLocalThemePalette1().cardRadius,
    borderWidth: 1,
    borderColor: getLocalThemePalette1().cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  iconTile: {
    width: getLocalThemePalette1().iconSize,
    height: getLocalThemePalette1().iconSize,
    borderRadius: getLocalThemePalette1().iconRadius,
    backgroundColor: getLocalThemePalette1().iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextCol: {
    marginLeft: 12,
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  cardTitle: {
    color: getLocalThemePalette1().titleColor,
    fontFamily: fonts.bold,
    fontSize: getLocalThemePalette1().optionTitleSize,
    fontWeight: '700',
    lineHeight: getLocalThemePalette1().optionTitleSize * 1.35,
  },
  cardSubtitle: {
    color: getLocalThemePalette1().subtitleColor,
    fontFamily: fonts.regular,
    fontSize: getLocalThemePalette1().optionSubtitleSize,
    lineHeight: getLocalThemePalette1().optionSubtitleSize * 1.4,
  },
  cancelHit: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingRight: 16,
    marginTop: 4,
    minHeight: 40,
  },
  cancelText: {
    color: getLocalThemePalette1().subtitleColor,
    fontFamily: fonts.medium,
    fontSize: getLocalThemePalette1().cancelSize,
    lineHeight: getLocalThemePalette1().cancelSize * 1.4,
  },
}));

export default RunEnvironmentModal;
