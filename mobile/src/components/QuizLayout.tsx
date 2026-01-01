import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    StatusBar,
    TouchableOpacity,
    ScrollView,
    Platform,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../theme';



interface QuizLayoutProps {
    currentStep: number;
    totalSteps: number;
    title: string;
    subtitle: string;
    children: React.ReactNode;
    onBack?: () => void;
    onNext: () => void;
    nextLabel?: string;
    nextDisabled?: boolean;
    isLoading?: boolean;
}

export function QuizLayout({
    currentStep,
    totalSteps,
    title,
    subtitle,
    children,
    onBack,
    onNext,
    nextLabel = 'Continuar',
    nextDisabled = false,
    isLoading = false,
}: QuizLayoutProps) {
    const progress = currentStep / totalSteps;



    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

            {/* Header with Progress */}
            <View style={styles.header}>
                <View style={styles.progressContainer}>
                    <Text style={styles.stepText}>
                        Passo <Text style={styles.stepHighlight}>{currentStep}</Text> DE {totalSteps}
                    </Text>


                </View>
            </View>

            {/* Content */}
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>

                <View style={styles.optionsContainer}>
                    {children}
                </View>
            </ScrollView>

            {/* Footer with Buttons */}
            <View style={styles.footer}>
                {onBack && currentStep > 1 && (
                    <TouchableOpacity style={styles.backButton} onPress={onBack}>
                        <Text style={styles.backButtonText}>Voltar</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={[
                        styles.nextButton,
                        nextDisabled && styles.nextButtonDisabled,
                        !onBack || currentStep === 1 ? styles.nextButtonFull : null,
                    ]}
                    onPress={onNext}
                    disabled={nextDisabled || isLoading}
                >
                    <Text style={styles.nextButtonText}>
                        {isLoading ? 'Gerando...' : nextLabel}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

// Reusable Option Card Component
interface OptionCardProps {
    icon?: string;
    label: string;
    description?: string;
    isSelected: boolean;
    onPress: () => void;
}

export function OptionCard({ icon, label, description, isSelected, onPress }: OptionCardProps) {
    return (
        <TouchableOpacity
            style={[styles.optionCard, isSelected && styles.optionCardSelected]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            {icon && <Text style={styles.optionIcon}>{icon}</Text>}
            <View style={styles.optionTextContainer}>
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {label}
                </Text>
                {description && (
                    <Text style={styles.optionDescription}>{description}</Text>
                )}
            </View>
            <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                {isSelected && <View style={styles.radioInner} />}
            </View>
        </TouchableOpacity>
    );
}

// Number Selector Component
interface NumberSelectorProps {
    min: number;
    max: number;
    value: number;
    onChange: (value: number) => void;
    unit: string;
}

export function NumberSelector({ min, max, value, onChange, unit }: NumberSelectorProps) {
    const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i);

    return (
        <View style={styles.numberSelectorContainer}>
            <Text style={styles.numberSelectorValue}>
                {value} <Text style={styles.numberSelectorUnit}>{unit}</Text>
            </Text>
            <View style={styles.numberButtons}>
                {numbers.map((num) => (
                    <TouchableOpacity
                        key={num}
                        style={[
                            styles.numberButton,
                            value === num && styles.numberButtonSelected,
                        ]}
                        onPress={() => onChange(num)}
                    >
                        <Text style={[
                            styles.numberButtonText,
                            value === num && styles.numberButtonTextSelected,
                        ]}>
                            {num}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    header: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
    },
    progressContainer: {
        gap: spacing.sm,
    },
    stepsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: spacing.sm,
        gap: 4,
    },
    stepItem: {
        flex: 1,
        alignItems: 'center',
        gap: spacing.xs,
    },
    iconContainer: {
        height: 32,
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: 4,
    },
    stepBar: {
        width: '100%',
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    stepBarActive: {
        backgroundColor: colors.primary,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 2,
    },
    stepText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(255, 255, 255, 0.5)',
        fontWeight: typography.fontWeights.medium,
        textTransform: 'uppercase',
    },
    stepHighlight: {
        color: colors.primary,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: spacing.lg,
        paddingTop: spacing['2xl'],
    },
    title: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.white,
        marginBottom: spacing.sm,
    },
    subtitle: {
        fontSize: typography.fontSizes.md,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: spacing['2xl'],
    },
    optionsContainer: {
        gap: spacing.md,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        padding: spacing.lg,
        borderRadius: borderRadius.xl,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    optionCardSelected: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
    },
    optionIcon: {
        fontSize: 32,
        marginRight: spacing.md,
    },
    optionTextContainer: {
        flex: 1,
    },
    optionLabel: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        color: colors.white,
    },
    optionLabelSelected: {
        color: colors.primary,
    },
    optionDescription: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 2,
    },
    radioOuter: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterSelected: {
        borderColor: colors.primary,
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.primary,
    },
    footer: {
        flexDirection: 'row',
        padding: spacing.lg,
        gap: spacing.md,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
    },
    backButton: {
        flex: 1,
        paddingVertical: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    backButtonText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.medium,
        color: colors.white,
    },
    nextButton: {
        flex: 2,
        paddingVertical: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.xl,
        backgroundColor: colors.primary,
    },
    nextButtonFull: {
        flex: 1,
    },
    nextButtonDisabled: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    nextButtonText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        color: '#0F172A',
    },
    // Number Selector Styles
    numberSelectorContainer: {
        alignItems: 'center',
        paddingVertical: spacing['2xl'],
    },
    numberSelectorValue: {
        fontSize: 64,
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
        marginBottom: spacing['2xl'],
    },
    numberSelectorUnit: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.medium,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    numberButtons: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    numberButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    numberButtonSelected: {
        backgroundColor: colors.primary,
    },
    numberButtonText: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.white,
    },
    numberButtonTextSelected: {
        color: '#0F172A',
    },
});
