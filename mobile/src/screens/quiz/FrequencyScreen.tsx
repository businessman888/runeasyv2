import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
    Pressable,
} from 'react-native';
import { colors, typography, spacing } from '../../theme';
import Svg, { Path, Rect } from 'react-native-svg';

const { width } = Dimensions.get('window');
const SLIDER_PADDING = 30;
const SLIDER_WIDTH = width - 40 - SLIDER_PADDING;

// Lightbulb Icon
const IdeaIcon = () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 2C8.13 2 5 5.13 5 9C5 11.38 6.19 13.47 8 14.74V17C8 17.55 8.45 18 9 18H15C15.55 18 16 17.55 16 17V14.74C17.81 13.47 19 11.38 19 9C19 5.13 15.87 2 12 2ZM14.85 13.1L14 13.7V16H10V13.7L9.15 13.1C7.8 12.16 7 10.63 7 9C7 6.24 9.24 4 12 4C14.76 4 17 6.24 17 9C17 10.63 16.2 12.16 14.85 13.1ZM9 21C9 21.55 9.45 22 10 22H14C14.55 22 15 21.55 15 21V20H9V21Z"
            fill="#00D4FF"
        />
    </Svg>
);



const DAYS = [2, 3, 4, 5, 6, 7];

interface FrequencyScreenProps {
    value?: number;
    onChange?: (value: number) => void;
}

export function FrequencyScreen({ value, onChange }: FrequencyScreenProps) {
    const [selectedDays, setSelectedDays] = useState<number>(value || 3);
    const [isDragging, setIsDragging] = useState(false);
    const trackRef = useRef<View>(null);
    const trackLayoutRef = useRef<{ x: number; width: number }>({ x: 0, width: SLIDER_WIDTH });

    useEffect(() => {
        setSelectedDays(value || 3);
    }, [value]);

    const handleSelectDay = useCallback((day: number) => {
        setSelectedDays(day);
        if (onChange) {
            onChange(day);
        }
    }, [onChange]);

    // Calculate slider position
    const stepWidth = SLIDER_WIDTH / (DAYS.length - 1);
    const getSliderPosition = () => {
        const index = DAYS.indexOf(selectedDays);
        return index * stepWidth;
    };

    // Convert x position to day value
    const positionToDay = useCallback((x: number): number => {
        const index = Math.round(x / stepWidth);
        const clampedIndex = Math.max(0, Math.min(index, DAYS.length - 1));
        return DAYS[clampedIndex];
    }, [stepWidth]);

    // Handle track press to jump to position
    const handleTrackPress = useCallback((event: any) => {
        const { locationX } = event.nativeEvent;
        const newDay = positionToDay(locationX);
        handleSelectDay(newDay);
    }, [positionToDay, handleSelectDay]);

    // Web-specific drag handlers
    const handleWebMouseDown = useCallback((e: any) => {
        if (Platform.OS !== 'web') return;
        setIsDragging(true);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!trackLayoutRef.current) return;
            const rect = (trackRef.current as any)?._nativeTag
                ? trackLayoutRef.current
                : (e.target as HTMLElement).parentElement?.getBoundingClientRect();

            if (rect) {
                const x = moveEvent.clientX - rect.x - 15; // Adjust for thumb width
                const clampedX = Math.max(0, Math.min(x, SLIDER_WIDTH));
                const newDay = positionToDay(clampedX);
                handleSelectDay(newDay);
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [positionToDay, handleSelectDay]);

    // Touch handlers for native
    const handleTouchMove = useCallback((event: any) => {
        const touch = event.nativeEvent.touches[0];
        if (!touch) return;

        trackRef.current?.measure((x, y, measureWidth, height, pageX, pageY) => {
            const relativeX = touch.pageX - pageX;
            const clampedX = Math.max(0, Math.min(relativeX, SLIDER_WIDTH));
            const newDay = positionToDay(clampedX);
            handleSelectDay(newDay);
        });
    }, [positionToDay, handleSelectDay]);

    const handleTrackLayout = useCallback((event: any) => {
        const { x, width } = event.nativeEvent.layout;
        trackLayoutRef.current = { x, width };
    }, []);

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Quantos dias por semana{'\n'}você pode se comprometer{'\n'}a treinar?
                </Text>
            </View>

            {/* Big Number Display */}
            <View style={styles.numberDisplayContainer}>
                <Text style={styles.bigNumber}>{selectedDays}</Text>
                <Text style={styles.daysLabel}>dias / semana</Text>
            </View>

            {/* Slider */}
            <View style={styles.sliderContainer}>
                {/* Clickable Track Area */}
                <Pressable
                    ref={trackRef}
                    style={styles.sliderTrackArea}
                    onPress={handleTrackPress}
                    onLayout={handleTrackLayout}
                    onTouchMove={handleTouchMove}
                >
                    {/* Track */}
                    <View style={styles.sliderTrack}>
                        <View style={[styles.sliderFill, { width: getSliderPosition() + 15 }]} />
                    </View>

                    {/* Draggable Thumb */}
                    <View
                        style={[
                            styles.sliderThumbContainer,
                            { left: getSliderPosition() },
                            isDragging && styles.sliderThumbDragging
                        ]}
                        onTouchStart={() => setIsDragging(true)}
                        onTouchEnd={() => setIsDragging(false)}
                        // @ts-ignore - Web specific
                        onMouseDown={handleWebMouseDown}
                    >
                        <View style={styles.sliderThumb}>
                            <View style={styles.sliderThumbInner} />
                        </View>
                    </View>
                </Pressable>

                {/* Day Numbers */}
                <View style={styles.daysRow}>
                    {DAYS.map((day) => (
                        <TouchableOpacity
                            key={day}
                            onPress={() => handleSelectDay(day)}
                            style={styles.dayButton}
                        >
                            <Text style={[
                                styles.dayNumber,
                                selectedDays === day && styles.dayNumberActive
                            ]}>
                                {day}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Tip Card */}
            <View style={styles.tipCard}>
                <View style={styles.tipIconContainer}>
                    <IdeaIcon />
                </View>
                <View style={styles.tipTextContainer}>
                    <Text style={styles.tipText}>
                        Nós recomendamos pelo menos 3 dias{'\n'}para resultados consistentes no{'\n'}primeiro mês.
                    </Text>
                </View>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 40,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.white,
        lineHeight: 36,
        textAlign: 'center',
    },
    numberDisplayContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    bigNumber: {
        fontSize: 96,
        fontWeight: '700',
        color: '#00D4FF',
        lineHeight: 110,
    },
    daysLabel: {
        fontSize: 16,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        marginTop: -10,
    },
    sliderContainer: {
        marginBottom: 40,
        paddingHorizontal: 10,
    },
    sliderTrackArea: {
        height: 40,
        justifyContent: 'center',
        marginBottom: 20,
        cursor: Platform.OS === 'web' ? 'pointer' : undefined,
    } as any,
    sliderTrack: {
        height: 4,
        backgroundColor: 'rgba(235, 235, 245, 0.1)',
        borderRadius: 20,
    },
    sliderFill: {
        height: 4,
        backgroundColor: '#00D4FF',
        borderRadius: 20,
    },
    sliderThumbContainer: {
        position: 'absolute',
        top: 5,
        cursor: Platform.OS === 'web' ? 'grab' : undefined,
    } as any,
    sliderThumbDragging: {
        cursor: Platform.OS === 'web' ? 'grabbing' : undefined,
    } as any,
    sliderThumb: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#00D4FF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 8,
    },
    sliderThumbInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#0E0E1F',
    },
    daysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    dayButton: {
        width: 27,
        alignItems: 'center',
    },
    dayNumber: {
        fontSize: 15,
        fontWeight: '700',
        color: 'rgba(235, 235, 245, 0.6)',
    },
    dayNumberActive: {
        color: '#00D4FF',
    },
    tipCard: {
        flexDirection: 'row',
        backgroundColor: '#15152A',
        borderRadius: 16,
        padding: 16,
        alignItems: 'flex-start',
    },
    tipIconContainer: {
        marginRight: 12,
    },
    tipTextContainer: {
        flex: 1,
    },
    tipText: {
        fontSize: 11,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        lineHeight: 16,
    },
});

export default FrequencyScreen;
