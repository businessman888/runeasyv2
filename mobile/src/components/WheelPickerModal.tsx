import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors, typography, borderRadius } from '../theme';

interface WheelPickerModalProps {
    visible: boolean;
    onCancel: () => void;
    onConfirm: (selection: { day: number; month: number; year: number }) => void;
    initialValue?: { day: number; month: number; year: number };
}

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
};

export const WheelPickerModal: React.FC<WheelPickerModalProps> = ({
    visible,
    onCancel,
    onConfirm,
    initialValue,
}) => {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 80 }, (_, i) => currentYear - 10 - i);

    const [selectedDay, setSelectedDay] = useState(initialValue?.day || 1);
    const [selectedMonth, setSelectedMonth] = useState(initialValue?.month || 0);
    const [selectedYear, setSelectedYear] = useState(initialValue?.year || 2000);

    const daysInMonth = getDaysInMonth(selectedMonth, selectedYear);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    useEffect(() => {
        if (selectedDay > daysInMonth) {
            setSelectedDay(daysInMonth);
        }
    }, [selectedMonth, selectedYear, daysInMonth]);

    useEffect(() => {
        if (initialValue) {
            setSelectedDay(initialValue.day);
            setSelectedMonth(initialValue.month);
            setSelectedYear(initialValue.year);
        }
    }, [initialValue]);

    const handleConfirm = () => {
        onConfirm({ day: selectedDay, month: selectedMonth, year: selectedYear });
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onCancel}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onCancel} style={styles.headerButton}>
                            <Text style={styles.cancelText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleConfirm} style={styles.headerButton}>
                            <Text style={styles.confirmText}>Confirmar</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Picker Labels */}
                    <View style={styles.labelsRow}>
                        <Text style={styles.label}>Dia</Text>
                        <Text style={styles.label}>Mês</Text>
                        <Text style={styles.label}>Ano</Text>
                    </View>

                    {/* Pickers */}
                    <View style={styles.pickersRow}>
                        {/* Day Picker */}
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={selectedDay}
                                onValueChange={(value) => setSelectedDay(value)}
                                style={styles.picker}
                                itemStyle={styles.pickerItem}
                            >
                                {days.map((day) => (
                                    <Picker.Item
                                        key={day}
                                        label={day.toString().padStart(2, '0')}
                                        value={day}
                                        color={colors.textLight}
                                    />
                                ))}
                            </Picker>
                        </View>

                        {/* Month Picker */}
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={selectedMonth}
                                onValueChange={(value) => setSelectedMonth(value)}
                                style={styles.picker}
                                itemStyle={styles.pickerItem}
                            >
                                {MONTHS.map((month, index) => (
                                    <Picker.Item
                                        key={month}
                                        label={month}
                                        value={index}
                                        color={colors.textLight}
                                    />
                                ))}
                            </Picker>
                        </View>

                        {/* Year Picker */}
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={selectedYear}
                                onValueChange={(value) => setSelectedYear(value)}
                                style={styles.picker}
                                itemStyle={styles.pickerItem}
                            >
                                {years.map((year) => (
                                    <Picker.Item
                                        key={year}
                                        label={year.toString()}
                                        value={year}
                                        color={colors.textLight}
                                    />
                                ))}
                            </Picker>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: '#15152A',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 19,
        paddingVertical: 12,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -1 },
                shadowOpacity: 0.25,
                shadowRadius: 4,
            },
            android: {
                elevation: 8,
            },
        }),
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(235,235,245,0.1)',
    },
    headerButton: {
        paddingHorizontal: 10,
        paddingVertical: 12,
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '500',
        color: 'rgba(235,235,245,0.6)',
    },
    confirmText: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.primary,
    },
    labelsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingTop: 10,
    },
    label: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.textLight,
        textAlign: 'center',
        flex: 1,
    },
    pickersRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 5,
    },
    pickerContainer: {
        flex: 1,
        backgroundColor: '#1C1C2E',
        borderRadius: 15,
        marginHorizontal: 3,
        overflow: 'hidden',
    },
    picker: {
        height: 200,
    },
    pickerItem: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.textLight,
    },
});

export default WheelPickerModal;
