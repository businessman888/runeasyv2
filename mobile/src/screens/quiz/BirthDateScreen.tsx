import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateWheelPicker } from '../../components/DateWheelPicker';

// Design System
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00D4FF',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    glassBorder: 'rgba(235, 235, 245, 0.1)',
    modalOverlay: 'rgba(0, 0, 0, 0.7)',
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
    const [isModalVisible, setModalVisible] = useState(false);
    const [date, setDate] = useState<BirthDateValue | null>(value || null);
    const [tempDate, setTempDate] = useState<BirthDateValue>({ day: 15, month: 6, year: 1990 });

    useEffect(() => {
        if (value) {
            setDate(value);
        }
    }, [value]);

    const handleOpenModal = () => {
        // Initialize temp date with current selection or default
        setTempDate(date || { day: 15, month: 6, year: 1990 });
        setModalVisible(true);
    };

    const handleConfirm = () => {
        setDate(tempDate);
        if (onChange) {
            onChange(tempDate);
        }
        setModalVisible(false);
    };

    const handleCancel = () => {
        setModalVisible(false);
    };

    // wheel picker handlers updating tempDate
    const handleDayChange = (day: number) => setTempDate(prev => ({ ...prev, day }));
    const handleMonthChange = (month: number) => setTempDate(prev => ({ ...prev, month }));
    const handleYearChange = (year: number) => setTempDate(prev => ({ ...prev, year }));

    const formatDate = (d: BirthDateValue) => {
        // DD/MM/YYYY
        return `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;
    };

    const calculateAge = () => {
        if (!date) return null;
        const today = new Date();
        let age = today.getFullYear() - date.year;
        const monthDiff = today.getMonth() + 1 - date.month;
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.day)) {
            age--;
        }
        return age;
    };

    const age = calculateAge();

    return (
        <View style={styles.container}>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Qual a sua data de{'\n'}
                    <Text style={styles.titleHighlight}>nascimento?</Text>
                </Text>
                <Text style={styles.subtitle}>
                    {age !== null
                        ? `Usamos sua idade (${age} anos) para personalizar a intensidade dos treinos.`
                        : 'Usamos sua idade para personalizar a intensidade dos treinos.'}
                </Text>
            </View>

            {/* Trigger Card */}
            <TouchableOpacity
                style={styles.triggerCard}
                onPress={handleOpenModal}
                activeOpacity={0.7}
            >
                <View style={styles.cardContent}>
                    <View style={styles.iconContainer}>
                        <MaterialCommunityIcons name="calendar-month" size={24} color={DS.cyan} />
                    </View>
                    <View style={styles.labelContainer}>
                        <Text style={styles.cardLabel}>
                            {date ? formatDate(date) : 'Data de nascimento'}
                        </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-down" size={24} color={DS.textSecondary} />
                </View>
            </TouchableOpacity>

            {/* Info Tip */}
            <View style={styles.tipCard}>
                <Text style={styles.tipText}>
                    💡 Seus treinos serão adaptados para garantir segurança e evolução constante.
                </Text>
            </View>

            {/* Modal */}
            <Modal
                transparent
                animationType="slide"
                visible={isModalVisible}
                onRequestClose={() => setModalVisible(false)}
                statusBarTranslucent
            >
                <View style={styles.modalOverlay}>
                    {/* Backdrop tap to close could be added here if desired */}
                    <View style={styles.modalSheet}>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={handleCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Text style={styles.cancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleConfirm} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Text style={styles.confirmText}>Confirmar</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Picker Content */}
                        <View style={styles.pickerWrapper}>
                            <DateWheelPicker
                                day={tempDate.day}
                                month={tempDate.month}
                                year={tempDate.year}
                                onDayChange={handleDayChange}
                                onMonthChange={handleMonthChange}
                                onYearChange={handleYearChange}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 8,
    },
    titleContainer: {
        marginBottom: 32,
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
    triggerCard: {
        backgroundColor: DS.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: DS.glassBorder,
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    labelContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    cardLabel: {
        fontSize: 16,
        fontFamily: 'Inter-Bold',
        color: DS.text,
        fontWeight: '600',
    },
    tipCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: DS.glassBorder,
    },
    tipText: {
        fontSize: 13,
        fontWeight: '400',
        color: DS.textSecondary,
        lineHeight: 18,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: DS.modalOverlay,
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: DS.card,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 40, // Space for home indicator
        width: '100%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: DS.glassBorder,
    },
    cancelText: {
        fontSize: 16,
        color: DS.textSecondary,
        fontWeight: '500',
    },
    confirmText: {
        fontSize: 16,
        color: DS.cyan,
        fontWeight: '700',
        fontFamily: 'Inter-Bold',
    },
    pickerWrapper: {
        paddingVertical: 20,
    },
});

export default BirthDateScreen;
