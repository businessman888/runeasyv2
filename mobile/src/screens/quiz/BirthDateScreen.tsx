import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { colors, typography, borderRadius, shadows } from '../../theme';
import { WheelPickerModal } from '../../components/WheelPickerModal';

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
    const [isModalVisible, setIsModalVisible] = useState(false);

    useEffect(() => {
        if (value) {
            setSelectedDate(value);
        }
    }, [value]);

    const handleConfirm = (selection: { day: number; month: number; year: number }) => {
        // Modal returns 0-indexed month, we store 1-indexed
        const newDate = { day: selection.day, month: selection.month + 1, year: selection.year };
        setSelectedDate(newDate);
        setIsModalVisible(false);
        if (onChange) {
            onChange(newDate);
        }
    };

    const formatDate = () => {
        const months = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        return `${selectedDate.day} de ${months[selectedDate.month - 1]} de ${selectedDate.year}`;
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

            {/* Date Display Card */}
            <TouchableOpacity
                style={styles.dateCard}
                onPress={() => setIsModalVisible(true)}
                activeOpacity={0.7}
            >
                <View style={styles.dateContent}>
                    <Text style={styles.dateText}>{formatDate()}</Text>
                    <Text style={styles.ageText}>{calculateAge()} anos</Text>
                </View>
                <View style={styles.editIcon}>
                    <Text style={styles.editIconText}>✎</Text>
                </View>
            </TouchableOpacity>

            {/* Info Tip */}
            <View style={styles.tipCard}>
                <Text style={styles.tipText}>
                    💡 Sua idade nos ajuda a calcular zonas de frequência cardíaca e adaptar a progressão do treino.
                </Text>
            </View>

            {/* Wheel Picker Modal */}
            <WheelPickerModal
                visible={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                onConfirm={handleConfirm}
                initialValue={{ day: selectedDate.day, month: selectedDate.month - 1, year: selectedDate.year }}
            />
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
    dateCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: 20,
        marginBottom: 24,
        borderWidth: 2,
        borderColor: colors.primary,
        ...shadows.neon,
    },
    dateContent: {
        flex: 1,
    },
    dateText: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.semibold,
        color: colors.text,
        marginBottom: 4,
    },
    ageText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: colors.primary,
    },
    editIcon: {
        width: 44,
        height: 44,
        borderRadius: borderRadius.full,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editIconText: {
        fontSize: 20,
        color: colors.background,
    },
    tipCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: 16,
    },
    tipText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        lineHeight: 20,
    },
});

export default BirthDateScreen;
