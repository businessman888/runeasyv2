import React, { useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Dimensions,
    ViewToken,
} from 'react-native';

// Design System
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00D4FF',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
};

const ITEM_HEIGHT = 50;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

interface WheelColumnProps {
    data: { label: string; value: number }[];
    selectedValue: number;
    onValueChange: (value: number) => void;
    label?: string;
}

// Individual wheel column with FlatList + snapToInterval
function WheelColumn({ data, selectedValue, onValueChange, label }: WheelColumnProps) {
    const flatListRef = useRef<FlatList>(null);
    const initialIndex = data.findIndex(item => item.value === selectedValue);

    useEffect(() => {
        // Scroll to initial selection
        if (flatListRef.current && initialIndex >= 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                    index: initialIndex,
                    animated: false,
                    viewOffset: 0,
                });
            }, 100);
        }
    }, []);

    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        // Find the center item
        if (viewableItems.length > 0) {
            const centerIndex = Math.floor(viewableItems.length / 2);
            const centerItem = viewableItems[centerIndex];
            if (centerItem?.item) {
                onValueChange(centerItem.item.value);
            }
        }
    }, [onValueChange]);

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
        minimumViewTime: 50,
    }).current;

    const getItemLayout = useCallback((data: any, index: number) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
    }), []);

    const renderItem = useCallback(({ item, index }: { item: { label: string; value: number }; index: number }) => {
        const isSelected = item.value === selectedValue;
        return (
            <View style={styles.itemContainer}>
                <Text style={[
                    styles.itemText,
                    isSelected && styles.itemTextSelected,
                ]}>
                    {item.label}
                </Text>
            </View>
        );
    }, [selectedValue]);

    return (
        <View style={styles.columnContainer}>
            {label && <Text style={styles.columnLabel}>{label}</Text>}
            <View style={styles.wheelContainer}>
                {/* Selection indicator */}
                <View style={styles.selectionIndicator} pointerEvents="none" />

                <FlatList
                    ref={flatListRef}
                    data={data}
                    renderItem={renderItem}
                    keyExtractor={(item) => String(item.value)}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    getItemLayout={getItemLayout}
                    initialScrollIndex={Math.max(0, initialIndex)}
                    contentContainerStyle={{
                        paddingVertical: ITEM_HEIGHT * 2, // Center first/last items
                    }}
                    onScrollToIndexFailed={(info) => {
                        // Retry scroll after layout
                        setTimeout(() => {
                            flatListRef.current?.scrollToIndex({
                                index: info.index,
                                animated: false,
                            });
                        }, 100);
                    }}
                />
            </View>
        </View>
    );
}

interface DateWheelPickerProps {
    day: number;
    month: number; // 1-indexed (1 = Janeiro)
    year: number;
    onDayChange: (day: number) => void;
    onMonthChange: (month: number) => void;
    onYearChange: (year: number) => void;
}

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Get days in a specific month
const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month, 0).getDate();
};

export function DateWheelPicker({
    day,
    month,
    year,
    onDayChange,
    onMonthChange,
    onYearChange,
}: DateWheelPickerProps) {
    const currentYear = new Date().getFullYear();

    // Generate data arrays
    const daysInMonth = getDaysInMonth(month, year);
    const daysData = Array.from({ length: daysInMonth }, (_, i) => ({
        label: String(i + 1).padStart(2, '0'),
        value: i + 1,
    }));

    const monthsData = MONTHS.map((name, index) => ({
        label: name.slice(0, 3).toUpperCase(), // JAN, FEV, etc.
        value: index + 1, // 1-indexed
    }));

    const yearsData = Array.from({ length: 80 }, (_, i) => ({
        label: String(currentYear - 10 - i),
        value: currentYear - 10 - i,
    }));

    // Adjust day if exceeds days in new month
    useEffect(() => {
        if (day > daysInMonth) {
            onDayChange(daysInMonth);
        }
    }, [month, year, daysInMonth, day, onDayChange]);

    return (
        <View style={styles.container}>
            <WheelColumn
                data={daysData}
                selectedValue={day}
                onValueChange={onDayChange}
                label="DIA"
            />
            <WheelColumn
                data={monthsData}
                selectedValue={month}
                onValueChange={onMonthChange}
                label="MÊS"
            />
            <WheelColumn
                data={yearsData}
                selectedValue={year}
                onValueChange={onYearChange}
                label="ANO"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    columnContainer: {
        flex: 1,
        alignItems: 'center',
    },
    columnLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: DS.textSecondary,
        marginBottom: 8,
        letterSpacing: 1,
    },
    wheelContainer: {
        height: PICKER_HEIGHT,
        width: '100%',
        backgroundColor: DS.card,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
    },
    selectionIndicator: {
        position: 'absolute',
        top: ITEM_HEIGHT * 2,
        left: 4,
        right: 4,
        height: ITEM_HEIGHT,
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: DS.cyan,
        zIndex: 1,
    },
    itemContainer: {
        height: ITEM_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemText: {
        fontSize: 18,
        fontWeight: '500',
        color: DS.textSecondary,
    },
    itemTextSelected: {
        fontSize: 22,
        fontWeight: '700',
        color: DS.cyan,
    },
});

export default DateWheelPicker;
