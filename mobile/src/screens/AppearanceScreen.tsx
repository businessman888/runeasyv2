import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { ScreenContainer } from '../components/ScreenContainer';
import { AppIcon } from '../components/ui/AppIcon';
import {
  borderRadius,
  fonts,
  getThemeStatusBarStyle,
  spacing,
  type ThemeColors,
  type ThemePreference,
  useAppTheme,
  useThemedStyles,
} from '../theme';
import type { AppIconName } from '../theme/iconography';
import { triggerHaptic } from '../utils/haptics';

interface AppearanceNavigation {
  goBack: () => void;
}

interface AppearanceScreenProps {
  navigation: AppearanceNavigation;
}

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: AppIconName;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Claro', icon: 'lightMode' },
  { value: 'dark', label: 'Escuro', icon: 'darkMode' },
  { value: 'nebula', label: 'Nebulosa', icon: 'nebulaMode' },
  { value: 'system', label: 'Sistema', icon: 'systemTheme' },
];

/** Fallback when the stored preference has no option — the app's default theme. */
const DEFAULT_OPTION =
  THEME_OPTIONS.find((option) => option.value === 'dark') ?? THEME_OPTIONS[0];

const MENU_ENTER = FadeInDown.duration(160).reduceMotion(ReduceMotion.System);
const MENU_EXIT = FadeOut.duration(120).reduceMotion(ReduceMotion.System);

export function AppearanceScreen({ navigation }: AppearanceScreenProps) {
  const { theme, preference, setPreference } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = useMemo(
    () => THEME_OPTIONS.find((option) => option.value === preference) ?? DEFAULT_OPTION,
    [preference],
  );

  const toggleSelect = useCallback(() => {
    void triggerHaptic('selection');
    setIsOpen((open) => !open);
  }, []);

  const selectTheme = useCallback(
    (value: ThemePreference) => {
      setPreference(value);
      setIsOpen(false);
      void triggerHaptic('selection');
    },
    [setPreference],
  );

  return (
    <ScreenContainer centered style={styles.screen}>
      <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={theme.colors.canvas} />

      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.headerButton, pressed && styles.controlPressed]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
        >
          <AppIcon name="chevronBack" size={24} tone="primary" />
        </Pressable>
        <Text style={styles.headerTitle}>Aparência</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.fieldLabel}>Tema do aplicativo</Text>

        <View style={styles.selectContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.selectTrigger,
              isOpen && styles.selectTriggerOpen,
              pressed && styles.controlPressed,
            ]}
            onPress={toggleSelect}
            accessibilityRole="button"
            accessibilityLabel={'Tema do aplicativo, ' + selectedOption.label}
            accessibilityHint="Toque para abrir as opções de tema"
            accessibilityState={{ expanded: isOpen }}
          >
            <View style={styles.selectedValue}>
              <AppIcon name={selectedOption.icon} size={20} tone="secondary" />
              <Text style={styles.selectedLabel}>{selectedOption.label}</Text>
            </View>
            <AppIcon
              name={isOpen ? 'chevronUp' : 'chevronDown'}
              size={20}
              tone="secondary"
            />
          </Pressable>

          {isOpen ? (
            <Animated.View
              entering={MENU_ENTER}
              exiting={MENU_EXIT}
              style={styles.selectMenu}
              accessibilityRole="menu"
            >
              {THEME_OPTIONS.map((option) => {
                const isSelected = option.value === preference;

                return (
                  <Pressable
                    key={option.value}
                    style={({ pressed }) => [
                      styles.option,
                      isSelected && styles.optionSelected,
                      pressed && styles.optionPressed,
                    ]}
                    onPress={() => selectTheme(option.value)}
                    accessibilityRole="menuitem"
                    accessibilityLabel={'Usar tema ' + option.label.toLowerCase()}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={styles.optionValue}>
                      <AppIcon name={option.icon} size={20} tone="secondary" />
                      <Text style={styles.optionLabel}>{option.label}</Text>
                    </View>
                    {isSelected ? (
                      <AppIcon name="selected" size={20} tone="accent" variant="filled" />
                    ) : null}
                  </Pressable>
                );
              })}
            </Animated.View>
          ) : null}
        </View>

        <Text style={styles.helperText}>
          A alteração é aplicada imediatamente e fica salva neste dispositivo.
        </Text>
      </View>
    </ScreenContainer>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.canvas,
    },
    header: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
    },
    headerButton: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.semibold,
      fontSize: 18,
      textAlign: 'center',
    },
    headerSpacer: {
      width: 44,
      height: 44,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
    },
    fieldLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.medium,
      fontSize: 14,
      marginBottom: spacing.sm,
    },
    selectContainer: {
      position: 'relative',
      zIndex: 20,
    },
    selectTrigger: {
      minHeight: 52,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: borderRadius.lg,
    },
    selectTriggerOpen: {
      borderColor: colors.borderStrong,
    },
    selectedValue: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    selectedLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.medium,
      fontSize: 15,
    },
    selectMenu: {
      position: 'absolute',
      top: 60,
      left: 0,
      right: 0,
      padding: spacing.xs,
      backgroundColor: colors.surface1,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: borderRadius.lg,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 24,
      elevation: 12,
      zIndex: 30,
    },
    option: {
      minHeight: 48,
      paddingHorizontal: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: borderRadius.md,
    },
    optionSelected: {
      backgroundColor: colors.fillSubtle,
    },
    optionPressed: {
      backgroundColor: colors.fillMuted,
    },
    optionValue: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    optionLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.medium,
      fontSize: 15,
    },
    helperText: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 19,
      marginTop: spacing.md,
    },
    controlPressed: {
      opacity: 0.72,
    },
  });
}

export default AppearanceScreen;
