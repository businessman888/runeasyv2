import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Animated,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

// Design System Colors (Figma)
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00D4FF',
    cyanMuted: 'rgba(0, 127, 153, 0.3)',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    glassBorder: 'rgba(235, 235, 245, 0.1)',
};

// Circular checkbox component
const CircularCheckbox = ({ selected }: { selected: boolean }) => (
    <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected && (
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path
                    d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                    fill={DS.bg}
                />
            </Svg>
        )}
    </View>
);

interface LimitationsScreenProps {
    value?: { hasLimitation: boolean; details: string };
    onChange?: (value: { hasLimitation: boolean; details: string }) => void;
}

export function LimitationsScreen({ value, onChange }: LimitationsScreenProps) {
    const [hasLimitation, setHasLimitation] = useState(value?.hasLimitation || false);
    const [details, setDetails] = useState(value?.details || '');

    // Animation for details input
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(-20)).current;

    useEffect(() => {
        if (value) {
            setHasLimitation(value.hasLimitation);
            setDetails(value.details);
        }
    }, [value]);

    // Animate details field when hasLimitation changes
    useEffect(() => {
        if (hasLimitation) {
            // Fade in + slide down
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            // Fade out + slide up
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: -20,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [hasLimitation]);

    const handleOptionSelect = (option: boolean) => {
        setHasLimitation(option);
        if (!option) {
            setDetails(''); // Clear details when selecting NO
        }
        if (onChange) {
            onChange({
                hasLimitation: option,
                details: option ? details : '',
            });
        }
    };

    const handleDetailsChange = (text: string) => {
        setDetails(text);
        if (onChange) {
            onChange({
                hasLimitation,
                details: text,
            });
        }
    };

    return (
        <View style={styles.container}>
            {/* Title Section - with proper padding-top */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Você possui alguma{'\n'}
                    <Text style={styles.titleHighlight}>lesão ou limitação</Text>?
                </Text>
                <Text style={styles.subtitle}>
                    Lesões anteriores, problemas de saúde ou restrições físicas.
                </Text>
            </View>

            {/* SIM/NÃO Options */}
            <View style={styles.optionsContainer}>
                {/* SIM Option */}
                <TouchableOpacity
                    style={[
                        styles.optionCard,
                        hasLimitation && styles.optionCardSelected,
                    ]}
                    onPress={() => handleOptionSelect(true)}
                    activeOpacity={0.7}
                >
                    <CircularCheckbox selected={hasLimitation} />
                    <View style={styles.optionContent}>
                        <Text style={[
                            styles.optionTitle,
                            hasLimitation && styles.optionTitleSelected,
                        ]}>
                            Sim
                        </Text>
                        <Text style={styles.optionSubtitle}>
                            Tenho uma lesão ou limitação física
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* NÃO Option */}
                <TouchableOpacity
                    style={[
                        styles.optionCard,
                        !hasLimitation && styles.optionCardSelected,
                    ]}
                    onPress={() => handleOptionSelect(false)}
                    activeOpacity={0.7}
                >
                    <CircularCheckbox selected={!hasLimitation} />
                    <View style={styles.optionContent}>
                        <Text style={[
                            styles.optionTitle,
                            !hasLimitation && styles.optionTitleSelected,
                        ]}>
                            Não
                        </Text>
                        <Text style={styles.optionSubtitle}>
                            Não possuo limitações físicas
                        </Text>
                    </View>
                </TouchableOpacity>
            </View>

            {/* Details Input - CONDITIONALLY RENDERED only when SIM */}
            {hasLimitation && (
                <Animated.View
                    style={[
                        styles.detailsContainer,
                        {
                            opacity: fadeAnim,
                            transform: [{ translateY: slideAnim }],
                        },
                    ]}
                >
                    <Text style={styles.detailsLabel}>Descreva sua limitação:</Text>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Ex: dor no joelho direito, tendinite no tornozelo..."
                        placeholderTextColor={DS.textSecondary}
                        value={details}
                        onChangeText={handleDetailsChange}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                    <Text style={styles.helperText}>
                        💡 Esta informação ajuda a IA a criar um plano mais seguro para você
                    </Text>
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 8, // Ensures no overlap with progress bar
    },
    titleContainer: {
        marginBottom: 32,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: DS.text,
        lineHeight: 32,
        marginBottom: 12,
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
    optionsContainer: {
        gap: 12,
        marginBottom: 24,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DS.card,
        borderRadius: 16,
        padding: 16,
        borderWidth: 2,
        borderColor: 'transparent',
        gap: 14,
    },
    optionCardSelected: {
        borderColor: DS.cyan,
        backgroundColor: DS.cyanMuted,
        // Glow effect
        shadowColor: DS.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 4,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: DS.textSecondary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: DS.cyan,
        borderColor: DS.cyan,
    },
    optionContent: {
        flex: 1,
    },
    optionTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: DS.text,
        marginBottom: 2,
    },
    optionTitleSelected: {
        color: DS.cyan,
    },
    optionSubtitle: {
        fontSize: 13,
        fontWeight: '400',
        color: DS.textSecondary,
    },
    detailsContainer: {
        marginTop: 8,
    },
    detailsLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: DS.text,
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: DS.glassBorder,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        color: DS.text,
        minHeight: 100,
    },
    helperText: {
        fontSize: 12,
        color: DS.textSecondary,
        marginTop: 10,
        lineHeight: 16,
    },
});

export default LimitationsScreen;
