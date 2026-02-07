import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================
// FORCED COLORS (Figma exact values from node 428-464)
// ============================================
const FORCED_BG_DARK = '#0F0F1E';     // Dark background for text on cyan
const FORCED_BACK_BG = '#1C1C2E';     // Back button background
const FORCED_CYAN = '#00D4FF';        // Accent cyan - MAIN HIGHLIGHT
const FORCED_TEXT_SECONDARY = 'rgba(235, 235, 245, 0.6)'; // Back button text

interface FixedNavigationButtonsProps {
    onBack?: () => void;
    onContinue: () => void;
    showBack?: boolean;
    continueDisabled?: boolean;
    isLastStep?: boolean;
}

export const FixedNavigationButtons: React.FC<FixedNavigationButtonsProps> = ({
    onBack,
    onContinue,
    showBack = true,
    continueDisabled = false,
    isLastStep = false,
}) => {
    const buttonWidth = showBack ? (SCREEN_WIDTH - 48) / 2 - 6 : SCREEN_WIDTH - 48;

    return (
        <View style={styles.container}>
            {/* Back Button - Only show if showBack is true */}
            {showBack && (
                <TouchableOpacity
                    style={[styles.backButton, { width: buttonWidth }]}
                    onPress={onBack}
                    activeOpacity={0.7}
                >
                    <Text style={styles.backText}>Voltar</Text>
                </TouchableOpacity>
            )}

            {/* Continue Button */}
            <TouchableOpacity
                style={[
                    styles.continueButton,
                    { width: buttonWidth },
                    continueDisabled && styles.continueButtonDisabled,
                ]}
                onPress={onContinue}
                disabled={continueDisabled}
                activeOpacity={0.7}
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
        // CYAN BACKGROUND for contrast (main highlight)
        backgroundColor: FORCED_CYAN,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        // Neon shadow effect
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
        // DARK TEXT on cyan background for contrast
        color: FORCED_BG_DARK,
    },
    continueTextDisabled: {
        color: FORCED_TEXT_SECONDARY,
    },
});
