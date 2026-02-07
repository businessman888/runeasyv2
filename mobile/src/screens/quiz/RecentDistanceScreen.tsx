import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { colors, typography, borderRadius, shadows } from '../../theme';
import Svg, { Path, Rect } from 'react-native-svg';

const DISTANCES = [
    { id: '3k', value: 3, label: '3 km', description: 'Iniciante' },
    { id: '5k', value: 5, label: '5 km', description: 'Popular' },
    { id: '10k', value: 10, label: '10 km', description: 'Intermediário' },
    { id: '15k', value: 15, label: '15+ km', description: 'Avançado' },
];

// Running Icon
const RunningIcon = ({ size = 32 }: { size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M13.5 5.5C14.59 5.5 15.5 4.59 15.5 3.5C15.5 2.41 14.59 1.5 13.5 1.5C12.41 1.5 11.5 2.41 11.5 3.5C11.5 4.59 12.41 5.5 13.5 5.5ZM9.89 19.38L10.89 15L13 17V23H15V15.5L12.89 13.5L13.5 10.5C14.79 12 16.79 13 19 13V11C17.09 11 15.5 10 14.69 8.58L13.69 7C13.29 6.38 12.69 6 12 6C11.69 6 11.5 6.08 11.19 6.15L6 8.3V13H8V9.6L9.8 8.9L8.39 15.3L4 14.2L3.5 16.1L9.89 19.38Z"
            fill={colors.primary}
        />
    </Svg>
);

interface RecentDistanceScreenProps {
    value?: number | null;
    onChange?: (value: number) => void;
}

export function RecentDistanceScreen({ value, onChange }: RecentDistanceScreenProps) {
    const [selectedDistance, setSelectedDistance] = useState<number | null>(value ?? null);

    useEffect(() => {
        if (value !== undefined) {
            setSelectedDistance(value);
        }
    }, [value]);

    const handleDistanceSelect = (distance: number) => {
        setSelectedDistance(distance);
        if (onChange) {
            onChange(distance);
        }
    };

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Qual foi a maior distância{'\n'}
                    <Text style={styles.titleHighlight}>que você correu recentemente?</Text>
                </Text>
                <Text style={styles.subtitle}>
                    Isso nos ajuda a calibrar o ponto de partida do seu plano.
                </Text>
            </View>

            {/* Distance Options */}
            <View style={styles.optionsContainer}>
                {DISTANCES.map((distance) => (
                    <TouchableOpacity
                        key={distance.id}
                        style={[
                            styles.optionCard,
                            selectedDistance === distance.value && styles.optionCardSelected
                        ]}
                        onPress={() => handleDistanceSelect(distance.value)}
                        activeOpacity={0.7}
                    >
                        <View style={[
                            styles.iconContainer,
                            selectedDistance === distance.value && styles.iconContainerSelected
                        ]}>
                            <RunningIcon />
                        </View>
                        <View style={styles.textContainer}>
                            <Text style={[
                                styles.distanceLabel,
                                selectedDistance === distance.value && styles.distanceLabelSelected
                            ]}>
                                {distance.label}
                            </Text>
                            <Text style={styles.distanceDescription}>
                                {distance.description}
                            </Text>
                        </View>
                        <View style={[
                            styles.radio,
                            selectedDistance === distance.value && styles.radioSelected
                        ]}>
                            {selectedDistance === distance.value && (
                                <View style={styles.radioInner} />
                            )}
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Info */}
            <View style={styles.infoCard}>
                <Text style={styles.infoText}>
                    🏃 Não se preocupe se foi há algum tempo. Usamos essa informação como referência inicial.
                </Text>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 32,
    },
    title: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        lineHeight: 40,
        marginBottom: 12,
    },
    titleHighlight: {
        color: colors.primary,
    },
    subtitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        lineHeight: 24,
    },
    optionsContainer: {
        gap: 12,
        marginBottom: 24,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: 16,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    optionCardSelected: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(0, 212, 255, 0.08)',
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: borderRadius.lg,
        backgroundColor: colors.highlight,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    iconContainerSelected: {
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
    },
    textContainer: {
        flex: 1,
    },
    distanceLabel: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        marginBottom: 2,
    },
    distanceLabelSelected: {
        color: colors.primary,
    },
    distanceDescription: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
    },
    radio: {
        width: 24,
        height: 24,
        borderRadius: borderRadius.full,
        borderWidth: 2,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioSelected: {
        borderColor: colors.primary,
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: borderRadius.full,
        backgroundColor: colors.primary,
    },
    infoCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: 16,
    },
    infoText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        lineHeight: 20,
    },
});

export default RecentDistanceScreen;
