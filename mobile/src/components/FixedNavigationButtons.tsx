import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, borderRadius, shadows } from '../theme';

interface FixedNavigationButtonsProps {
    onBack: () => void;
    onContinue: () => void;
    showBack: boolean;
    continueDisabled: boolean;
    isLastStep: boolean;
    isSubmitting?: boolean;
}

export function FixedNavigationButtons({
    onBack,
    onContinue,
    showBack,
    continueDisabled,
    isLastStep,
    isSubmitting = false,
}: FixedNavigationButtonsProps) {
    const continueText = isSubmitting
        ? 'Criando plano...'
        : isLastStep
            ? 'Criar meu plano'
            : 'Continuar';

    return (
        <View style={styles.container}>
            {showBack && (
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={onBack}
                    activeOpacity={0.7}
                >
                    <Text style={styles.backButtonText}>Voltar</Text>
                </TouchableOpacity>
            )}

            <TouchableOpacity
                style={[
                    styles.continueButton,
                    !showBack && styles.continueButtonFull,
                    continueDisabled && styles.continueButtonDisabled
                ]}
                onPress={onContinue}
                disabled={continueDisabled || isSubmitting}
                activeOpacity={0.7}
            >
                <Text style={[
                    styles.continueButtonText,
                    continueDisabled && styles.continueButtonTextDisabled
                ]}>{continueText}</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 16,
        paddingTop: 12,
        gap: 12,
        backgroundColor: colors.background,
    },
    backButton: {
        flex: 1,
        height: 56,
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    backButtonText: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.medium,
        color: colors.textSecondary,
    },
    continueButton: {
        flex: 1,
        height: 56,
        backgroundColor: colors.primary,
        borderRadius: borderRadius['2xl'],
        alignItems: 'center',
        justifyContent: 'center',
        ...shadows.neon,
    },
    continueButtonFull: {
        flex: 1,
    },
    continueButtonDisabled: {
        backgroundColor: colors.card,
        opacity: 0.6,
        ...shadows.sm,
    },
    continueButtonText: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.semibold,
        color: colors.background,
    },
    continueButtonTextDisabled: {
        color: colors.textMuted,
    },
});
