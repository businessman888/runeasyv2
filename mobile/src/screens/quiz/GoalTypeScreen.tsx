import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, borderRadius } from '../../theme';
import { OptionCard } from '../../components/onboarding/OptionCard';

type GoalType = 'distance' | 'race';

const RadioButton = ({ selected }: { selected: boolean }) => (
    <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
    </View>
);

const IconBox = ({ name }: { name: keyof typeof Ionicons.glyphMap }) => (
    <View style={styles.iconBox}>
        <Ionicons name={name} size={24} color={colors.textLight} />
    </View>
);

interface GoalTypeOption {
    id: GoalType;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
}

const OPTIONS: GoalTypeOption[] = [
    {
        id: 'distance',
        icon: <IconBox name="location-outline" />,
        title: 'Distância',
        subtitle: 'Treinar progressivamente até minha meta',
    },
    {
        id: 'race',
        icon: <IconBox name="flag" />,
        title: 'Tenho uma prova',
        subtitle: 'Me preparar para uma corrida específica',
    },
];

interface GoalTypeScreenProps {
    value?: GoalType | null;
    onChange?: (value: GoalType) => void;
}

export function GoalTypeScreen({ value, onChange }: GoalTypeScreenProps) {
    const [selected, setSelected] = useState<GoalType | null>(value ?? null);

    useEffect(() => {
        setSelected(value ?? null);
    }, [value]);

    const handleSelect = (option: GoalTypeOption) => {
        setSelected(option.id);
        onChange?.(option.id);
    };

    return (
        <>
            <View style={styles.titleContainer}>
                <Text style={styles.title}>Qual a sua meta{'\n'}principal?</Text>
                <Text style={styles.subtitle}>
                    Isso ajuda o Coach AI a montar o{'\n'}plano ideal para você.
                </Text>
            </View>

            <View style={styles.optionsContainer}>
                {OPTIONS.map((option) => (
                    <OptionCard
                        key={option.id}
                        selected={selected === option.id}
                        onPress={() => handleSelect(option)}
                        accessibilityLabel={`${option.title}, ${option.subtitle}`}
                        style={styles.optionCard}
                        selectedStyle={styles.optionCardSelected}
                    >
                        {option.icon}
                        <View style={styles.optionTextContainer}>
                            <Text style={styles.optionTitle}>{option.title}</Text>
                            <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                        </View>
                        <RadioButton selected={selected === option.id} />
                    </OptionCard>
                ))}
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: { marginBottom: 24 },
    title: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        lineHeight: 36,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        lineHeight: 22,
    },
    optionsContainer: { gap: 12 },
    iconBox: {
        width: 47,
        height: 47,
        borderRadius: 10,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: 12,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    optionCardSelected: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(0, 212, 255, 0.08)',
    },
    optionTextContainer: { flex: 1, marginLeft: 12 },
    optionTitle: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.semibold,
        color: colors.text,
        marginBottom: 2,
    },
    optionSubtitle: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
    },
    radioOuter: {
        width: 30,
        height: 30,
        borderRadius: borderRadius.full,
        borderWidth: 2,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterSelected: { borderColor: colors.primary },
    radioInner: {
        width: 18,
        height: 18,
        borderRadius: borderRadius.full,
        backgroundColor: colors.primary,
    },
});

export default GoalTypeScreen;
