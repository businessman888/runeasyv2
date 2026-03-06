import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

// Design System
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00E5FF',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
};

const ITEM_HEIGHT = 50;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
// Padding so first/last items can align to center
const PADDING_VERTICAL = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);

interface WheelColumnProps {
    data: { label: string; value: number }[];
    selectedValue: number;
    onValueChange: (value: number) => void;
    label?: string;
}

// Individual wheel column with FlatList + snapToInterval
function WheelColumn({ data, selectedValue, onValueChange, label }: WheelColumnProps) {
    const flatListRef = useRef<FlatList>(null);
    const lastReportedValue = useRef<number>(selectedValue);
    // Track the centered index via scroll offset for per-item styling
    const [centeredIndex, setCenteredIndex] = useState(() => {
        const idx = data.findIndex(item => item.value === selectedValue);
        return idx >= 0 ? idx : 0;
    });

    // Scroll to initial position on mount
    useEffect(() => {
        const targetIndex = data.findIndex(item => item.value === selectedValue);
        if (flatListRef.current && targetIndex >= 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToOffset({
                    offset: targetIndex * ITEM_HEIGHT,
                    animated: false,
                });
                setCenteredIndex(targetIndex);
            }, 50);
        }
    }, []); // Only on mount

    // If selectedValue changes externally (e.g. day clamped), scroll to it
    useEffect(() => {
        const targetIndex = data.findIndex(item => item.value === selectedValue);
        if (targetIndex >= 0 && targetIndex !== centeredIndex) {
            flatListRef.current?.scrollToOffset({
                offset: targetIndex * ITEM_HEIGHT,
                animated: true,
            });
            setCenteredIndex(targetIndex);
            lastReportedValue.current = selectedValue;
        }
    }, [selectedValue, data]);

    // Calculate selected index from scroll offset
    const getIndexFromOffset = useCallback((offset: number): number => {
        const rawIndex = Math.round(offset / ITEM_HEIGHT);
        return Math.max(0, Math.min(rawIndex, data.length - 1));
    }, [data.length]);

    // Report value change from scroll
    const reportValue = useCallback((index: number) => {
        const item = data[index];
        if (item && item.value !== lastReportedValue.current) {
            lastReportedValue.current = item.value;
            onValueChange(item.value);
            Haptics.selectionAsync();
        }
        setCenteredIndex(index);
    }, [data, onValueChange]);

    // Track scroll position for live centered index (visual feedback)
    const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = getIndexFromOffset(offsetY);
        if (index !== centeredIndex) {
            setCenteredIndex(index);
        }
    }, [getIndexFromOffset, centeredIndex]);

    // Snap-confirmed selection: fires when momentum ends
    const handleMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = getIndexFromOffset(offsetY);
        reportValue(index);
    }, [getIndexFromOffset, reportValue]);

    // Also handle direct drag end (no momentum)
    const handleScrollEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = getIndexFromOffset(offsetY);
        // Defer slightly to let snap settle
        setTimeout(() => reportValue(index), 50);
    }, [getIndexFromOffset, reportValue]);

    const getItemLayout = useCallback((_: any, index: number) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
    }), []);

    const renderItem = useCallback(({ item, index }: { item: { label: string; value: number }; index: number }) => {
        const isActive = index === centeredIndex;
        const distance = Math.abs(index - centeredIndex);

        // Opacity fading: center=1.0, ±1=0.4, ±2+=0.2
        let opacity = 0.2;
        if (isActive) opacity = 1.0;
        else if (distance === 1) opacity = 0.4;

        return (
            <View style={styles.itemContainer}>
                <Text style={[
                    styles.itemText,
                    {
                        color: isActive ? DS.cyan : '#666',
                        fontSize: isActive ? 22 : 18,
                        fontWeight: isActive ? '700' : '400',
                        opacity,
                    },
                ]}>
                    {item.label}
                </Text>
            </View>
        );
    }, [centeredIndex]);

    return (
        <View style={styles.columnContainer}>
            {label && <Text style={styles.columnLabel}>{label}</Text>}
            <View style={styles.wheelContainer}>
                {/* Selection indicator — fixed cyan rectangle in center */}
                <View style={styles.selectionIndicator} pointerEvents="none" />

                <FlatList
                    ref={flatListRef}
                    data={data}
                    renderItem={renderItem}
                    keyExtractor={(item) => String(item.value)}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    nestedScrollEnabled={true}
                    getItemLayout={getItemLayout}
                    onScroll={handleScroll}
                    onMomentumScrollEnd={handleMomentumScrollEnd}
                    onScrollEndDrag={handleScrollEndDrag}
                    scrollEventThrottle={16}
                    contentContainerStyle={{
                        paddingVertical: PADDING_VERTICAL,
                    }}
                    onScrollToIndexFailed={(info) => {
                        setTimeout(() => {
                            flatListRef.current?.scrollToOffset({
                                offset: info.index * ITEM_HEIGHT,
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
        top: PADDING_VERTICAL,
        left: 4,
        right: 4,
        height: ITEM_HEIGHT,
        backgroundColor: 'rgba(0, 229, 255, 0.12)',
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
        fontFamily: 'Inter-Bold',
    },
});

export default DateWheelPicker;
