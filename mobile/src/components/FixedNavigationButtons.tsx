import React from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Dimensions } from 'react-native';
import { fonts } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================
// FORCED COLORS (Figma exact values)
// ============================================
const FORCED_BG_DARK = '#0F0F1E';     // Dark background for text on cyan
const FORCED_BACK_BG = '#1C1C2E';     // Neutral button background (Back / Sim / Não)
const FORCED_CYAN = '#00D4FF';        // Accent cyan
const FORCED_CYAN_MUTED = 'rgba(0, 127, 153, 0.3)'; // Pressed translucent cyan fill
const FORCED_TEXT = '#EBEBF5';
const FORCED_TEXT_SECONDARY = 'rgba(235, 235, 245, 0.6)';
const FORCED_GLASS_STROKE = 'rgba(235, 235, 245, 0.1)';

type Variant = 'default' | 'yesNo' | 'primarySecondary';

interface FixedNavigationButtonsProps {
    variant?: Variant;
    // default variant
    onBack?: () => void;
    onContinue?: () => void;
    showBack?: boolean;
    continueDisabled?: boolean;
    isLastStep?: boolean;
    // yesNo / primarySecondary variants
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
    if (variant === 'primarySecondary') {
        // CTA empilhado (Figma screenStepCoachAudio 1622:1916): ação desejada em
        // destaque cyan full-width + alternativa neutra "ghost" abaixo. Usado quando
        // as opções NÃO são simétricas (ativar vs. agora não) e o rótulo é longo —
        // não caberia num pill lado-a-lado. Reusa os estilos primário/secundário.
        const btnWidth = SCREEN_WIDTH - 40;
        return (
            <View style={styles.stackContainer}>
                <TouchableOpacity
                    style={[styles.softPrimaryButton, { width: btnWidth }]}
                    onPress={onYes}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={yesLabel}
                >
                    <Text style={styles.softPrimaryText}>{yesLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.secondaryButton, { width: btnWidth }]}
                    onPress={onNo}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={noLabel}
                >
                    <Text style={styles.secondaryText}>{noLabel}</Text>
                </TouchableOpacity>
            </View>
        );
    }

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
    // primarySecondary variant — CTA "soft" (cyan translúcido + texto cyan) empilhado
    // sobre a alternativa neutra. Segue o Figma screenStepCoachAudio 1622:1916 (mesma
    // linguagem do estado "ativado" da CoachAudioSettingsScreen), não o cyan sólido.
    stackContainer: {
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 10,
    },
    softPrimaryButton: {
        height: 55,
        backgroundColor: 'rgba(0, 212, 255, 0.12)',
        borderRadius: 40,
        borderWidth: 1,
        borderColor: FORCED_CYAN,
        justifyContent: 'center',
        alignItems: 'center',
    },
    softPrimaryText: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: FORCED_CYAN,
    },
    secondaryButton: {
        height: 52,
        backgroundColor: FORCED_BACK_BG,
        borderRadius: 40,
        borderWidth: 1,
        borderColor: FORCED_GLASS_STROKE,
        justifyContent: 'center',
        alignItems: 'center',
    },
    secondaryText: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: FORCED_TEXT_SECONDARY,
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
