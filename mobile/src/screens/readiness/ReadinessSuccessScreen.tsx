import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    TouchableOpacity,
    Animated,
    Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { useReadinessStore } from '../../stores/readinessStore';

export function ReadinessSuccessScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();
    const { resetQuiz } = useReadinessStore();

    // Animations
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideUpAnim = useRef(new Animated.Value(30)).current;
    const checkmarkScale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Sequence of animations
        Animated.sequence([
            // 1. Scale in the circle
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 50,
                friction: 7,
                useNativeDriver: true,
            }),
            // 2. Pop the checkmark
            Animated.spring(checkmarkScale, {
                toValue: 1,
                tension: 100,
                friction: 5,
                useNativeDriver: true,
            }),
        ]).start();

        // Fade in text content
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                delay: 300,
                useNativeDriver: true,
            }),
            Animated.timing(slideUpAnim, {
                toValue: 0,
                duration: 600,
                delay: 300,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const handleConfirm = () => {
        resetQuiz();
        // Navigate to Main tabs (the authenticated route)
        navigation.reset({
            index: 0,
            routes: [{ name: 'Main', params: { initialTab: 'Home' } }],
        });
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
            <StatusBar barStyle="light-content" backgroundColor="#0A0A14" />

            {/* Animated Check Icon */}
            <View style={styles.iconSection}>
                <Animated.View style={[styles.circleContainer, { transform: [{ scale: scaleAnim }] }]}>
                    <View style={styles.outerCircle}>
                        <View style={styles.innerCircle}>
                            <Animated.View style={{ transform: [{ scale: checkmarkScale }] }}>
                                <Ionicons name="checkmark" size={60} color="#0A0A14" />
                            </Animated.View>
                        </View>
                    </View>
                </Animated.View>
            </View>

            <Animated.View style={[
                styles.textContent,
                {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideUpAnim }],
                }
            ]}>
                <Text style={styles.title}>Prontidão Registrada!</Text>
                <Text style={styles.subtitle}>
                    Dados sincronizados com sucesso. Seu plano de treino foi ajustado com base na sua análise de hoje.
                </Text>
                <Text style={styles.info}>
                    Próximo check-in disponível amanhã após as 03:00 AM.
                </Text>
            </Animated.View>

            {/* Confirm Button */}
            <View style={styles.buttonContainer}>
                <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={handleConfirm}
                    activeOpacity={0.8}
                >
                    <Text style={styles.confirmButtonText}>Entendi</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A14',
        paddingHorizontal: spacing.lg,
    },
    iconSection: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    circleContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    outerCircle: {
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    innerCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    textContent: {
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.xl,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    subtitle: {
        fontSize: typography.fontSizes.md,
        color: 'rgba(255, 255, 255, 0.8)',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: spacing.lg,
    },
    info: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        lineHeight: 20,
    },
    buttonContainer: {
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.xl,
    },
    confirmButton: {
        backgroundColor: colors.primary,
        paddingVertical: 18,
        borderRadius: 32,
        alignItems: 'center',
    },
    confirmButtonText: {
        fontSize: typography.fontSizes.md,
        fontWeight: '600',
        color: '#0A0A14',
    },
});
