import React, { useCallback, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    Animated,
    Easing,
    type LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, shadows, createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { useProFeature } from '../../hooks/useProFeature';

// Figma node 1275:1495 (modalInitiateTrial) — premium bottom sheet.


const FALLBACK_HEIGHT = 420;

interface TrialModalProps {
    visible: boolean;
    onClose: () => void;
}

/**
 * One-time "Iniciar Teste Grátis" promo sheet. Slides up smoothly with a
 * fading backdrop; closes via the X, a backdrop tap, or the Android back
 * button. The CTA opens the Superwall paywall (same flow as the upgrade cards).
 */
export function TrialModal({ visible, onClose }: TrialModalProps) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();
    const { presentPaywall } = useProFeature();

    const sheetHeight = useRef(FALLBACK_HEIGHT);
    const translateY = useRef(new Animated.Value(FALLBACK_HEIGHT)).current;
    const backdrop = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) return;
        // Reset to the off-screen start before animating in (covers re-entry).
        translateY.setValue(sheetHeight.current);
        backdrop.setValue(0);
        Animated.parallel([
            Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
            Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
                damping: 22,
                stiffness: 220,
                mass: 0.9,
            }),
        ]).start();
    }, [visible, backdrop, translateY]);

    const animateOut = useCallback(
        (after: () => void) => {
            Animated.parallel([
                Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
                Animated.timing(translateY, {
                    toValue: sheetHeight.current,
                    duration: 200,
                    easing: Easing.in(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]).start(({ finished }) => {
                if (finished) after();
            });
        },
        [backdrop, translateY],
    );

    const handleClose = useCallback(() => animateOut(onClose), [animateOut, onClose]);

    const handleStartTrial = useCallback(() => {
        // This sheet is itself a teaser, so it opens the paywall directly
        // (skipping the PrePaywall interstitial that the cards route through).
        animateOut(() => {
            onClose();
            void presentPaywall();
        });
    }, [animateOut, onClose, presentPaywall]);

    const onSheetLayout = (e: LayoutChangeEvent) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) sheetHeight.current = h;
    };

    return (
        <Modal
            visible={visible}
            transparent
            statusBarTranslucent
            animationType="none"
            onRequestClose={handleClose}
        >
            <View style={styles.root}>
                {/* Backdrop — tap outside to dismiss */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={handleClose}
                        accessibilityRole="button"
                        accessibilityLabel="Fechar"
                    />
                </Animated.View>

                {/* Sheet */}
                <Animated.View
                    onLayout={onSheetLayout}
                    accessibilityViewIsModal
                    style={[styles.sheetWrap, { transform: [{ translateY }] }]}
                >
                    <LinearGradient
                        colors={([semanticColors.surface1, semanticColors.surface2] as const)}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}
                    >
                        <View style={styles.handle} />

                        <Pressable
                            onPress={handleClose}
                            hitSlop={12}
                            style={styles.closeBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Fechar"
                        >
                            <Ionicons name="close" size={24} color={semanticColors.textPrimary} />
                        </Pressable>

                        <Text style={styles.title}>Destrave todo o{'\n'}seu potencial</Text>
                        <Text style={styles.subtitle}>
                            Desbloqueie recursos exclusivos da Runeasy para você evoluir de
                            verdade superando seus limites com segurança.
                        </Text>

                        <Pressable
                            onPress={handleStartTrial}
                            accessibilityRole="button"
                            accessibilityLabel="Iniciar teste grátis"
                            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
                        >
                            <Text style={styles.ctaText}>Iniciar Teste Grátis</Text>
                        </Pressable>
                    </LinearGradient>
                </Animated.View>
            </View>
        </Modal>
    );
}

export default TrialModal;

const styles = createThemeStyles(() => ({
    root: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        backgroundColor: semanticColors.scrim,
    },
    sheetWrap: {
        width: '100%',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 24,
        paddingTop: 12,
    },
    handle: {
        width: 60,
        height: 6,
        borderRadius: 3,
        backgroundColor: semanticColors.borderSubtle,
        alignSelf: 'center',
        marginBottom: 22,
    },
    closeBtn: {
        position: 'absolute',
        top: 14,
        right: 16,
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 30,
        lineHeight: 38,
        letterSpacing: -0.3,
        color: colors.primary,
        marginTop: 6,
    },
    subtitle: {
        fontFamily: fonts.medium,
        fontSize: 15,
        lineHeight: 22,
        color: colors.proMutedText,
        marginTop: 14,
    },
    cta: {
        height: 52,
        borderRadius: 30,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 28,
        ...shadows.neon,
    },
    ctaPressed: {
        opacity: 0.85,
    },
    ctaText: {
        fontFamily: fonts.semibold,
        fontSize: 16,
        color: semanticColors.textOnAccent,
    },
}));
