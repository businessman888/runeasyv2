import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
} from 'react-native';
import { DateWheelPicker } from '../../components/DateWheelPicker';

// Design System
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00D4FF',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
};

interface BirthDateValue {
    day: number;
    month: number;
    year: number;
}

interface BirthDateScreenProps {
    value?: BirthDateValue | null;
    onChange?: (value: BirthDateValue) => void;
}

export function BirthDateScreen({ value, onChange }: BirthDateScreenProps) {
    const [selectedDate, setSelectedDate] = useState<BirthDateValue>(
        value || { day: 15, month: 6, year: 1990 }
    );

    useEffect(() => {
        if (value) {
            setSelectedDate(value);
        }
    }, [value]);

    const handleDayChange = (day: number) => {
        const newDate = { ...selectedDate, day };
        setSelectedDate(newDate);
        if (onChange) {
            onChange(newDate);
        }
    };

    const handleMonthChange = (month: number) => {
        const newDate = { ...selectedDate, month };
        setSelectedDate(newDate);
        if (onChange) {
            onChange(newDate);
        }
    };

    const handleYearChange = (year: number) => {
        const newDate = { ...selectedDate, year };
        setSelectedDate(newDate);
        if (onChange) {
            onChange(newDate);
        }
    };

    const calculateAge = () => {
        const today = new Date();
        let age = today.getFullYear() - selectedDate.year;
        const monthDiff = today.getMonth() + 1 - selectedDate.month;
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < selectedDate.day)) {
            age--;
        }
        return age;
    };

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Qual a sua data de{'\n'}
                    <Text style={styles.titleHighlight}>nascimento?</Text>
                </Text>
                <Text style={styles.subtitle}>
                    Usamos sua idade para personalizar a intensidade dos treinos.
                </Text>
            </View>

            {/* Age Display */}
            <View style={styles.ageCard}>
                <Text style={styles.ageValue}>{calculateAge()}</Text>
                <Text style={styles.ageLabel}>anos</Text>
            </View>

            {/* Custom FlatList-based Wheel Picker - INLINE */}
            <View style={styles.pickerContainer}>
                <DateWheelPicker
                    day={selectedDate.day}
                    month={selectedDate.month}
                    year={selectedDate.year}
                    onDayChange={handleDayChange}
                    onMonthChange={handleMonthChange}
                    onYearChange={handleYearChange}
                />
            </View>

            {/* Info Tip */}
            <View style={styles.tipCard}>
                <Text style={styles.tipText}>
                    💡 Sua idade nos ajuda a calcular zonas de frequência cardíaca e adaptar a progressão do treino.
                </Text>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: DS.text,
        lineHeight: 32,
        marginBottom: 12,
    },
    titleHighlight: {
        color: DS.cyan,
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '400',
        color: DS.textSecondary,
        lineHeight: 22,
    },
    ageCard: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
        backgroundColor: DS.card,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderWidth: 2,
        borderColor: DS.cyan,
        shadowColor: DS.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 4,
    },
    ageValue: {
        fontSize: 48,
        fontWeight: '700',
        color: DS.cyan,
    },
    ageLabel: {
        fontSize: 20,
        fontWeight: '500',
        color: DS.textSecondary,
        marginLeft: 8,
    },
    pickerContainer: {
        marginBottom: 24,
    },
    tipCard: {
        backgroundColor: DS.card,
        borderRadius: 12,
        padding: 16,
    },
    tipText: {
        fontSize: 14,
        fontWeight: '400',
        color: DS.textSecondary,
        lineHeight: 20,
    },
});

export default BirthDateScreen;
