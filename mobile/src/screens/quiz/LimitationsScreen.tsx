import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Keyboard,
    TouchableWithoutFeedback
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

// Design System Colors (Figma)
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00D4FF',
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
    value?: { hasLimitation: boolean; details: string } | null;
    onChange?: (value: { hasLimitation: boolean; details: string }) => void;
}

export function LimitationsScreen({ value, onChange }: LimitationsScreenProps) {
    // Initialize state from props ONCE — no useEffect syncing to avoid infinite loops
    const [hasLimitation, setHasLimitation] = useState<boolean | null>(
        value && typeof value.hasLimitation === 'boolean' ? value.hasLimitation : null
    );
    const [details, setDetails] = useState(value?.details || '');

    // Animation for details input
    const fadeAnim = useRef(new Animated.Value(
        value?.hasLimitation === true ? 1 : 0
    )).current;

    // Stable onChange ref to avoid stale closures
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const handleOptionSelect = useCallback((option: boolean) => {
        setHasLimitation(option);

        // Animate details field
        Animated.timing(fadeAnim, {
            toValue: option ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
        }).start();

        const newDetails = option ? details : '';
        if (!option) {
            setDetails('');
        }

        // Notify parent — only on user interaction, never during render
        onChangeRef.current?.({
            hasLimitation: option,
            details: newDetails,
        });
    }, [details, fadeAnim]);

    const handleDetailsChange = useCallback((text: string) => {
        setDetails(text);
        if (hasLimitation !== null) {
            onChangeRef.current?.({
                hasLimitation: hasLimitation!,
                details: text,
            });
        }
    }, [hasLimitation]);

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
                {/* Title Section */}
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
                    {/* NÃO Option */}
                    <TouchableOpacity
                        style={styles.cardWrapper}
                        onPress={() => handleOptionSelect(false)}
                        activeOpacity={0.8}
                    >
                        {hasLimitation === false ? (
                            <LinearGradient
                                colors={['rgba(0, 212, 255, 0.15)', 'rgba(0, 212, 255, 0.05)']}
                                style={styles.cardGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <CircularCheckbox selected={true} />
                                <View style={styles.optionContent}>
                                    <Text style={[styles.optionTitle, styles.optionTitleSelected]}>Não</Text>
                                    <Text style={styles.optionSubtitle}>Não possuo limitações físicas</Text>
                                </View>
                            </LinearGradient>
                        ) : (
                            <View style={styles.cardDefault}>
                                <CircularCheckbox selected={false} />
                                <View style={styles.optionContent}>
                                    <Text style={styles.optionTitle}>Não</Text>
                                    <Text style={styles.optionSubtitle}>Não possuo limitações físicas</Text>
                                </View>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* SIM Option */}
                    <TouchableOpacity
                        style={styles.cardWrapper}
                        onPress={() => handleOptionSelect(true)}
                        activeOpacity={0.8}
                    >
                        {hasLimitation === true ? (
                            <LinearGradient
                                colors={['rgba(0, 212, 255, 0.15)', 'rgba(0, 212, 255, 0.05)']}
                                style={styles.cardGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <CircularCheckbox selected={true} />
                                <View style={styles.optionContent}>
                                    <Text style={[styles.optionTitle, styles.optionTitleSelected]}>Sim</Text>
                                    <Text style={styles.optionSubtitle}>Tenho uma lesão ou limitação física</Text>
                                </View>
                            </LinearGradient>
                        ) : (
                            <View style={styles.cardDefault}>
                                <CircularCheckbox selected={false} />
                                <View style={styles.optionContent}>
                                    <Text style={styles.optionTitle}>Sim</Text>
                                    <Text style={styles.optionSubtitle}>Tenho uma lesão ou limitação física</Text>
                                </View>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Details Input - CONDITIONALLY RENDERED only when SIM */}
                {hasLimitation === true && (
                    <Animated.View style={[styles.detailsContainer, { opacity: fadeAnim }]}>
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
        </TouchableWithoutFeedback>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 8,
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
        fontFamily: 'Inter-Bold',
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
        gap: 16,
        marginBottom: 24,
    },
    cardWrapper: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    cardDefault: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DS.card,
        padding: 16,
        gap: 14,
        borderWidth: 1,
        borderColor: DS.glassBorder,
        borderRadius: 16,
    },
    cardGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: DS.cyan,
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
        minHeight: 120,
    },
    helperText: {
        fontSize: 12,
        color: DS.textSecondary,
        marginTop: 10,
        lineHeight: 16,
    },
});

export default LimitationsScreen;
