import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

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
                <Text style={styles.continueButtonText}>{continueText}</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        paddingHorizontal: 11,
        paddingBottom: 12,
        paddingTop: 12,
        gap: 11,
    },
    backButton: {
        flex: 1,
        height: 55,
        backgroundColor: '#1C1C2E',
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    backButtonText: {
        fontSize: 18,
        fontWeight: '500',
        fontFamily: 'Poppins',
        color: 'rgba(235, 235, 245, 0.6)',
    },
    continueButton: {
        flex: 1,
        height: 55,
        backgroundColor: '#15152A',
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    continueButtonFull: {
        flex: 1,
    },
    continueButtonDisabled: {
        opacity: 0.5,
    },
    continueButtonText: {
        fontSize: 18,
        fontWeight: '500',
        fontFamily: 'Poppins',
        color: '#00D4FF',
    },
});
