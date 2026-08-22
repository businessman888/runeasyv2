import React from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Dimensions } from 'react-native';
import { fonts } from '../theme';
import { semanticColors } from '../theme/semanticColors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================
// SEMANTIC COLOR ALIASES
// ============================================
const FORCED_BG_DARK = semanticColors.textOnAccent;
const FORCED_BACK_BG = semanticColors.surface2;
const FORCED_CYAN = semanticColors.accent;
const FORCED_CYAN_MUTED = semanticColors.accentSubtle;
const FORCED_TEXT = semanticColors.textPrimary;
const FORCED_TEXT_SECONDARY = semanticColors.textSecondary;
const FORCED_GLASS_STROKE = semanticColors.borderSubtle;

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

const styles = StyleSheet.create({
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
        backgroundColor: FORCED_BACK_BG,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backText: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: FORCED_TEXT_SECONDARY,
    },
    continueButton: {
        height: 55,
        backgroundColor: FORCED_CYAN,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: semanticColors.canvas,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 8,
    },
    continueButtonDisabled: {
        backgroundColor: semanticColors.surface3,
        shadowOpacity: 0,
        elevation: 0,
    },
    continueText: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: FORCED_BG_DARK,
    },
    continueTextDisabled: {
        color: FORCED_TEXT_SECONDARY,
    },
    // yesNo variant — neutral by default, cyan only while pressed.
    choiceButton: {
        height: 52,
        backgroundColor: FORCED_BACK_BG,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: FORCED_GLASS_STROKE,
        justifyContent: 'center',
        alignItems: 'center',
    },
    choiceButtonPressed: {
        backgroundColor: FORCED_CYAN_MUTED,
        borderColor: FORCED_CYAN,
    },
    choiceText: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: FORCED_TEXT_SECONDARY,
    },
    choiceTextPressed: {
        color: FORCED_TEXT,
    },
});
