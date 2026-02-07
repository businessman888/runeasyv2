import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
} from 'react-native';
import { colors, borderRadius } from '../../theme';

interface IntenseDayScreenProps {
    availableDays: number[]; // Days selected in previous screen
    value: number | null;
    onChange: (day: number) => void;
}

const DAY_NAMES: Record<number, string> = {
    0: 'Domingo',
    1: 'Segunda-feira',
    2: 'Terça-feira',
    3: 'Quarta-feira',
    4: 'Quinta-feira',
    5: 'Sexta-feira',
    6: 'Sábado',
};

export const IntenseDayScreen: React.FC<IntenseDayScreenProps> = ({
    availableDays,
    value,
    onChange,
}) => {
    const isDaySelected = (day: number) => value === day;

    // Sort days to display in order
    const sortedDays = [...availableDays].sort((a, b) => a - b);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>
                    Qual o seu <Text style={styles.titleHighlight}>melhor dia</Text>
                    {'\n'}para o treino mais{'\n'}intenso da semana?
                </Text>
            </View>

            {/* Options */}
            <ScrollView
                style={styles.optionsContainer}
                contentContainerStyle={styles.optionsContent}
                showsVerticalScrollIndicator={false}
            >
                {sortedDays.map((day) => (
                    <TouchableOpacity
                        key={day}
                        style={[
                            styles.optionCard,
                            isDaySelected(day) && styles.optionCardSelected,
                        ]}
                        onPress={() => onChange(day)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.optionText}>{DAY_NAMES[day]}</Text>
                        <View style={[
                            styles.radioOuter,
                            isDaySelected(day) && styles.radioOuterSelected,
                        ]}>
                            {isDaySelected(day) && <View style={styles.radioInner} />}
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
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
    optionsContainer: {
        flex: 1,
    },
    optionsContent: {
        paddingHorizontal: 11,
        paddingVertical: 5,
        gap: 12,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1C1C2E',
        borderRadius: 15,
        paddingVertical: 18,
        paddingHorizontal: 28,
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    optionCardSelected: {
        backgroundColor: 'rgba(0,127,153,0.3)',
        borderWidth: 1,
        borderColor: colors.primary,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
    },
    optionText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textLight,
    },
    radioOuter: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: 'rgba(235,235,245,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterSelected: {
        borderColor: colors.primary,
    },
    radioInner: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.primary,
    },
});

export default IntenseDayScreen;
