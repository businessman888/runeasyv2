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
import {
    LANDING_LOGO,
    LANDING_SLIDES,
    LandingSlide,
    SLIDE_DURATION,
} from '../constants/landingSlides';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Responsive scaling based on Figma 375x812 design
const scaleX = (size: number) => (SCREEN_WIDTH / 375) * size;
const scaleY = (size: number) => (SCREEN_HEIGHT / 812) * size;
const scaleFont = (size: number) => {
    const scale = Math.min(SCREEN_WIDTH / 375, SCREEN_HEIGHT / 812);
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
    topPadding: number;
};

const Slide = memo(({ slide, index, activeIndex, topPadding }: SlideProps) => {
    const fadeStyle = useAnimatedStyle(
        () => ({ opacity: withTiming(index === activeIndex ? 1 : 0, { duration: FADE_DURATION }) }),
        [index, activeIndex],
    );

    return (
        <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: index === 0 ? 1 : 0 }, fadeStyle]}
            pointerEvents="none"
            accessibilityElementsHidden={index !== activeIndex}
            importantForAccessibility={index === activeIndex ? 'auto' : 'no-hide-descendants'}
        >
            <View style={[styles.slideHeader, { paddingTop: topPadding }]}>
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

    const slideTopPadding = insets.top + scaleY(46);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Cross-fading slides (all mounted) */}
            <View style={StyleSheet.absoluteFill}>
                {LANDING_SLIDES.map((slide, i) => (
                    <Slide
                        key={slide.key}
                        slide={slide}
                        index={i}
                        activeIndex={activeIndex}
                        topPadding={slideTopPadding}
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
    slideHeader: {
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
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: scaleY(20),
    },
    bleedImage: {
        width: SCREEN_WIDTH,
        height: SCREEN_WIDTH,
    },
    containedImage: {
        width: '86%',
        height: '100%',
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
