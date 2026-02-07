import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    Animated,
    Image,
    ScrollView,
} from 'react-native';
import { colors, borderRadius } from '../../theme';

interface HeightScreenProps {
    value: number | null;
    onChange: (height: number) => void;
}

const HEIGHT_OPTIONS = [195, 190, 185, 180, 175, 170, 165, 160, 155, 150];

export const HeightScreen: React.FC<HeightScreenProps> = ({
    value,
    onChange,
}) => {
    const [customHeight, setCustomHeight] = useState('');
    const scaleAnim = useRef(new Animated.Value(1)).current;

    // Animate avatar scale based on height value
    useEffect(() => {
        const heightValue = value || 175;
        // Scale from 0.8 (150cm) to 1.2 (195cm)
        const normalizedScale = 0.8 + ((heightValue - 150) / (195 - 150)) * 0.4;
        const clampedScale = Math.max(0.8, Math.min(1.2, normalizedScale));

        Animated.spring(scaleAnim, {
            toValue: clampedScale,
            friction: 8,
            tension: 40,
            useNativeDriver: true,
        }).start();
    }, [value, scaleAnim]);

    const handleSelectHeight = (height: number) => {
        setCustomHeight('');
        onChange(height);
    };

    const handleCustomChange = (text: string) => {
        const filtered = text.replace(/[^0-9]/g, '');
        setCustomHeight(filtered);

        const numValue = parseInt(filtered, 10);
        if (!isNaN(numValue) && numValue >= 100 && numValue <= 250) {
            onChange(numValue);
        }
    };

    const isHeightSelected = (height: number) => value === height;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>
                    Qual é a sua <Text style={styles.titleHighlight}>altura</Text>?
                </Text>
                <Text style={styles.subtitle}>
                    Escolha a opção exata ou a{'\n'}mais próxima.
                </Text>
            </View>

            {/* Content */}
            <View style={styles.content}>
                {/* Left: Height Selector */}
                <View style={styles.selectorContainer}>
                    {/* Scale Line */}
                    <View style={styles.scaleLine} />

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.selectorContent}
                    >
                        {HEIGHT_OPTIONS.map((height) => (
                            <TouchableOpacity
                                key={height}
                                style={styles.heightOption}
                                onPress={() => handleSelectHeight(height)}
                                activeOpacity={0.7}
                            >
                                <View style={[
                                    styles.heightMarker,
                                    isHeightSelected(height) && styles.heightMarkerSelected,
                                ]} />
                                <Text style={[
                                    styles.heightText,
                                    isHeightSelected(height) && styles.heightTextSelected,
                                ]}>
                                    {height} cm
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Custom Input */}
                    <View style={styles.customContainer}>
                        <Text style={styles.customLabel}>Outro valor</Text>
                        <View style={styles.customInputContainer}>
                            <TextInput
                                style={styles.customInput}
                                value={customHeight}
                                onChangeText={handleCustomChange}
                                placeholder="163 cm"
                                placeholderTextColor="rgba(0,127,153,0.3)"
                                keyboardType="number-pad"
                                maxLength={3}
                            />
                        </View>
                    </View>
                </View>

                {/* Right: Avatar */}
                <View style={styles.avatarContainer}>
                    <Animated.View
                        style={[
                            styles.avatarWrapper,
                            {
                                transform: [{ scale: scaleAnim }],
                            },
                        ]}
                    >
                        {/* Simple avatar representation */}
                        <View style={styles.avatarBody}>
                            {/* Head */}
                            <View style={styles.avatarHead} />
                            {/* Body */}
                            <View style={styles.avatarTorso}>
                                {/* Arms */}
                                <View style={styles.avatarArmLeft} />
                                <View style={styles.avatarArmRight} />
                            </View>
                            {/* Legs */}
                            <View style={styles.avatarLegs}>
                                <View style={styles.avatarLegLeft} />
                                <View style={styles.avatarLegRight} />
                            </View>
                        </View>
                    </Animated.View>
                </View>
            </View>
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
        flex: 1,
        flexDirection: 'row',
        paddingHorizontal: 11,
        paddingVertical: 5,
    },
    selectorContainer: {
        width: 80,
        position: 'relative',
    },
    scaleLine: {
        position: 'absolute',
        left: 8,
        top: 11,
        width: 2,
        height: 414,
        backgroundColor: 'rgba(235,235,245,0.2)',
    },
    selectorContent: {
        paddingLeft: 15,
    },
    heightOption: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 42,
    },
    heightMarker: {
        width: 8,
        height: 2,
        backgroundColor: 'rgba(235,235,245,0.3)',
        marginRight: 8,
    },
    heightMarkerSelected: {
        backgroundColor: colors.primary,
        width: 12,
    },
    heightText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(235,235,245,0.6)',
    },
    heightTextSelected: {
        color: colors.primary,
        fontSize: 11,
    },
    customContainer: {
        marginTop: 16,
        paddingLeft: 5,
    },
    customLabel: {
        fontSize: 7,
        fontWeight: '600',
        color: 'rgba(0,127,153,0.3)',
        marginBottom: 4,
    },
    customInputContainer: {
        borderWidth: 1,
        borderColor: 'rgba(0,127,153,0.3)',
        borderRadius: 5,
        paddingHorizontal: 5,
        paddingVertical: 4,
        width: 58,
    },
    customInput: {
        fontSize: 9,
        color: 'rgba(0,127,153,0.3)',
    },
    avatarContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarBody: {
        alignItems: 'center',
    },
    avatarHead: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.primary,
        marginBottom: 8,
    },
    avatarTorso: {
        width: 80,
        height: 100,
        backgroundColor: colors.primary,
        borderRadius: 20,
        position: 'relative',
        alignItems: 'center',
    },
    avatarArmLeft: {
        position: 'absolute',
        left: -20,
        top: 10,
        width: 24,
        height: 80,
        backgroundColor: colors.primary,
        borderRadius: 12,
    },
    avatarArmRight: {
        position: 'absolute',
        right: -20,
        top: 10,
        width: 24,
        height: 80,
        backgroundColor: colors.primary,
        borderRadius: 12,
    },
    avatarLegs: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 4,
    },
    avatarLegLeft: {
        width: 28,
        height: 100,
        backgroundColor: colors.primary,
        borderRadius: 14,
    },
    avatarLegRight: {
        width: 28,
        height: 100,
        backgroundColor: colors.primary,
        borderRadius: 14,
    },
});

export default HeightScreen;
