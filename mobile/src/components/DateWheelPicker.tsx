import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    Animated,
    Dimensions,
} from 'react-native';

// Design System Colors (Figma)
const DS = {
    bg: '#0F0F1E',
    surface: '#15152A',
    card: '#1C1C2E',
    cyan: '#00D4FF',
    cyanMuted: 'rgba(0, 127, 153, 0.3)',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    glassBorder: 'rgba(235, 235, 245, 0.1)',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_HEIGHT = 49;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Generate arrays
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const YEARS = Array.from({ length: 80 }, (_, i) => 2010 - i); // 2010 down to 1931

interface DateWheelPickerProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (date: { day: number; month: number; year: number }) => void;
    initialDate?: { day: number; month: number; year: number };
}

// Individual wheel column component
interface WheelColumnProps {
    items: (string | number)[];
    selectedIndex: number;
    onSelect: (index: number) => void;
    label: string;
    width: number;
}

const WheelColumn: React.FC<WheelColumnProps> = ({ items, selectedIndex, onSelect, label, width }) => {
    const scrollViewRef = useRef<ScrollView>(null);
    const [currentIndex, setCurrentIndex] = useState(selectedIndex);

    React.useEffect(() => {
        // Scroll to initial position
        setTimeout(() => {
            scrollViewRef.current?.scrollTo({
                y: selectedIndex * ITEM_HEIGHT,
                animated: false,
            });
        }, 100);
    }, []);

    const handleScroll = (event: any) => {
        const y = event.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
        if (clampedIndex !== currentIndex) {
            setCurrentIndex(clampedIndex);
            onSelect(clampedIndex);
        }
    };

    const handleMomentumEnd = (event: any) => {
        const y = event.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
        // Snap to nearest item
        scrollViewRef.current?.scrollTo({
            y: clampedIndex * ITEM_HEIGHT,
            animated: true,
        });
    };

    return (
        <View style={[styles.columnContainer, { width }]}>
            {/* Label */}
            <Text style={styles.columnLabel}>{label}</Text>

            {/* Picker area */}
            <View style={styles.pickerArea}>
                {/* Lens effect highlight - center selection box */}
                <View style={styles.lensHighlight} pointerEvents="none" />

                <ScrollView
                    ref={scrollViewRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onScroll={handleScroll}
                    onMomentumScrollEnd={handleMomentumEnd}
                    scrollEventThrottle={16}
                    contentContainerStyle={{
                        paddingVertical: ITEM_HEIGHT * 2, // Center items
                    }}
                >
                    {items.map((item, index) => {
                        const isSelected = index === currentIndex;
                        const distance = Math.abs(index - currentIndex);

                        // Lens effect: scale and opacity based on distance from center
                        const scale = isSelected ? 1.1 : Math.max(0.8, 1 - distance * 0.1);
                        const opacity = isSelected ? 1 : Math.max(0.4, 1 - distance * 0.2);

                        return (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.item,
                                    isSelected && styles.itemSelected,
                                ]}
                                onPress={() => {
                                    setCurrentIndex(index);
                                    onSelect(index);
                                    scrollViewRef.current?.scrollTo({
                                        y: index * ITEM_HEIGHT,
                                        animated: true,
                                    });
                                }}
                                activeOpacity={0.7}
                            >
                                <Text
                                    style={[
                                        styles.itemText,
                                        isSelected && styles.itemTextSelected,
                                        {
                                            opacity,
                                            transform: [{ scale }],
                                        },
                                    ]}
                                >
                                    {typeof item === 'number' ? String(item).padStart(2, '0') : item}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
        </View>
    );
};

export const DateWheelPicker: React.FC<DateWheelPickerProps> = ({
    visible,
    onClose,
    onConfirm,
    initialDate,
}) => {
    const defaultDate = initialDate || { day: 1, month: 0, year: 2000 };
    const [selectedDay, setSelectedDay] = useState(defaultDate.day - 1);
    const [selectedMonth, setSelectedMonth] = useState(defaultDate.month);
    const [selectedYear, setSelectedYear] = useState(
        YEARS.findIndex(y => y === defaultDate.year) || 10
    );

    const handleConfirm = () => {
        onConfirm({
            day: DAYS[selectedDay],
            month: selectedMonth,
            year: YEARS[selectedYear],
        });
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header with Cancel/Confirm */}
                    <View style={styles.header}>
                        <TouchableOpacity style={styles.headerButton} onPress={onClose}>
                            <Text style={styles.cancelText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerButton} onPress={handleConfirm}>
                            <Text style={styles.confirmText}>Confirmar</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Wheel Pickers */}
                    <View style={styles.pickersRow}>
                        <WheelColumn
                            items={DAYS}
                            selectedIndex={selectedDay}
                            onSelect={setSelectedDay}
                            label="Dia"
                            width={99}
                        />
                        <WheelColumn
                            items={MONTHS}
                            selectedIndex={selectedMonth}
                            onSelect={setSelectedMonth}
                            label="Mês"
                            width={99}
                        />
                        <WheelColumn
                            items={YEARS}
                            selectedIndex={selectedYear}
                            onSelect={setSelectedYear}
                            label="Ano"
                            width={99}
                        />
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: DS.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 19,
        paddingVertical: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: DS.glassBorder,
    },
    headerButton: {
        width: 123,
        height: 67,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 15,
        color: DS.textSecondary,
    },
    confirmText: {
        fontFamily: 'Poppins-Bold',
        fontSize: 15,
        fontWeight: '700',
        color: DS.cyan,
    },
    pickersRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 5,
        paddingHorizontal: 2,
    },
    columnContainer: {
        alignItems: 'center',
    },
    columnLabel: {
        fontFamily: 'Poppins-Medium',
        fontSize: 15,
        color: DS.text,
        marginBottom: 8,
        height: 43,
        lineHeight: 43,
    },
    pickerArea: {
        height: 271,
        backgroundColor: DS.card,
        borderRadius: 15,
        overflow: 'hidden',
        position: 'relative',
    },
    lensHighlight: {
        position: 'absolute',
        top: ITEM_HEIGHT * 2, // Center position
        left: 7,
        right: 7,
        height: ITEM_HEIGHT,
        backgroundColor: DS.cyanMuted,
        borderRadius: 10,
        zIndex: 1,
    },
    item: {
        height: ITEM_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 7,
        borderRadius: 10,
    },
    itemSelected: {
        // Selected state handled by lens highlight
    },
    itemText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 16,
        color: DS.textSecondary,
    },
    itemTextSelected: {
        color: DS.cyan,
        fontWeight: '600',
    },
});

export default DateWheelPicker;
