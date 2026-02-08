import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    PanResponder,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Line } from 'react-native-svg';

// Design System Colors (Figma)
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00D4FF',
    cyanMuted: 'rgba(0, 127, 153, 0.3)',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
};

const RULER_HEIGHT = 320;
const MIN_HEIGHT = 140;
const MAX_HEIGHT = 210;
const HEIGHT_RANGE = MAX_HEIGHT - MIN_HEIGHT; // 70 cm
const TICK_SPACING = RULER_HEIGHT / HEIGHT_RANGE;

// Height markers to show on ruler
const RULER_MARKS = [200, 190, 180, 170, 160, 150];

interface HeightScreenProps {
    value?: number | null;
    onChange?: (value: number) => void;
}

export function HeightScreen({ value, onChange }: HeightScreenProps) {
    const [selectedHeight, setSelectedHeight] = useState<number>(value || 175);
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [customValue, setCustomValue] = useState('');

    const panY = useRef(new Animated.Value(0)).current;
    const lastOffset = useRef(0);

    useEffect(() => {
        if (value) {
            setSelectedHeight(value);
            const yPos = (MAX_HEIGHT - value) * TICK_SPACING;
            panY.setValue(yPos);
            lastOffset.current = yPos;
        }
    }, [value]);

    const heightToY = (height: number) => {
        return (MAX_HEIGHT - height) * TICK_SPACING;
    };

    const yToHeight = (y: number) => {
        const height = MAX_HEIGHT - (y / TICK_SPACING);
        return Math.round(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height)));
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                panY.setOffset(lastOffset.current);
                panY.setValue(0);
            },
            onPanResponderMove: (_, gesture) => {
                panY.setValue(gesture.dy);
            },
            onPanResponderRelease: (_, gesture) => {
                const newY = Math.max(0, Math.min(RULER_HEIGHT, lastOffset.current + gesture.dy));
                lastOffset.current = newY;
                panY.flattenOffset();

                const newHeight = yToHeight(newY);
                setSelectedHeight(newHeight);
                if (onChange) {
                    onChange(newHeight);
                }
            },
        })
    ).current;

    const handleMarkerPress = (height: number) => {
        const y = heightToY(height);
        Animated.spring(panY, {
            toValue: y,
            useNativeDriver: false,
            friction: 8,
        }).start();
        lastOffset.current = y;
        setSelectedHeight(height);
        if (onChange) {
            onChange(height);
        }
    };

    const handleCustomSubmit = () => {
        const num = parseInt(customValue, 10);
        if (num >= MIN_HEIGHT && num <= MAX_HEIGHT) {
            handleMarkerPress(num);
            setShowCustomInput(false);
            setCustomValue('');
        }
    };

    // Avatar scale based on height (0.8 to 1.2)
    const avatarScale = 0.8 + ((selectedHeight - MIN_HEIGHT) / HEIGHT_RANGE) * 0.4;

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Qual é a sua{'\n'}
                    <Text style={styles.titleHighlight}>altura</Text>?
                </Text>
                <Text style={styles.subtitle}>
                    Arraste a régua ou toque em um valor.
                </Text>
            </View>

            {/* Main Content: Ruler + Avatar */}
            <View style={styles.contentContainer}>
                {/* Left: Vertical Ruler */}
                <View style={styles.rulerContainer} {...panResponder.panHandlers}>
                    {/* Ruler ticks */}
                    <Svg width={12} height={RULER_HEIGHT} style={styles.rulerTicks}>
                        {Array.from({ length: HEIGHT_RANGE + 1 }, (_, i) => {
                            const y = i * TICK_SPACING;
                            const height = MAX_HEIGHT - i;
                            const isMajor = height % 10 === 0;
                            return (
                                <Line
                                    key={i}
                                    x1={0}
                                    y1={y}
                                    x2={isMajor ? 12 : 6}
                                    y2={y}
                                    stroke={DS.textSecondary}
                                    strokeWidth={isMajor ? 2 : 1}
                                />
                            );
                        })}
                    </Svg>

                    {/* Height markers */}
                    <View style={styles.markersContainer}>
                        {RULER_MARKS.map((height) => {
                            const y = heightToY(height);
                            const isSelected = selectedHeight === height;
                            return (
                                <TouchableOpacity
                                    key={height}
                                    style={[
                                        styles.marker,
                                        { top: y - 12 },
                                        isSelected && styles.markerSelected,
                                    ]}
                                    onPress={() => handleMarkerPress(height)}
                                >
                                    <Text style={[
                                        styles.markerText,
                                        isSelected && styles.markerTextSelected,
                                    ]}>
                                        {height}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Draggable indicator */}
                    <Animated.View
                        style={[
                            styles.indicator,
                            { transform: [{ translateY: panY }] },
                        ]}
                    >
                        <View style={styles.indicatorLine} />
                        <View style={styles.indicatorBadge}>
                            <Text style={styles.indicatorText}>{selectedHeight}</Text>
                        </View>
                    </Animated.View>
                </View>

                {/* Right: Simple Person Icon (scales with height) */}
                <View style={styles.figureContainer}>
                    <View style={[styles.avatarWrapper, { transform: [{ scale: avatarScale }] }]}>
                        <MaterialCommunityIcons
                            name="human"
                            size={120}
                            color={DS.cyan}
                        />
                    </View>
                    <View style={styles.heightDisplay}>
                        <Text style={styles.heightValue}>{selectedHeight}</Text>
                        <Text style={styles.heightUnit}>cm</Text>
                    </View>
                </View>
            </View>

            {/* Custom Input Toggle */}
            <TouchableOpacity
                style={styles.customToggle}
                onPress={() => setShowCustomInput(!showCustomInput)}
            >
                <Text style={styles.customToggleText}>
                    {showCustomInput ? 'Fechar' : 'Inserir valor exato'}
                </Text>
            </TouchableOpacity>

            {/* Custom Input */}
            {showCustomInput && (
                <View style={styles.customInputContainer}>
                    <TextInput
                        style={styles.customInput}
                        value={customValue}
                        onChangeText={setCustomValue}
                        keyboardType="number-pad"
                        placeholder="Ex: 173"
                        placeholderTextColor={DS.textSecondary}
                        maxLength={3}
                    />
                    <TouchableOpacity
                        style={styles.customSubmitButton}
                        onPress={handleCustomSubmit}
                    >
                        <Text style={styles.customSubmitText}>OK</Text>
                    </TouchableOpacity>
                </View>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: DS.text,
        lineHeight: 32,
        marginBottom: 8,
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
    contentContainer: {
        flexDirection: 'row',
        height: RULER_HEIGHT,
        marginBottom: 16,
    },
    rulerContainer: {
        width: 90,
        height: RULER_HEIGHT,
        position: 'relative',
    },
    rulerTicks: {
        position: 'absolute',
        left: 0,
        top: 0,
    },
    markersContainer: {
        position: 'absolute',
        left: 16,
        top: 0,
        width: 60,
        height: RULER_HEIGHT,
    },
    marker: {
        position: 'absolute',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    markerSelected: {
        backgroundColor: DS.cyanMuted,
    },
    markerText: {
        fontSize: 14,
        fontWeight: '500',
        color: DS.textSecondary,
    },
    markerTextSelected: {
        color: DS.cyan,
        fontWeight: '700',
    },
    indicator: {
        position: 'absolute',
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
    },
    indicatorLine: {
        height: 2,
        backgroundColor: DS.cyan,
        width: 50,
    },
    indicatorBadge: {
        backgroundColor: DS.cyan,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginLeft: 4,
    },
    indicatorText: {
        fontSize: 14,
        fontWeight: '700',
        color: DS.bg,
    },
    figureContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    heightDisplay: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginTop: 12,
    },
    heightValue: {
        fontSize: 48,
        fontWeight: '700',
        color: DS.cyan,
    },
    heightUnit: {
        fontSize: 20,
        fontWeight: '500',
        color: DS.textSecondary,
        marginLeft: 4,
    },
    customToggle: {
        alignSelf: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    customToggleText: {
        fontSize: 14,
        fontWeight: '500',
        color: DS.cyan,
        textDecorationLine: 'underline',
    },
    customInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DS.card,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: DS.cyan,
        paddingHorizontal: 16,
        marginTop: 12,
    },
    customInput: {
        flex: 1,
        fontSize: 20,
        fontWeight: '700',
        color: DS.text,
        paddingVertical: 12,
    },
    customSubmitButton: {
        backgroundColor: DS.cyan,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    customSubmitText: {
        fontSize: 14,
        fontWeight: '700',
        color: DS.bg,
    },
});

export default HeightScreen;
