import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatRaceDateLong, weeksUntilRace } from '../../utils/raceFormat';
import { fonts } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

const GOLD = '#FFB800';

interface RaceCountdownBadgeProps {
    raceName?: string | null;
    raceDate: string; // 'YYYY-MM-DD'
    raceDistance?: number | null;
}

export function RaceCountdownBadge({ raceName, raceDate, raceDistance }: RaceCountdownBadgeProps) {
    const weeks = weeksUntilRace(raceDate);

    return (
        <View style={styles.card}>
            <View style={styles.row}>
                <MaterialCommunityIcons name="flag-checkered" size={20} color={GOLD} />
                <Text style={styles.name} numberOfLines={1}>
                    {raceName || 'Sua prova'}
                </Text>
            </View>
            <View style={styles.row}>
                <MaterialCommunityIcons name="calendar" size={18} color={GOLD} />
                <Text style={styles.detail}>
                    {formatRaceDateLong(raceDate)}
                    {raceDistance ? ` · ${raceDistance}km` : ''}
                </Text>
            </View>
            <View style={styles.row}>
                <MaterialCommunityIcons name="timer-outline" size={18} color={GOLD} />
                <Text style={styles.detail}>
                    {weeks} {weeks === 1 ? 'semana' : 'semanas'} até o dia D
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(255,184,0,0.1)',
        borderWidth: 1,
        borderColor: GOLD,
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        gap: 8,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    name: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: semanticColors.textPrimary,
        flex: 1,
    },
    detail: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: semanticColors.textSecondary,
        flex: 1,
    },
});

export default RaceCountdownBadge;
