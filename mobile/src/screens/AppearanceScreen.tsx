import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '../components/ScreenContainer';
import { AppIcon } from '../components/ui/AppIcon';
import { AppPressable } from '../components/ui/AppPressable';
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

interface ThemeOption {
  value: ThemePreference;
  label: string;
  description: string;
  icon: AppIconName;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Claro', description: 'Visual leve para ambientes iluminados.', icon: 'lightMode' },
  { value: 'dark', label: 'Escuro', description: 'Conforto visual com fundos profundos.', icon: 'darkMode' },
  { value: 'system', label: 'Sistema', description: 'Acompanha automaticamente o tema do aparelho.', icon: 'systemTheme' },
];

export function AppearanceScreen({ navigation }: any) {
  const { theme, preference, setPreference } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <ScreenContainer centered style={styles.screen}>
      <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={theme.colors.canvas} />

      <View style={styles.header}>
        <AppPressable
          style={styles.headerButton}
          interactionScale="icon"
          onPress={() => navigation.goBack()}
          accessibilityLabel="Voltar"
        >
          <AppIcon name="chevronBack" size={24} tone="primary" />
        </AppPressable>
        <Text style={styles.headerTitle}>Aparência</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.title}>Escolha seu tema</Text>
          <Text style={styles.description}>
            A alteração é aplicada imediatamente e fica salva neste dispositivo.
          </Text>
        </View>

        <View style={styles.optionList}>
          {THEME_OPTIONS.map((option) => {
            const isSelected = preference === option.value;
            return (
              <AppPressable
                key={option.value}
                style={[styles.option, isSelected && styles.optionSelected]}
                interactionScale="card"
                hapticFeedback="selection"
                onPress={() => setPreference(option.value)}
                accessibilityRole="radio"
                accessibilityLabel={option.label + '. ' + option.description}
                accessibilityState={{ checked: isSelected, selected: isSelected }}
              >
                <View style={[styles.iconContainer, isSelected && styles.iconContainerSelected]}>
                  <AppIcon
                    name={option.icon}
                    size={24}
                    tone={isSelected ? 'accent' : 'secondary'}
                    variant={isSelected ? 'filled' : 'outline'}
                  />
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
                {isSelected ? (
                  <AppIcon name="check" size={24} tone="accent" variant="filled" />
                ) : (
                  <View style={styles.unselectedIndicator} />
                )}
              </AppPressable>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { backgroundColor: colors.canvas },
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
    headerSpacer: { width: 44, height: 44 },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing['3xl'],
    },
    intro: { marginBottom: spacing.xl },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 24,
      lineHeight: 30,
      marginBottom: spacing.sm,
    },
    description: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 21,
      maxWidth: 360,
    },
    optionList: { gap: spacing.md },
    option: {
      minHeight: 84,
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.base,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: borderRadius.xl,
    },
    optionSelected: {
      backgroundColor: colors.accentSubtle,
      borderColor: colors.borderStrong,
    },
    iconContainer: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface3,
    },
    iconContainerSelected: { backgroundColor: colors.surface1 },
    optionText: { flex: 1, marginHorizontal: spacing.md },
    optionLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.semibold,
      fontSize: 16,
      lineHeight: 22,
    },
    optionDescription: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
    },
    unselectedIndicator: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.borderStrong,
    },
  });
}

export default AppearanceScreen;
