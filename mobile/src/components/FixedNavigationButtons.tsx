import React from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Dimensions } from 'react-native';
import { fonts, elevation, createThemeStyles, useThemeSubscription } from '../theme';
import { semanticColors } from '../theme/semanticColors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================
// SEMANTIC COLOR ALIASES
// ============================================








type Variant = 'default' | 'yesNo';

interface FixedNavigationButtonsProps {
    variant?: Variant;
    // default variant
    onBack?: () => void;
    onContinue?: () => void;
    showBack?: boolean;
    continueDisabled?: boolean;
    isLastStep?: boolean;
    // yesNo variant (Figma 867:645) — also usado pela step do coach de áudio
    onYes?: () => void;
    onNo?: () => void;
    yesLabel?: string;
    noLabel?: string;
}

export const FixedNavigationButtons: React.FC<FixedNavigationButtonsProps> = ({
    variant = 'default',
    onBack,
    onContinue,
    showBack = true,
    continueDisabled = false,
    isLastStep = false,
    onYes,
    onNo,
    yesLabel = 'Sim',
    noLabel = 'Não',
}) => {
    useThemeSubscription();
    if (variant === 'yesNo') {
        const buttonWidth = (SCREEN_WIDTH - 48) / 2 - 6;

        // Both choices are neutral by default; the cyan highlight appears ONLY
        // while the button is pressed (previously "Não" was permanently cyan,
        // which read as already-selected and confused users).
        const renderChoice = (label: string, onPress?: () => void) => (
            <Pressable
                style={({ pressed }) => [
                    styles.choiceButton,
                    { width: buttonWidth },
                    pressed && styles.choiceButtonPressed,
                ]}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={label}
            >
                {({ pressed }) => (
                    <Text style={[styles.choiceText, pressed && styles.choiceTextPressed]}>
                        {label}
                    </Text>
                )}
            </Pressable>
        );

        return (
            <View style={styles.container}>
                {renderChoice(yesLabel, onYes)}
                {renderChoice(noLabel, onNo)}
            </View>
        );
    }

    // Back now lives next to the progress bar (see OnboardingScreen header).
    // The footer holds a single full-width, centered primary action.
    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={[
                    styles.continueButton,
                    { width: SCREEN_WIDTH - 40 },
                    continueDisabled && styles.continueButtonDisabled,
                ]}
                onPress={onContinue}
                disabled={continueDisabled}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={isLastStep ? 'Finalizar' : 'Continuar'}
                accessibilityState={{ disabled: continueDisabled }}
            >
                <Text style={[
                    styles.continueText,
                    continueDisabled && styles.continueTextDisabled,
                ]}>
                    {isLastStep ? 'Finalizar' : 'Continuar'}
                </Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = createThemeStyles(() => ({
    container: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 12,
    },
    backButton: {
        height: 55,
        backgroundColor: semanticColors.surface2,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backText: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: semanticColors.textSecondary,
    },
    continueButton: {
        height: 55,
        backgroundColor: semanticColors.accent,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        ...elevation.md,
    },
    continueButtonDisabled: {
        backgroundColor: semanticColors.surface3,
        shadowOpacity: 0,
        elevation: 0,
    },
    continueText: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: semanticColors.textOnAccent,
    },
    continueTextDisabled: {
        color: semanticColors.textSecondary,
    },
    // yesNo variant — neutral by default, cyan only while pressed.
    choiceButton: {
        height: 52,
        backgroundColor: semanticColors.surface2,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        justifyContent: 'center',
        alignItems: 'center',
    },
    choiceButtonPressed: {
        backgroundColor: semanticColors.accentSubtle,
        borderColor: semanticColors.accent,
    },
    choiceText: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: semanticColors.textSecondary,
    },
    choiceTextPressed: {
        color: semanticColors.textPrimary,
    },
}));
