import React, { useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius } from '../../theme';

interface AvailableDaysScreenProps {
    value: number[]; // 0=DOM, 1=SEG, ..., 6=SAB
    onChange: (days: number[]) => void;
}

const DAYS = [
    { key: 0, label: 'DOM' },
    { key: 1, label: 'SEG' },
    { key: 2, label: 'TER' },
    { key: 3, label: 'QUA' },
    { key: 4, label: 'QUI' },
    { key: 5, label: 'SEX' },
    { key: 6, label: 'SAB' },
];

export const AvailableDaysScreen: React.FC<AvailableDaysScreenProps> = ({
    value,
    onChange,
}) => {
    // Check for consecutive days without rest
    const hasConsecutiveDays = useMemo(() => {
        if (value.length < 3) return false;

        const sorted = [...value].sort((a, b) => a - b);
        let consecutiveCount = 1;

        for (let i = 0; i < sorted.length - 1; i++) {
            // Check for normal consecutive or wrap-around (SAB->DOM)
            if (sorted[i + 1] - sorted[i] === 1 ||
                (sorted[i] === 6 && sorted[0] === 0)) {
                consecutiveCount++;
                if (consecutiveCount >= 3) return true;
            } else {
                consecutiveCount = 1;
            }
        }
        return false;
    }, [value]);

    const toggleDay = (day: number) => {
        if (value.includes(day)) {
            onChange(value.filter(d => d !== day));
        } else {
            onChange([...value, day]);
        }
    };

    const isDaySelected = (day: number) => value.includes(day);

    // Generate feedback message
    const feedbackMessage = useMemo(() => {
        if (value.length === 0) {
            return 'Selecione os dias que você tem disponíveis para treinar.';
        }

        if (hasConsecutiveDays) {
            return `Você selecionou ${value.length} dias para treinar. Recomendamos um dia de descanso entre treinos intensos para melhor recuperação.`;
        }

        return `Você selecionou os ${value.length} dias para treinar, Ótimo! Você está respeitando os dias de descanso para uma boa recuperação.`;
    }, [value.length, hasConsecutiveDays]);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>
                    Quais destes dias da{'\n'}semana você tem{'\n'}
                    <Text style={styles.titleHighlight}>disponíveis</Text> para treinar?
                </Text>
            </View>

            {/* Days Pills */}
            <View style={styles.content}>
                <View style={styles.daysRow}>
                    {DAYS.map((day) => (
                        <TouchableOpacity
                            key={day.key}
                            style={[
                                styles.dayPill,
                                isDaySelected(day.key) && styles.dayPillSelected,
                            ]}
                            onPress={() => toggleDay(day.key)}
                            activeOpacity={0.7}
                        >
                            <Text style={[
                                styles.dayText,
                                isDaySelected(day.key) && styles.dayTextSelected,
                            ]}>
                                {day.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Feedback Card */}
                {value.length > 0 && (
                    <View style={[
                        styles.feedbackCard,
                        hasConsecutiveDays && styles.feedbackCardWarning,
                    ]}>
                        <View style={styles.feedbackIcon}>
                            <Ionicons
                                name={hasConsecutiveDays ? 'warning' : 'bulb'}
                                size={24}
                                color={hasConsecutiveDays ? colors.warning : colors.primary}
                            />
                        </View>
                        <View style={styles.feedbackContent}>
                            <Text style={styles.feedbackText}>
                                {feedbackMessage.split(hasConsecutiveDays ? 'Recomendamos' : 'Ótimo').map((part, i) => {
                                    if (i === 0) {
                                        return (
                                            <Text key={i}>
                                                {part.includes(`${value.length} dias`) ? (
                                                    <>
                                                        Você selecionou os{' '}
                                                        <Text style={styles.feedbackHighlight}>{value.length} dias</Text>
                                                        {' '}para treinar
                                                        {!hasConsecutiveDays && ', '}
                                                    </>
                                                ) : part}
                                            </Text>
                                        );
                                    }
                                    return (
                                        <Text key={i}>
                                            {hasConsecutiveDays ? 'Recomendamos' : 'Ótimo'}
                                            {part}
                                        </Text>
                                    );
                                })}
                            </Text>
                        </View>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 25,
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.textLight,
        lineHeight: 32,
    },
    titleHighlight: {
        color: colors.primary,
    },
    content: {
        flex: 1,
        paddingHorizontal: 11,
    },
    daysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 16,
    },
    dayPill: {
        paddingHorizontal: 6,
        paddingVertical: 10,
        minWidth: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayPillSelected: {
        backgroundColor: 'rgba(0,127,153,0.3)',
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: 10,
    },
    dayText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textLight,
    },
    dayTextSelected: {
        color: colors.primary,
    },
    feedbackCard: {
        flexDirection: 'row',
        backgroundColor: '#1C1C2E',
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: 15,
        padding: 16,
        marginTop: 60,
    },
    feedbackCardWarning: {
        borderColor: colors.warning,
    },
    feedbackIcon: {
        width: 40,
        alignItems: 'center',
        paddingTop: 4,
    },
    feedbackContent: {
        flex: 1,
        paddingLeft: 8,
    },
    feedbackText: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(235,235,245,0.6)',
        lineHeight: 20,
    },
    feedbackHighlight: {
        color: colors.primary,
    },
});

export default AvailableDaysScreen;
