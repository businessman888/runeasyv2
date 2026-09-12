import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StatusBar,
    TouchableOpacity,
    Animated,
    Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, typography, fonts, createThemeStyles, useThemeSubscription, getThemeStatusBarStyle } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { useReadinessStore } from '../../stores/readinessStore';
import type { RootStackParamList } from '../../navigation/navigationRef';

type Props = NativeStackScreenProps<RootStackParamList, 'ReadinessSuccess'>;

/**
 * O que esta tela tem o direito de afirmar.
 *
 * Ela dizia "Seu plano de treino foi ajustado com base na sua análise de hoje"
 * sem existir caminho de escrita nenhum no plano. "Ajustado" só pode aparecer
 * quando um ajuste foi DE FATO aplicado — a R.2b liga `planAdjusted` ao
 * `applied: true` da Fase 6. Até lá, ninguém passa esse parâmetro.
 */
const SUBTITLE = {
    registrado:
        'Registramos seu check-in de hoje. Sua análise fica no card de prontidão, na aba Wellness.',
    ajustado: 'Registramos seu check-in e aliviamos o seu treino de amanhã.',
} as const;

export function ReadinessSuccessScreen({ navigation, route }: Props) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();
    const resetQuiz = useReadinessStore((s) => s.resetQuiz);
    const planAdjusted = route.params?.planAdjusted === true;

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
        // Para a WELLNESS, não a Home: é lá que o card vira "Respondido hoje" —
        // e é por ele que a análise pode ser relida depois.
        navigation.reset({
            index: 0,
            routes: [{ name: 'Main', params: { initialTab: 'Wellness' } }],
        });
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
            <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />

            {/* Animated Check Icon */}
            <View style={styles.iconSection}>
                <Animated.View style={[styles.circleContainer, { transform: [{ scale: scaleAnim }] }]}>
                    <View style={styles.outerCircle}>
                        <View style={styles.innerCircle}>
                            <Animated.View style={{ transform: [{ scale: checkmarkScale }] }}>
                                <Ionicons name="checkmark" size={60} color={semanticColors.textOnAccent} />
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
                <Text style={styles.title} accessibilityRole="header">Prontidão Registrada!</Text>
                <Text style={styles.subtitle}>
                    {planAdjusted ? SUBTITLE.ajustado : SUBTITLE.registrado}
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
                    accessibilityRole="button"
                    accessibilityLabel="Entendi"
                >
                    <Text style={styles.confirmButtonText}>Entendi</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = createThemeStyles(() => ({
    container: {
        flex: 1,
        backgroundColor: semanticColors.canvas,
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
        backgroundColor: semanticColors.accentSubtle,
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
        fontFamily: fonts.bold,
        fontSize: 28,
        color: semanticColors.textPrimary,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textSecondary,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: spacing.lg,
    },
    info: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textTertiary,
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
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textOnAccent,
    },
}));
