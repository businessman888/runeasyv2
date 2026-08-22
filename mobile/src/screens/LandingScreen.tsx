import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    Dimensions,
    Image,
    ImageStyle,
    Pressable,
    StyleProp,
    StatusBar,
    StyleSheet,
    Text,
    TextStyle,
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
    withDelay,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { borderRadius, colors, fonts } from '../theme';
import { semanticColors } from '../theme/semanticColors';
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
const IMAGE_SIZE = Math.min(BASE_W, scaleY(350));
const CTA_WIDTH = Math.min(SCREEN_WIDTH - scaleX(40), 440);

type TypewriterTextProps = {
    active: boolean;
    reducedMotion: boolean;
    style: StyleProp<TextStyle>;
    text: string;
};

/**
 * Reserves the final title height before revealing it, so the image never jumps
 * while the copy is being written. Screen readers receive the complete phrase.
 */
const TypewriterText = memo(({ active, reducedMotion, style, text }: TypewriterTextProps) => {
    const [visibleCharacters, setVisibleCharacters] = useState(reducedMotion ? text.length : 0);

    useEffect(() => {
        if (!active) return;
        if (reducedMotion) {
            setVisibleCharacters(text.length);
            return;
        }

        setVisibleCharacters(0);
        let interval: ReturnType<typeof setInterval> | null = null;
        const start = setTimeout(() => {
            interval = setInterval(() => {
                setVisibleCharacters((current) => {
                    if (current >= text.length) {
                        if (interval) clearInterval(interval);
                        return text.length;
                    }
                    return current + 1;
                });
            }, 24);
        }, 140);

        return () => {
            clearTimeout(start);
            if (interval) clearInterval(interval);
        };
    }, [active, reducedMotion, text]);

    return (
        <View
            accessible
            accessibilityRole="header"
            accessibilityLabel={text.replace(/\n/g, ' ')}
            style={styles.typewriterFrame}
        >
            <Text
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={[style, styles.typewriterMeasure]}
                allowFontScaling
                maxFontSizeMultiplier={1.2}
            >
                {text}
            </Text>
            <Text
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={[style, styles.typewriterVisible]}
                allowFontScaling
                maxFontSizeMultiplier={1.2}
            >
                {text.slice(0, visibleCharacters)}
            </Text>
        </View>
    );
});
TypewriterText.displayName = 'LandingTypewriterText';

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
    reducedMotion: boolean;
};

const Slide = memo(({ slide, index, activeIndex, padTop, padBottom, reducedMotion }: SlideProps) => {
    const isActive = index === activeIndex;
    const startsVisible = reducedMotion && index === 0;
    const imageOpacity = useSharedValue(startsVisible ? 1 : 0);
    const imageScale = useSharedValue(startsVisible ? slide.imageScale : slide.imageScale * 0.93);
    const imageTranslateY = useSharedValue(startsVisible ? 0 : scaleY(14));
    const copyOpacity = useSharedValue(startsVisible ? 1 : 0);
    const copyTranslateY = useSharedValue(startsVisible ? 0 : scaleY(8));

    const fadeStyle = useAnimatedStyle(
        () => ({
            opacity: withTiming(isActive ? 1 : 0, {
                duration: reducedMotion ? 120 : FADE_DURATION,
                easing: Easing.out(Easing.cubic),
            }),
        }),
        [isActive, reducedMotion],
    );

    const imageStyle = useAnimatedStyle<ImageStyle>(() => {
        const transform: NonNullable<ImageStyle['transform']> = [
            { translateY: imageTranslateY.value },
            { scale: imageScale.value },
        ];

        return {
            opacity: imageOpacity.value,
            transform,
        };
    });

    const copyStyle = useAnimatedStyle(() => ({
        opacity: copyOpacity.value,
        transform: [{ translateY: copyTranslateY.value }],
    }));

    useEffect(() => {
        if (!isActive) return;

        cancelAnimation(imageOpacity);
        cancelAnimation(imageScale);
        cancelAnimation(imageTranslateY);
        cancelAnimation(copyOpacity);
        cancelAnimation(copyTranslateY);

        if (reducedMotion) {
            imageOpacity.value = 1;
            imageScale.value = slide.imageScale;
            imageTranslateY.value = 0;
            copyOpacity.value = 1;
            copyTranslateY.value = 0;
            return;
        }

        copyOpacity.value = 0;
        copyTranslateY.value = scaleY(8);
        imageOpacity.value = 0;
        imageScale.value = slide.imageScale * 0.93;
        imageTranslateY.value = scaleY(14);

        copyOpacity.value = withTiming(1, {
            duration: 360,
            easing: Easing.out(Easing.cubic),
        });
        copyTranslateY.value = withSpring(0, { damping: 22, stiffness: 180 });
        imageOpacity.value = withDelay(
            160,
            withTiming(1, { duration: 640, easing: Easing.out(Easing.cubic) }),
        );
        imageScale.value = withDelay(
            120,
            withTiming(slide.imageScale, { duration: 1800, easing: Easing.out(Easing.cubic) }),
        );
        imageTranslateY.value = withDelay(
            120,
            withSpring(0, { damping: 24, stiffness: 150 }),
        );
    }, [
        copyOpacity,
        copyTranslateY,
        imageOpacity,
        imageScale,
        imageTranslateY,
        isActive,
        reducedMotion,
        slide.imageScale,
    ]);

    const isCentered = slide.titleAlign === 'center';
    const titleStyle = slide.titleTone === 'brand' ? styles.titleBrand : styles.titleFeature;

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
            <Animated.View
                style={[
                    styles.slideHeader,
                    isCentered ? styles.slideHeaderCentered : styles.slideHeaderLeading,
                    copyStyle,
                ]}
            >
                {slide.variant === 'logo' && (
                    <Image
                        accessible
                        accessibilityLabel="RunEasy"
                        source={LANDING_LOGO}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                )}
                {slide.eyebrow && (
                    <Text
                        style={[styles.eyebrow, isCentered ? styles.textCentered : styles.textLeading]}
                        allowFontScaling
                        maxFontSizeMultiplier={1.2}
                    >
                        {slide.eyebrow}
                    </Text>
                )}
                <TypewriterText
                    active={isActive}
                    reducedMotion={reducedMotion}
                    text={slide.title}
                    style={[titleStyle, isCentered ? styles.textCentered : styles.textLeading]}
                />
                {slide.subtitle && (
                    <Text
                        style={[styles.subtitle, isCentered ? styles.textCentered : styles.textLeading]}
                        allowFontScaling
                        maxFontSizeMultiplier={1.25}
                    >
                        {slide.subtitle}
                    </Text>
                )}
            </Animated.View>

            <View style={styles.imageStage}>
                <Animated.Image
                    accessible
                    accessibilityLabel={`Ilustração: ${slide.title.replace(/\n/g, ' ')}`}
                    source={slide.image}
                    style={[
                        slide.imageMode === 'bleed' ? styles.bleedImage : styles.containedImage,
                        imageStyle,
                    ]}
                    resizeMode="contain"
                />
            </View>
        </Animated.View>
    );
});
Slide.displayName = 'LandingSlide';

type LandingScreenProps = {
    navigation: { navigate: (screen: 'Login') => void };
};

export function LandingScreen({ navigation }: LandingScreenProps) {
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

    // Primary CTA press feedback
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
                        reducedMotion={reducedMotion}
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
                    accessibilityLabel="Story anterior"
                    accessibilityHint="Exibe o conteúdo anterior da apresentação"
                />
                <Pressable
                    style={styles.tapRight}
                    onPressIn={handlePressIn}
                    onPressOut={() => handlePressOut('right')}
                    accessibilityRole="button"
                    accessibilityLabel="Próximo story"
                    accessibilityHint="Avança para o próximo conteúdo da apresentação"
                />
            </View>

            {/* Bottom: shadow gradient + primary CTA */}
            <LinearGradient
                colors={[semanticColors.transparent, semanticColors.overlayStrong, semanticColors.canvas] as const}
                locations={[0, 0.55, 1]}
                style={[styles.bottomGradient, { height: scaleY(280) }]}
                pointerEvents="box-none"
            >
                <View style={[styles.bottomContent, { paddingBottom: insets.bottom + scaleY(34) }]}>
                    <Animated.View style={[styles.buttonDiffuseContainer, btnStyle]}>
                        <Pressable
                            onPress={() => navigation.navigate('Login')}
                            onPressIn={() => {
                                btnScale.value = withSpring(0.97, { damping: 18, stiffness: 220 });
                            }}
                            onPressOut={() => {
                                btnScale.value = withSpring(1, { damping: 18, stiffness: 220 });
                            }}
                            style={styles.getStartedButton}
                            accessibilityRole="button"
                            accessibilityLabel="Começar"
                            accessibilityHint="Abre as opções de acesso ao RunEasy"
                        >
                            <LinearGradient
                                colors={[colors.primary, colors.primary, colors.primaryDark] as const}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFill}
                                pointerEvents="none"
                            />
                            <Text
                                style={styles.getStartedText}
                                allowFontScaling
                                maxFontSizeMultiplier={1.2}
                            >
                                começar
                            </Text>
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
        paddingHorizontal: scaleX(24),
    },
    slideHeaderCentered: {
        alignItems: 'center',
        paddingHorizontal: scaleX(32),
    },
    slideHeaderLeading: {
        alignItems: 'flex-start',
    },
    logo: {
        width: scaleX(184),
        height: scaleY(72),
        marginBottom: scaleY(16),
    },
    eyebrow: {
        width: '100%',
        marginBottom: scaleY(8),
        color: colors.primary,
        fontFamily: fonts.semibold,
        fontSize: scaleFont(12),
        lineHeight: scaleFont(16),
        letterSpacing: 1.35,
    },
    typewriterFrame: {
        position: 'relative',
        width: '100%',
    },
    typewriterMeasure: {
        opacity: 0,
    },
    typewriterVisible: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
    titleBrand: {
        fontFamily: fonts.extrabold,
        fontSize: scaleFont(26),
        lineHeight: scaleFont(33),
        color: colors.white,
        letterSpacing: -0.35,
    },
    titleFeature: {
        fontFamily: fonts.bold,
        fontSize: scaleFont(28),
        lineHeight: scaleFont(35),
        color: colors.white,
        letterSpacing: -0.55,
    },
    textCentered: {
        textAlign: 'center',
    },
    textLeading: {
        textAlign: 'left',
    },
    subtitle: {
        width: '100%',
        fontFamily: fonts.regular,
        fontSize: scaleFont(15),
        lineHeight: scaleFont(22),
        color: colors.textLight,
        opacity: 0.72,
        marginTop: scaleY(12),
        letterSpacing: -0.1,
    },
    imageStage: {
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: scaleY(16),
    },
    bleedImage: {
        width: IMAGE_SIZE,
        height: IMAGE_SIZE,
    },
    containedImage: {
        width: '86%',
        height: IMAGE_SIZE,
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
    buttonDiffuseContainer: {
        width: CTA_WIDTH,
        padding: scaleX(5),
        borderRadius: borderRadius.full,
        backgroundColor: colors.glassLight,
        borderWidth: 1,
        borderColor: colors.proGlassBorderCyan,
        shadowColor: semanticColors.canvas,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 12,
        elevation: 4,
    },
    getStartedButton: {
        width: '100%',
        height: scaleY(56),
        borderRadius: borderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    getStartedText: {
        fontFamily: fonts.bold,
        fontSize: scaleFont(17),
        color: colors.backgroundLight,
        letterSpacing: 0.15,
    },
});
