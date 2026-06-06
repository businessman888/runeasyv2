import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================
// FORCED COLORS (Figma exact values)
// ============================================
const FORCED_BG_DARK = '#0F0F1E';     // Dark background for text on cyan
const FORCED_BACK_BG = '#1C1C2E';     // Back / "Sim" button background
const FORCED_CYAN = '#00D4FF';        // Accent cyan
const FORCED_CYAN_MUTED = 'rgba(0, 127, 153, 0.3)'; // "Não" translucent cyan
const FORCED_TEXT = '#EBEBF5';
const FORCED_TEXT_SECONDARY = 'rgba(235, 235, 245, 0.6)';

type Variant = 'default' | 'yesNo';

interface FixedNavigationButtonsProps {
    variant?: Variant;
    // default variant
    onBack?: () => void;
    onContinue?: () => void;
    showBack?: boolean;
    continueDisabled?: boolean;
    isLastStep?: boolean;
    // yesNo variant (Figma 867:645)
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
        return (
            <View style={styles.container}>
                <TouchableOpacity
                    style={[styles.yesButton, { width: buttonWidth }]}
                    onPress={onYes}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={yesLabel}
                >
                    <Text style={styles.yesText}>{yesLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.noButton, { width: buttonWidth }]}
                    onPress={onNo}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={noLabel}
                >
                    <Text style={styles.noText}>{noLabel}</Text>
                </TouchableOpacity>
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
        fontFamily: 'Poppins-Medium',
        fontSize: 18,
        fontWeight: '500',
        color: FORCED_TEXT_SECONDARY,
    },
    continueButton: {
        height: 55,
        backgroundColor: FORCED_CYAN,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: FORCED_CYAN,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 8,
    },
    continueButtonDisabled: {
        backgroundColor: '#1C1C2E',
        shadowOpacity: 0,
        elevation: 0,
    },
    continueText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 18,
        fontWeight: '500',
        color: FORCED_BG_DARK,
    },
    continueTextDisabled: {
        color: FORCED_TEXT_SECONDARY,
    },
    // yesNo variant (Figma 867:645)
    yesButton: {
        height: 44,
        backgroundColor: FORCED_BACK_BG,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    yesText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 18,
        fontWeight: '500',
        color: FORCED_TEXT_SECONDARY,
    },
    noButton: {
        height: 44,
        backgroundColor: FORCED_CYAN_MUTED,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: FORCED_CYAN,
        justifyContent: 'center',
        alignItems: 'center',
    },
    noText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 18,
        fontWeight: '500',
        color: FORCED_TEXT,
    },
});
