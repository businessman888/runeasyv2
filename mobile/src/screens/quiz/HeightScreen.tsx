import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    ScrollView,
} from 'react-native';
import { colors, typography, borderRadius, shadows } from '../../theme';
import Svg, { Path, Circle } from 'react-native-svg';

const HEIGHT_OPTIONS = Array.from({ length: 61 }, (_, i) => 140 + i); // 140-200 cm

// Avatar Icon
const AvatarIcon = ({ scale }: { scale: number }) => (
    <Svg width={80 * scale} height={120 * scale} viewBox="0 0 80 120" fill="none">
        <Circle cx={40} cy={25} r={20} fill={colors.primary} />
        <Path
            d="M40 50C55 50 65 65 65 85V115H15V85C15 65 25 50 40 50Z"
            fill={colors.primary}
        />
    </Svg>
);

interface HeightScreenProps {
    value?: number | null;
    onChange?: (value: number) => void;
}

export function HeightScreen({ value, onChange }: HeightScreenProps) {
    const [selectedHeight, setSelectedHeight] = useState<number>(value || 170);
    const scrollViewRef = useRef<ScrollView>(null);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (value) {
            setSelectedHeight(value);
        }
    }, [value]);

    // Animate avatar scale based on height (0.8 to 1.2)
    useEffect(() => {
        const normalizedScale = 0.8 + ((selectedHeight - 140) / 60) * 0.4;
        Animated.spring(scaleAnim, {
            toValue: normalizedScale,
            useNativeDriver: true,
            friction: 8,
        }).start();
    }, [selectedHeight]);

    const handleHeightSelect = (height: number) => {
        setSelectedHeight(height);
        if (onChange) {
            onChange(height);
        }
    };

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Qual é a sua{'\n'}
                    <Text style={styles.titleHighlight}>altura?</Text>
                </Text>
                <Text style={styles.subtitle}>
                    Usamos para calcular seu IMC e ajustar o plano.
                </Text>
            </View>

            {/* Avatar Display */}
            <View style={styles.avatarContainer}>
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                    <AvatarIcon scale={1} />
                </Animated.View>
                <View style={styles.heightDisplay}>
                    <Text style={styles.heightValue}>{selectedHeight}</Text>
                    <Text style={styles.heightUnit}>cm</Text>
                </View>
            </View>

            {/* Height Selector */}
            <View style={styles.selectorContainer}>
                <ScrollView
                    ref={scrollViewRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.selectorContent}
                    snapToInterval={60}
                    decelerationRate="fast"
                >
                    {HEIGHT_OPTIONS.map((height) => (
                        <TouchableOpacity
                            key={height}
                            style={[
                                styles.heightOption,
                                selectedHeight === height && styles.heightOptionSelected
                            ]}
                            onPress={() => handleHeightSelect(height)}
                            activeOpacity={0.7}
                        >
                            <Text style={[
                                styles.heightOptionText,
                                selectedHeight === height && styles.heightOptionTextSelected
                            ]}>
                                {height}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Quick Select Buttons */}
            <View style={styles.quickSelectContainer}>
                {[155, 165, 175, 185].map((height) => (
                    <TouchableOpacity
                        key={height}
                        style={[
                            styles.quickButton,
                            selectedHeight === height && styles.quickButtonSelected
                        ]}
                        onPress={() => handleHeightSelect(height)}
                    >
                        <Text style={[
                            styles.quickButtonText,
                            selectedHeight === height && styles.quickButtonTextSelected
                        ]}>
                            {height}cm
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        lineHeight: 40,
        marginBottom: 12,
    },
    titleHighlight: {
        color: colors.primary,
    },
    subtitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        lineHeight: 24,
    },
    avatarContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    heightDisplay: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginTop: 16,
    },
    heightValue: {
        fontSize: 64,
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
    },
    heightUnit: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.medium,
        color: colors.textSecondary,
        marginLeft: 4,
    },
    selectorContainer: {
        marginBottom: 24,
    },
    selectorContent: {
        paddingHorizontal: 20,
        gap: 8,
    },
    heightOption: {
        width: 52,
        height: 52,
        borderRadius: borderRadius.lg,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 4,
    },
    heightOptionSelected: {
        backgroundColor: colors.primary,
        ...shadows.neon,
    },
    heightOptionText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
    },
    heightOptionTextSelected: {
        color: colors.background,
    },
    quickSelectContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    quickButton: {
        flex: 1,
        paddingVertical: 12,
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    quickButtonSelected: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(0, 212, 255, 0.08)',
    },
    quickButtonText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
    },
    quickButtonTextSelected: {
        color: colors.primary,
    },
});

export default HeightScreen;
