import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    Dimensions,
    Image,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    cancelAnimation,
    Easing,
    runOnJS,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { borderRadius, colors, fonts, shadows } from '../theme';
import { StoryProgressBars } from '../components/landing/StoryProgressBars';
import { PrePaywallBackground } from '../components/upgrade/PrePaywallBackground';
import {
    LANDING_LOGO,
    LANDING_SLIDES,
    LandingSlide,
    SLIDE_DURATION,
} from '../constants/landingSlides';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base de escala CAPADA a dimensões de phone. Em tablet a tela é muito maior
// que o design 375x812 e a escala crua estourava o conteúdo (a imagem "bleed"
// virava um quadrado do tamanho da tela). Capar em ~440x950 mantém o phone
// idêntico (largura/altura de phone < cap) e impede o blow-up em tablet — o
// conteúdo fica em tamanho de phone, centralizado na tela maior.
const BASE_W = Math.min(SCREEN_WIDTH, 440);
const BASE_H = Math.min(SCREEN_HEIGHT, 950);

// Responsive scaling based on Figma 375x812 design
const scaleX = (size: number) => (BASE_W / 375) * size;
const scaleY = (size: number) => (BASE_H / 812) * size;
const scaleFont = (size: number) => {
    const scale = Math.min(BASE_W / 375, BASE_H / 812);
    return Math.round(size * scale);
};

const TOTAL = LANDING_SLIDES.length;
const FADE_DURATION = 350;

// ---------------------------------------------------------------------------
// Single slide — all slides stay mounted; only opacity cross-fades. Mounting
// once means each image decodes a single time → no jank when switching.
// ---------------------------------------------------------------------------
type SlideProps = {
    slide: LandingSlide;
    index: number;
    activeIndex: number;
    padTop: number;
    padBottom: number;
};

const Slide = memo(({ slide, index, activeIndex, padTop, padBottom }: SlideProps) => {
    const fadeStyle = useAnimatedStyle(
        () => ({ opacity: withTiming(index === activeIndex ? 1 : 0, { duration: FADE_DURATION }) }),
        [index, activeIndex],
    );

    return (
        <Animated.View
            style={[
                StyleSheet.absoluteFill,
                styles.slide,
                { opacity: index === 0 ? 1 : 0, paddingTop: padTop, paddingBottom: padBottom },
                fadeStyle,
            ]}
            pointerEvents="none"
            accessibilityElementsHidden={index !== activeIndex}
            importantForAccessibility={index === activeIndex ? 'auto' : 'no-hide-descendants'}
        >
            <View style={styles.slideHeader}>
                {slide.variant === 'logo' && (
                    <Image source={LANDING_LOGO} style={styles.logo} resizeMode="contain" />
                )}
                <Text style={styles.title}>{slide.title}</Text>
                {slide.subtitle && <Text style={styles.subtitle}>{slide.subtitle}</Text>}
            </View>

            <View style={styles.imageStage}>
                {slide.imageMode === 'bleed' ? (
                    <Image
                        source={slide.image}
                        style={styles.bleedImage}
                        resizeMode="contain"
                    />
                ) : (
                    <Image
                        source={slide.image}
                        style={styles.containedImage}
                        resizeMode="contain"
                    />
                )}
            </View>
        </Animated.View>
    );
});
Slide.displayName = 'LandingSlide';

export function LandingScreen({ navigation }: { navigation: any }) {
    const insets = useSafeAreaInsets();
    const reducedMotion = useReducedMotion();

    const [activeIndex, setActiveIndex] = useState(0);
    const progress = useSharedValue(0);

    // press bookkeeping for the stories tap/hold interaction
    const pressStart = useRef(0);
    const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const goNext = useCallback(() => setActiveIndex((p) => (p + 1) % TOTAL), []);
    const goPrev = useCallback(() => setActiveIndex((p) => (p - 1 + TOTAL) % TOTAL), []);

    // Drive the active segment's fill from `from`→1, then auto-advance.
    const play = useCallback(
        (from: number) => {
            if (fallbackTimer.current) {
                clearTimeout(fallbackTimer.current);
                fallbackTimer.current = null;
            }
            if (reducedMotion) {
                progress.value = 1;
                fallbackTimer.current = setTimeout(goNext, SLIDE_DURATION * (1 - from));
                return;
            }
            progress.value = from;
            progress.value = withTiming(
                1,
                { duration: SLIDE_DURATION * (1 - from), easing: Easing.linear },
                (finished) => {
                    if (finished) runOnJS(goNext)();
                },
            );
        },
        [goNext, progress, reducedMotion],
    );

    // (Re)start whenever the active slide changes.
    useEffect(() => {
        cancelAnimation(progress);
        play(0);
        return () => {
            cancelAnimation(progress);
            if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
        };
    }, [activeIndex, play, progress]);

    const handlePressIn = useCallback(() => {
        pressStart.current = Date.now();
        cancelAnimation(progress);
        if (fallbackTimer.current) {
            clearTimeout(fallbackTimer.current);
            fallbackTimer.current = null;
        }
    }, [progress]);

    const handlePressOut = useCallback(
        (zone: 'left' | 'right') => {
            const isTap = Date.now() - pressStart.current < 220;
            if (isTap) {
                if (zone === 'left') goPrev();
                else goNext();
            } else {
                // hold released → resume from frozen position
                play(progress.value);
            }
        },
        [goNext, goPrev, play, progress],
    );

    // Get started button press feedback
    const btnScale = useSharedValue(1);
    const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

    // Reserve space for the progress bars (top) and the gradient/button (bottom)
    // so the centered text+image group sits in the visible middle.
    const slidePadTop = insets.top + scaleY(40);
    const slidePadBottom = insets.bottom + scaleY(150);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Premium radial-glow background (shared with PrePaywall) */}
            <PrePaywallBackground />

            {/* Cross-fading slides (all mounted) */}
            <View style={StyleSheet.absoluteFill}>
                {LANDING_SLIDES.map((slide, i) => (
                    <Slide
                        key={slide.key}
                        slide={slide}
                        index={i}
                        activeIndex={activeIndex}
                        padTop={slidePadTop}
                        padBottom={slidePadBottom}
                    />
                ))}
            </View>

            {/* Stories progress bars */}
            <View style={[styles.progressWrap, { paddingTop: insets.top + scaleY(10) }]}>
                <StoryProgressBars count={TOTAL} activeIndex={activeIndex} progress={progress} />
            </View>

            {/* Tap zones: left → previous, right → next, hold → pause */}
            <View
                style={[styles.tapZones, { top: insets.top + scaleY(40), bottom: insets.bottom + scaleY(118) }]}
            >
                <Pressable
                    style={styles.tapLeft}
                    onPressIn={handlePressIn}
                    onPressOut={() => handlePressOut('left')}
                    accessibilityRole="button"
                    accessibilityLabel="Slide anterior"
                />
                <Pressable
                    style={styles.tapRight}
                    onPressIn={handlePressIn}
                    onPressOut={() => handlePressOut('right')}
                    accessibilityRole="button"
                    accessibilityLabel="Próximo slide"
                />
            </View>

            {/* Bottom: shadow gradient + Get started */}
            <LinearGradient
                colors={['transparent', 'rgba(10, 10, 24, 0.85)', colors.background] as const}
                locations={[0, 0.55, 1]}
                style={[styles.bottomGradient, { height: scaleY(280) }]}
                pointerEvents="box-none"
            >
                <View style={[styles.bottomContent, { paddingBottom: insets.bottom + scaleY(34) }]}>
                    <Animated.View style={btnStyle}>
                        <Pressable
                            onPress={() => navigation.navigate('Login')}
                            onPressIn={() => { btnScale.value = withSpring(0.96); }}
                            onPressOut={() => { btnScale.value = withSpring(1); }}
                            style={styles.getStartedButton}
                            accessibilityRole="button"
                            accessibilityLabel="Get started"
                        >
                            <Text style={styles.getStartedText}>Get started</Text>
                        </Pressable>
                    </Animated.View>
                </View>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    // --- slide ---
    slide: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    slideHeader: {
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: scaleX(28),
    },
    logo: {
        width: scaleX(196),
        height: scaleY(86),
        marginBottom: scaleY(18),
    },
    title: {
        fontFamily: fonts.extrabold,
        fontSize: scaleFont(25),
        lineHeight: scaleFont(32),
        color: colors.white,
        textAlign: 'center',
        letterSpacing: 0.2,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: scaleFont(15),
        lineHeight: scaleFont(22),
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: scaleY(12),
    },
    imageStage: {
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: scaleY(12),
    },
    bleedImage: {
        width: BASE_W,
        height: BASE_W,
    },
    containedImage: {
        width: '86%',
        height: scaleY(360),
    },
    // --- progress ---
    progressWrap: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingHorizontal: scaleX(16),
    },
    // --- tap zones ---
    tapZones: {
        position: 'absolute',
        left: 0,
        right: 0,
        flexDirection: 'row',
    },
    tapLeft: { flex: 1 },
    tapRight: { flex: 2 },
    // --- bottom ---
    bottomGradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'flex-end',
    },
    bottomContent: {
        alignItems: 'center',
        paddingHorizontal: scaleX(20),
    },
    getStartedButton: {
        width: SCREEN_WIDTH - scaleX(40),
        height: scaleY(56),
        backgroundColor: colors.primary,
        borderRadius: borderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadows.neon,
    },
    getStartedText: {
        fontFamily: fonts.bold,
        fontSize: scaleFont(18),
        color: colors.backgroundLight,
        letterSpacing: 0.3,
    },
});
