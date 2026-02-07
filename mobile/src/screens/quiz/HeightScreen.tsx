import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    PanResponder,
    Dimensions,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import Svg, { Path, Circle, Line, G } from 'react-native-svg';

// Design System Colors (Figma)
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00D4FF',
    cyanMuted: 'rgba(0, 127, 153, 0.3)',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const RULER_HEIGHT = 380;
const MIN_HEIGHT = 140;
const MAX_HEIGHT = 210;
const HEIGHT_RANGE = MAX_HEIGHT - MIN_HEIGHT; // 70 cm
const TICK_SPACING = RULER_HEIGHT / HEIGHT_RANGE; // pixels per cm

// Height markers to show on ruler
const RULER_MARKS = [195, 185, 180, 175, 170, 165, 160];

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
            // Set initial position based on value
            const yPos = (MAX_HEIGHT - value) * TICK_SPACING;
            panY.setValue(yPos);
            lastOffset.current = yPos;
        }
    }, [value]);

    // Calculate Y position from height value
    const heightToY = (height: number) => {
        return (MAX_HEIGHT - height) * TICK_SPACING;
    };

    // Calculate height from Y position
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
                // Limit movement within bounds
                const newY = lastOffset.current + gesture.dy;
                const clampedY = Math.max(0, Math.min(RULER_HEIGHT, newY));
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

    // Handle marker tap
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

    // Handle custom input
    const handleCustomSubmit = () => {
        const num = parseInt(customValue, 10);
        if (num >= MIN_HEIGHT && num <= MAX_HEIGHT) {
            handleMarkerPress(num);
            setShowCustomInput(false);
            setCustomValue('');
        }
    };

    // Calculate avatar scale based on height (0.7 to 1.1)
    const avatarScale = 0.7 + ((selectedHeight - MIN_HEIGHT) / HEIGHT_RANGE) * 0.4;

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Qual é a sua{'\n'}
                    <Text style={styles.titleHighlight}>altura</Text>?
                </Text>
                <Text style={styles.subtitle}>
                    Escolha a opção exata ou a mais próxima.
                </Text>
            </View>

            {/* Main Content: Ruler + Human Figure */}
            <View style={styles.contentContainer}>
                {/* Left: Vertical Ruler */}
                <View style={styles.rulerContainer} {...panResponder.panHandlers}>
                    {/* Ruler ticks SVG */}
                    <Svg width={13} height={RULER_HEIGHT} style={styles.rulerTicks}>
                        {Array.from({ length: HEIGHT_RANGE + 1 }, (_, i) => {
                            const y = i * TICK_SPACING;
                            const height = MAX_HEIGHT - i;
                            const isMajor = height % 5 === 0;
                            return (
                                <Line
                                    key={i}
                                    x1={0}
                                    y1={y}
                                    x2={isMajor ? 13 : 8}
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
                                        { top: y - 10 },
                                        isSelected && styles.markerSelected,
                                    ]}
                                    onPress={() => handleMarkerPress(height)}
                                >
                                    <Text style={[
                                        styles.markerText,
                                        isSelected && styles.markerTextSelected,
                                    ]}>
                                        {height} cm
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Draggable indicator */}
                    <Animated.View
                        style={[
                            styles.indicator,
                            {
                                transform: [{ translateY: panY }],
                            },
                        ]}
                    >
                        <View style={styles.indicatorLine} />
                        <View style={styles.indicatorBadge}>
                            <Text style={styles.indicatorText}>{selectedHeight}</Text>
                        </View>
                    </Animated.View>
                </View>

                {/* Right: Human Figure */}
                <View style={styles.figureContainer}>
                    <View style={[styles.figure, { transform: [{ scale: avatarScale }] }]}>
                        <Svg width={120} height={250} viewBox="0 0 120 250">
                            {/* Head */}
                            <Circle cx={60} cy={35} r={30} fill={DS.cyan} opacity={0.8} />
                            {/* Body */}
                            <Path
                                d="M60 70 C80 70 95 90 95 120 L95 180 C95 195 85 200 75 200 L75 245 C75 248 72 250 69 250 L51 250 C48 250 45 248 45 245 L45 200 C35 200 25 195 25 180 L25 120 C25 90 40 70 60 70"
                                fill={DS.cyan}
                                opacity={0.8}
                            />
                            {/* Arms */}
                            <Path
                                d="M25 95 L5 140 C3 145 5 150 10 150 L15 150 L35 115"
                                fill={DS.cyan}
                                opacity={0.6}
                            />
                            <Path
                                d="M95 95 L115 140 C117 145 115 150 110 150 L105 150 L85 115"
                                fill={DS.cyan}
                                opacity={0.6}
                            />
                        </Svg>
                    </View>

                    {/* Height display below figure */}
                    <View style={styles.heightDisplay}>
                        <Text style={styles.heightValue}>{selectedHeight}</Text>
                        <Text style={styles.heightUnit}>cm</Text>
                    </View>
                </View>
            </View>

            {/* Bottom: Custom input option */}
            <TouchableOpacity
                style={styles.customInputButton}
                onPress={() => setShowCustomInput(!showCustomInput)}
            >
                <Text style={styles.customInputLabel}>Outro valor</Text>
                {showCustomInput ? (
                    <View style={styles.customInputRow}>
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
                ) : (
                    <View style={styles.customValueBox}>
                        <Text style={styles.customValueText}>{selectedHeight} cm</Text>
                    </View>
                )}
            </TouchableOpacity>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 20,
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
        gap: 12,
        marginBottom: 16,
        paddingHorizontal: 11,
    },
    rulerContainer: {
        width: 72,
        height: RULER_HEIGHT + 60,
        position: 'relative',
    },
    rulerTicks: {
        position: 'absolute',
        left: 5,
        top: 11,
    },
    markersContainer: {
        position: 'absolute',
        left: 19,
        top: 11,
        width: 50,
        height: RULER_HEIGHT,
    },
    marker: {
        position: 'absolute',
        left: 0,
        paddingVertical: 2,
    },
    markerSelected: {},
    markerText: {
        fontSize: 10,
        fontWeight: '700',
        color: DS.textSecondary,
    },
    markerTextSelected: {
        color: DS.cyan,
    },
    indicator: {
        position: 'absolute',
        left: 0,
        width: 72,
        height: 4,
        flexDirection: 'row',
        alignItems: 'center',
    },
    indicatorLine: {
        flex: 1,
        height: 3,
        backgroundColor: DS.cyan,
        borderRadius: 2,
    },
    indicatorBadge: {
        backgroundColor: DS.cyan,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginLeft: 4,
    },
    indicatorText: {
        fontSize: 12,
        fontWeight: '700',
        color: DS.bg,
    },
    figureContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    figure: {
        alignItems: 'center',
    },
    heightDisplay: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginTop: 20,
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
    customInputButton: {
        backgroundColor: DS.card,
        borderRadius: 12,
        padding: 12,
        marginTop: 8,
    },
    customInputLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: DS.cyanMuted,
        marginBottom: 6,
    },
    customInputRow: {
        flexDirection: 'row',
        gap: 8,
    },
    customInput: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: DS.cyanMuted,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        color: DS.text,
    },
    customSubmitButton: {
        backgroundColor: DS.cyan,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        justifyContent: 'center',
    },
    customSubmitText: {
        fontSize: 14,
        fontWeight: '700',
        color: DS.bg,
    },
    customValueBox: {
        borderWidth: 1,
        borderColor: DS.cyanMuted,
        borderRadius: 5,
        paddingHorizontal: 12,
        paddingVertical: 6,
        alignSelf: 'flex-start',
    },
    customValueText: {
        fontSize: 12,
        fontWeight: '400',
        color: DS.cyanMuted,
    },
});

export default HeightScreen;
