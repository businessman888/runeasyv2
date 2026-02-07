import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, borderRadius } from '../../theme';
import { WheelPickerModal } from '../../components/WheelPickerModal';

interface BirthDateScreenProps {
    value: { day: number; month: number; year: number } | null;
    onChange: (date: { day: number; month: number; year: number }) => void;
}

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const BirthDateScreen: React.FC<BirthDateScreenProps> = ({
    value,
    onChange,
}) => {
    const [modalVisible, setModalVisible] = useState(false);

    const formatDate = (date: { day: number; month: number; year: number }) => {
        return `${date.day.toString().padStart(2, '0')} de ${MONTHS[date.month]} de ${date.year}`;
    };

    const handleConfirm = (selection: { day: number; month: number; year: number }) => {
        onChange(selection);
        setModalVisible(false);
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>
                    Qual a sua data{'\n'}de <Text style={styles.titleHighlight}>Nascimento</Text>?
                </Text>
                <Text style={styles.subtitle}>
                    Escolha a data exata em que você{'\n'}nasceu.
                </Text>
            </View>

            {/* Date Selector Card */}
            <View style={styles.content}>
                <TouchableOpacity
                    style={[
                        styles.dateCard,
                        value && styles.dateCardSelected,
                    ]}
                    onPress={() => setModalVisible(true)}
                    activeOpacity={0.7}
                >
                    <Text style={[
                        styles.dateText,
                        value && styles.dateTextSelected,
                    ]}>
                        {value ? formatDate(value) : 'Data de nascimento'}
                    </Text>
                    <View style={styles.iconContainer}>
                        <Ionicons
                            name="calendar"
                            size={24}
                            color={value ? colors.primary : colors.primary}
                        />
                    </View>
                </TouchableOpacity>
            </View>

            {/* Modal */}
            <WheelPickerModal
                visible={modalVisible}
                onCancel={() => setModalVisible(false)}
                onConfirm={handleConfirm}
                initialValue={value || { day: 1, month: 0, year: 2000 }}
            />
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
    subtitle: {
        fontSize: 15,
        color: 'rgba(235,235,245,0.6)',
        marginTop: 12,
        lineHeight: 22,
    },
    content: {
        paddingHorizontal: 25,
        marginTop: 60,
    },
    dateCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#1C1C2E',
        borderRadius: 20,
        paddingVertical: 20,
        paddingHorizontal: 28,
    },
    dateCardSelected: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(0,127,153,0.15)',
    },
    dateText: {
        fontSize: 15,
        color: 'rgba(235,235,245,0.6)',
    },
    dateTextSelected: {
        color: colors.textLight,
        fontWeight: '500',
    },
    iconContainer: {
        width: 30,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default BirthDateScreen;
