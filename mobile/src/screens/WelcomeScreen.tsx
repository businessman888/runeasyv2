import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    ImageBackground,
    TouchableOpacity,
    AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    runOnJS,
} from 'react-native-reanimated';
import { useAuthStore, getDisplayName } from '../stores/authStore';
import { semanticColors } from '../theme/semanticColors';
import { fonts, createThemeStyles, useThemeSubscription, getThemeStatusBarStyle } from '../theme';

// ============================================
// FORCED COLORS (Figma 1391:1686)
// ============================================






const FADE_IN_MS = 500;
const FADE_OUT_MS = 300;

const bgImage = require('../assets/images/imageWelcome/bgWelcomeScreen.jpeg');

/** Primeiro nome do usuário, com fallbacks seguros. */
function getFirstName(user: ReturnType<typeof useAuthStore.getState>['user']): string {
    const first = user?.profile?.firstname?.trim();
    if (first) return first.split(' ')[0];
    const display = getDisplayName(user).trim();
    if (display) return display.split(' ')[0];
    return 'Corredor';
}

export function WelcomeScreen({ navigation }: any) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();
    const user = useAuthStore((s) => s.user);
    const firstName = getFirstName(user);

    const [reduceMotion, setReduceMotion] = useState(false);
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(12);

    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
            if (!mounted) return;
            setReduceMotion(rm);
            // Fade-in ao montar (reduce-motion → fade curto, sem translate).
            opacity.value = withTiming(1, {
                duration: rm ? 150 : FADE_IN_MS,
                easing: Easing.out(Easing.cubic),
            });
            translateY.value = rm ? 0 : withTiming(0, {
                duration: FADE_IN_MS,
                easing: Easing.out(Easing.cubic),
            });
        });
        return () => {
            mounted = false;
        };
    }, [opacity, translateY]);

    const goToOnboarding = useCallback(() => {
        navigation.navigate('Onboarding', { userId: user?.id });
    }, [navigation, user?.id]);

    const handleStart = useCallback(() => {
        // Fade-out de saída e, ao terminar, navega para o primeiro step.
        opacity.value = withTiming(
            0,
            { duration: reduceMotion ? 0 : FADE_OUT_MS, easing: Easing.in(Easing.cubic) },
            (finished) => {
                if (finished) runOnJS(goToOnboarding)();
            },
        );
    }, [opacity, reduceMotion, goToOnboarding]);

    const contentStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <View style={styles.container}>
            <StatusBar barStyle={getThemeStatusBarStyle()} translucent backgroundColor="transparent" />

            <ImageBackground source={bgImage} style={StyleSheet.absoluteFill} resizeMode="cover">
                {/* Película escura sólida (Figma) */}
                <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none" />
                {/* Gradiente sutil topo→base apenas para legibilidade premium */}
                <LinearGradient
                    colors={[semanticColors.scrim, semanticColors.transparent, semanticColors.scrim]}
                    locations={[0, 0.45, 1]}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />
            </ImageBackground>

            <Animated.View
                style={[
                    styles.content,
                    contentStyle,
                    { paddingTop: insets.top + 48, paddingBottom: Math.max(insets.bottom, 16) + 8 },
                ]}
            >
                <View style={styles.textBlock}>
                    <Text style={styles.title} accessibilityRole="header">
                        {'Bem vindo(a)\n'}
                        ao clube {firstName}
                    </Text>
                    <Text style={styles.subtitle}>
                        Nós estamos muito felizes em ter você como parte da nossa comunidade de
                        corredores!
                    </Text>
                </View>

                <TouchableOpacity
                    style={styles.button}
                    onPress={handleStart}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Vamos lá"
                    accessibilityHint="Inicia a configuração do seu treino"
                >
                    <Text style={styles.buttonText}>Vamos lá!</Text>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

const styles = createThemeStyles(() => ({
    container: {
        flex: 1,
        backgroundColor: semanticColors.canvas,
    },
    overlay: {
        backgroundColor: semanticColors.scrim,
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        justifyContent: 'space-between',
    },
    textBlock: {
        alignItems: 'center',
        gap: 16,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 24,
        lineHeight: 36,
        textAlign: 'center',
        color: semanticColors.textPrimary,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        lineHeight: 22.5,
        textAlign: 'center',
        color: semanticColors.textSecondary,
        paddingHorizontal: 8,
    },
    button: {
        height: 55,
        borderRadius: 30,
        backgroundColor: semanticColors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: semanticColors.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 8,
    },
    buttonText: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: semanticColors.textOnAccent,
    },
}));

export default WelcomeScreen;
