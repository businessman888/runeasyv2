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
import { typography, spacing, borderRadius, createThemeStyles, useThemeSubscription, getThemeStatusBarStyle } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { useBreakpoint } from '../hooks/useBreakpoint';



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
    useThemeSubscription();
    const progress = currentStep / totalSteps;
    // Tablet: centraliza a coluna de leitura (quiz não estica a tela inteira).
    const { isTablet } = useBreakpoint();



    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />

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
                contentContainerStyle={[styles.contentContainer, isTablet && styles.contentContainerTablet]}
                showsVerticalScrollIndicator={false}
            >
                <View style={isTablet ? styles.tabletInner : undefined}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.subtitle}>{subtitle}</Text>

                    <View style={styles.optionsContainer}>
                        {children}
                    </View>
                </View>
            </ScrollView>

            {/* Footer with Buttons */}
            <View style={[styles.footer, isTablet && styles.footerTablet]}>
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
    useThemeSubscription();
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
    useThemeSubscription();
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

const styles = createThemeStyles(() => ({
    container: {
        flex: 1,
        backgroundColor: semanticColors.canvas,
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
        backgroundColor: semanticColors.borderSubtle,
    },
    stepBarActive: {
        backgroundColor: semanticColors.accent,
    },
    stepText: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textTertiary,
        fontWeight: typography.fontWeights.medium,
        textTransform: 'uppercase',
    },
    stepHighlight: {
        color: semanticColors.accent,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: spacing.lg,
        paddingTop: spacing['2xl'],
    },
    // Tablet: centraliza horizontalmente o conteúdo do scroll.
    contentContainerTablet: {
        alignItems: 'center',
    },
    tabletInner: {
        width: '100%',
        maxWidth: 560,
    },
    // Tablet: centraliza a barra de botões na mesma largura do conteúdo.
    footerTablet: {
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
    },
    title: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: semanticColors.textPrimary,
        marginBottom: spacing.sm,
    },
    subtitle: {
        fontSize: typography.fontSizes.md,
        color: semanticColors.textSecondary,
        marginBottom: spacing['2xl'],
    },
    optionsContainer: {
        gap: spacing.md,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: semanticColors.glass,
        padding: spacing.lg,
        borderRadius: borderRadius.xl,
        borderWidth: 2,
        borderColor: semanticColors.transparent,
    },
    optionCardSelected: {
        borderColor: semanticColors.accent,
        backgroundColor: semanticColors.accentSubtle,
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
        color: semanticColors.textPrimary,
    },
    optionLabelSelected: {
        color: semanticColors.accent,
    },
    optionDescription: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textTertiary,
        marginTop: 2,
    },
    radioOuter: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: semanticColors.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterSelected: {
        borderColor: semanticColors.accent,
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: semanticColors.accent,
    },
    footer: {
        flexDirection: 'row',
        padding: spacing.lg,
        gap: spacing.md,
        borderTopWidth: 1,
        borderTopColor: semanticColors.borderSubtle,
    },
    backButton: {
        flex: 1,
        paddingVertical: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: semanticColors.borderStrong,
    },
    backButtonText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.medium,
        color: semanticColors.textPrimary,
    },
    nextButton: {
        flex: 2,
        paddingVertical: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.xl,
        backgroundColor: semanticColors.accent,
    },
    nextButtonFull: {
        flex: 1,
    },
    nextButtonDisabled: {
        backgroundColor: semanticColors.surface3,
    },
    nextButtonText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        color: semanticColors.textOnAccent,
    },
    // Number Selector Styles
    numberSelectorContainer: {
        alignItems: 'center',
        paddingVertical: spacing['2xl'],
    },
    numberSelectorValue: {
        fontSize: 64,
        fontWeight: typography.fontWeights.bold,
        color: semanticColors.accent,
        marginBottom: spacing['2xl'],
    },
    numberSelectorUnit: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.medium,
        color: semanticColors.textTertiary,
    },
    numberButtons: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    numberButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: semanticColors.surface3,
        alignItems: 'center',
        justifyContent: 'center',
    },
    numberButtonSelected: {
        backgroundColor: semanticColors.accent,
    },
    numberButtonText: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: semanticColors.textPrimary,
    },
    numberButtonTextSelected: {
        color: semanticColors.textOnAccent,
    },
}));
