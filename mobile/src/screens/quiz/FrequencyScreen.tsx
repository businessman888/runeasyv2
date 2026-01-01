import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Dimensions,
    Platform,
    Pressable,
} from 'react-native';
import { colors, typography, spacing } from '../../theme';
import { useOnboardingStore } from '../../stores/onboardingStore';
import Svg, { Path, Rect } from 'react-native-svg';
import { QuizProgressBar } from '../../components/QuizProgressBar';

const { width } = Dimensions.get('window');
const SLIDER_PADDING = 30;
const SLIDER_WIDTH = width - 40 - SLIDER_PADDING;

// Progress Step Icons
const WalkingIcon = ({ active }: { active: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 20 21" fill="none">
        <Path
            d="M10.5 4.5C11.3284 4.5 12 3.82843 12 3C12 2.17157 11.3284 1.5 10.5 1.5C9.67157 1.5 9 2.17157 9 3C9 3.82843 9.67157 4.5 10.5 4.5ZM7.5 7.5L5 17L7.5 17.5L9 12L10.5 13.5V19.5H12.5V12L11 9L11.5 6.5L13.5 8.5H16.5V6.5H14.5L11.5 3.5C11.2239 3.22386 10.8978 3.08579 10.5217 3.08579C10.1457 3.08579 9.81957 3.22386 9.54343 3.5C9.34343 3.7 9.10914 4.09286 9 4.5L7.5 7.5Z"
            fill={active ? '#00D4FF' : 'rgba(235, 235, 245, 0.6)'}
        />
    </Svg>
);

const LockIcon = ({ active }: { active: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 20 21" fill="none">
        <Path
            d="M14.1667 9.66667V7.16667C14.1667 4.86548 12.3012 3 10 3C7.69881 3 5.83333 4.86548 5.83333 7.16667V9.66667M6.5 18H13.5C14.9001 18 15.6002 18 16.135 17.7275C16.6054 17.4878 16.9878 17.1054 17.2275 16.635C17.5 16.1002 17.5 15.4001 17.5 14V13.6667C17.5 12.2665 17.5 11.5665 17.2275 11.0316C16.9878 10.5613 16.6054 10.1788 16.135 9.93915C15.6002 9.66667 14.9001 9.66667 13.5 9.66667H6.5C5.09987 9.66667 4.3998 9.66667 3.86502 9.93915C3.39462 10.1788 3.01217 10.5613 2.77248 11.0316C2.5 11.5665 2.5 12.2665 2.5 13.6667V14C2.5 15.4001 2.5 16.1002 2.77248 16.635C3.01217 17.1054 3.39462 17.4878 3.86502 17.7275C4.3998 18 5.09987 18 6.5 18Z"
            stroke={active ? '#00D4FF' : 'rgba(235, 235, 245, 0.6)'}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
        />
    </Svg>
);

// Lightbulb Icon
const IdeaIcon = () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 2C8.13 2 5 5.13 5 9C5 11.38 6.19 13.47 8 14.74V17C8 17.55 8.45 18 9 18H15C15.55 18 16 17.55 16 17V14.74C17.81 13.47 19 11.38 19 9C19 5.13 15.87 2 12 2ZM14.85 13.1L14 13.7V16H10V13.7L9.15 13.1C7.8 12.16 7 10.63 7 9C7 6.24 9.24 4 12 4C14.76 4 17 6.24 17 9C17 10.63 16.2 12.16 14.85 13.1ZM9 21C9 21.55 9.45 22 10 22H14C14.55 22 15 21.55 15 21V20H9V21Z"
            fill="#00D4FF"
        />
    </Svg>
);

// Next Button with Runner Icon
const NextButton = ({ onPress }: { onPress: () => void }) => (
    <TouchableOpacity style={styles.nextButton} onPress={onPress} activeOpacity={0.8}>
        <Svg width={54} height={54} viewBox="0 0 54 54" fill="none">
            <Rect width={54} height={54} rx={27} fill="#00D4FF" />
            <Path d="M18.3985 16.125C18.3985 14.6766 19.5751 13.5 21.0235 13.5C22.472 13.5 23.6485 14.6766 23.6485 16.125C23.6485 17.5734 22.472 18.75 21.0235 18.75C19.5751 18.75 18.3985 17.5734 18.3985 16.125ZM18.0235 24.6234L16.9642 25.6828C16.6829 25.9641 16.5235 26.3438 16.5235 26.7422V28.5C16.5235 29.3297 15.8532 30 15.0235 30C14.1938 30 13.5235 29.3297 13.5235 28.5V26.7422C13.5235 25.5469 13.997 24.4031 14.8407 23.5594L16.486 21.9141C17.5548 20.8453 18.9985 20.2453 20.5079 20.2453C22.2376 20.2453 23.8735 21.0328 24.9517 22.3828L25.7954 23.4375C26.0813 23.7937 26.5126 24 26.9673 24H28.5235C29.3532 24 30.0235 24.6703 30.0235 25.5C30.0235 26.3297 29.3532 27 28.5235 27H26.9673C25.5985 27 24.3095 26.3766 23.4517 25.3125L23.2735 25.0922V30.4922L24.8907 31.8797C25.7204 32.5922 26.2642 33.5766 26.4188 34.6594L27.0095 38.7891C27.1267 39.6094 26.5548 40.3688 25.7345 40.4859C24.9142 40.6031 24.1548 40.0312 24.0376 39.2109L23.447 35.0812C23.3954 34.7203 23.2126 34.3922 22.936 34.1531L19.5938 31.2891C18.5954 30.4359 18.0235 29.1844 18.0235 27.8719V24.6234ZM18.0282 32.3906C18.1407 32.4984 18.2532 32.6062 18.3751 32.7094L20.5313 34.5563L20.4282 34.9125C20.2173 35.6484 19.8235 36.3187 19.2845 36.8578L16.0829 40.0594C15.497 40.6453 14.5454 40.6453 13.9595 40.0594C13.3735 39.4734 13.3735 38.5219 13.9595 37.9359L17.161 34.7344C17.3392 34.5562 17.4704 34.3313 17.5407 34.0875L18.0282 32.3906ZM37.1954 31.1719C36.7548 31.6125 36.0423 31.6125 35.6063 31.1719C35.1704 30.7313 35.1657 30.0188 35.6063 29.5828L37.0595 28.1297H32.2735C31.6501 28.1297 31.1485 27.6281 31.1485 27.0047C31.1485 26.3813 31.6501 25.8797 32.2735 25.8797H37.0595L35.6063 24.4266C35.1657 23.9859 35.1657 23.2734 35.6063 22.8375C36.047 22.4016 36.7595 22.3969 37.1954 22.8375L40.5704 26.2125C41.011 26.6531 41.011 27.3656 40.5704 27.8016L37.1954 31.1766V31.1719Z" fill="#0E0E1F" />
        </Svg>
    </TouchableOpacity>
);

const DAYS = [2, 3, 4, 5, 6, 7];

export function FrequencyScreen({ navigation, route }: any) {
    const userId = route?.params?.userId;
    const { data, updateData } = useOnboardingStore();
    const [selectedDays, setSelectedDays] = useState<number>(data.daysPerWeek || 3);
    const [isDragging, setIsDragging] = useState(false);
    const trackRef = useRef<View>(null);
    const trackLayoutRef = useRef<{ x: number; width: number }>({ x: 0, width: SLIDER_WIDTH });

    const handleSelectDay = useCallback((day: number) => {
        setSelectedDays(day);
        updateData({ daysPerWeek: day });
    }, [updateData]);

    const handleNext = () => {
        navigation.navigate('Quiz_Pace', { userId });
    };

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
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <View style={styles.content}>
                {/* Progress Indicator */}
                <QuizProgressBar currentStep={3} />

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

                {/* Next Button */}
                <View style={styles.nextButtonContainer}>
                    <NextButton onPress={handleNext} />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 20,
    },
    progressContainer: {
        marginBottom: 32,
    },
    progressText: {
        fontSize: 13,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        marginBottom: 12,
    },
    progressNumber: {
        color: '#00D4FF',
        fontWeight: '600',
    },
    progressTotal: {
        color: '#00D4FF',
    },
    progressSteps: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    stepContainer: {
        alignItems: 'center',
    },
    stepLine: {
        width: 44,
        height: 4,
        backgroundColor: 'rgba(235, 235, 245, 0.1)',
        borderRadius: 20,
        marginTop: 8,
    },
    stepLineActive: {
        backgroundColor: '#00D4FF',
    },
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
    nextButtonContainer: {
        position: 'absolute',
        bottom: 30,
        right: 20,
    },
    nextButton: {
        borderRadius: 27,
    },
});

export default FrequencyScreen;
