import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    AccessibilityInfo,
    View,
    StyleSheet,
    Image,
    Text,
    Platform,
    I18nManager,
    type LayoutChangeEvent,
    type LayoutRectangle,
    type ViewStyle,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import {
    GlassContainer,
    GlassView,
    isGlassEffectAPIAvailable,
    isLiquidGlassAvailable,
} from 'expo-glass-effect';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
} from 'react-native-reanimated';
import { TabBarIcon } from './TabBarIcon';
import { AppPressable } from './ui/AppPressable';
import { fonts, useAppTheme, type AppTheme } from '../theme';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { useAuthStore, getAvatarUrl, getDisplayName } from '../stores';
import { motionSpring } from '../theme/motion';

const androidApiLevel = Platform.OS === 'android'
    ? Number.parseInt(String(Platform.Version), 10)
    : 0;
const SUPPORTS_ANDROID_BLUR = Platform.OS === 'android' && androidApiLevel >= 31;

const PILL_RADIUS = 40;
const RAIL_WIDTH = 84;
const TOUCH_TARGET_SIZE = Platform.OS === 'android' ? 48 : 44;
const FOCUS_INDICATOR_WIDTH = Platform.OS === 'android' ? 64 : TOUCH_TARGET_SIZE + 8;
const FOCUS_INDICATOR_HEIGHT = Platform.OS === 'android' ? 36 : TOUCH_TARGET_SIZE + 8;
const FOCUS_INDICATOR_TOP = Platform.OS === 'android' ? 16 : 6;
const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

type IconName = 'home' | 'calendar' | 'trophy' | 'wellness' | 'profile';

function getIconName(routeName: string): IconName {
    switch (routeName) {
        case 'Home': return 'home';
        case 'Calendar': return 'calendar';
        case 'Ranking': return 'trophy';
        case 'Wellness': return 'wellness';
        case 'Settings': return 'profile';
        default: return 'home';
    }
}

/**
 * Styles resolved from the theme in context, not from the module-scope token
 * proxies. That is what lets `ThemeScope` pin this component to one palette —
 * the proxies read the global runtime and would ignore the scope.
 */
function useTabBarStyles() {
    const { theme } = useAppTheme();
    return useMemo(() => createStyles(theme), [theme]);
}

/**
 * Accessibility display preferences that materially change a translucent
 * navigation surface. Start opaque on iOS so Reduce Transparency never flashes
 * an inaccessible glass frame while the async system preference is loading.
 */
function useTabBarVisualPreferences() {
    const [preferOpaque, setPreferOpaque] = useState(true);
    const [increaseContrast, setIncreaseContrast] = useState(false);

    useEffect(() => {
        let mounted = true;

        if (Platform.OS === 'ios') {
            void Promise.all([
                AccessibilityInfo.isReduceTransparencyEnabled(),
                AccessibilityInfo.isDarkerSystemColorsEnabled(),
            ])
                .then(([reduceTransparency, darkerSystemColors]) => {
                    if (mounted) {
                        setPreferOpaque(reduceTransparency);
                        setIncreaseContrast(darkerSystemColors);
                    }
                })
                .catch(() => {
                    if (mounted) {
                        setPreferOpaque(false);
                    }
                });

            const transparencySubscription = AccessibilityInfo.addEventListener(
                'reduceTransparencyChanged',
                setPreferOpaque,
            );
            const contrastSubscription = AccessibilityInfo.addEventListener(
                'darkerSystemColorsChanged',
                setIncreaseContrast,
            );

            return () => {
                mounted = false;
                transparencySubscription.remove();
                contrastSubscription.remove();
            };
        }

        const handleHighContrast = (enabled: boolean) => {
            setPreferOpaque(enabled);
            setIncreaseContrast(enabled);
        };
        void AccessibilityInfo.isHighTextContrastEnabled()
            .then((enabled) => {
                if (mounted) {
                    handleHighContrast(enabled);
                }
            })
            .catch(() => {
                if (mounted) {
                    setPreferOpaque(false);
                }
            });
        const contrastSubscription = AccessibilityInfo.addEventListener(
            'highTextContrastChanged',
            handleHighContrast,
        );

        return () => {
            mounted = false;
            contrastSubscription.remove();
        };
    }, []);

    return { preferOpaque, increaseContrast };
}

interface TabBarMaterialProps {
    children: React.ReactNode;
    nativeLiquidGlass: boolean;
    preferOpaque: boolean;
    increaseContrast: boolean;
    blurTint: 'dark' | 'light';
    focusIndicator: React.ReactNode;
    onLayout: (event: LayoutChangeEvent) => void;
    styles: ReturnType<typeof createStyles>;
}

/** One functional material layer; the focus film is a child, never another blur. */
function TabBarMaterial({
    children,
    nativeLiquidGlass,
    preferOpaque,
    increaseContrast,
    blurTint,
    focusIndicator,
    onLayout,
    styles,
}: TabBarMaterialProps) {
    if (nativeLiquidGlass) {
        return (
            <GlassContainer
                spacing={12}
                onLayout={onLayout}
                style={[styles.glassPill, increaseContrast && styles.highContrastFrame]}
            >
                <GlassView
                    glassEffectStyle="regular"
                    colorScheme="auto"
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFill, styles.nativeBaseMaterial]}
                />
                {focusIndicator}
                {children}
            </GlassContainer>
        );
    }

    return (
        <View
            onLayout={onLayout}
            style={[styles.glassPill, increaseContrast && styles.highContrastFrame]}
        >
            {preferOpaque ? (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.opaqueMaterial]} />
            ) : (
                <>
                    {Platform.OS === 'android' ? (
                        <>
                            {SUPPORTS_ANDROID_BLUR ? (
                                <>
                                    <BlurView
                                        intensity={24}
                                        tint={blurTint}
                                        experimentalBlurMethod="dimezisBlurView"
                                        blurReductionFactor={4}
                                        pointerEvents="none"
                                        style={StyleSheet.absoluteFill}
                                    />
                                    <View
                                        pointerEvents="none"
                                        style={[StyleSheet.absoluteFill, styles.androidTonalVeil]}
                                    />
                                </>
                            ) : (
                                <View
                                    pointerEvents="none"
                                    style={[StyleSheet.absoluteFill, styles.opaqueMaterial]}
                                />
                            )}
                        </>
                    ) : (
                        <BlurView
                            intensity={40}
                            tint={blurTint}
                            pointerEvents="none"
                            style={StyleSheet.absoluteFill}
                        />
                    )}
                    <View
                        pointerEvents="none"
                        style={[StyleSheet.absoluteFill, styles.materialVeil]}
                    />
                </>
            )}
            {focusIndicator}
            {children}
        </View>
    );
}

/** Profile avatar with a neutral ring that strengthens when selected. */
function ProfileTabAvatar({ isFocused }: { isFocused: boolean }) {
    const styles = useTabBarStyles();
    const { user } = useAuthStore();
    const avatarUrl = getAvatarUrl(user);

    const initials = useMemo(() => {
        const name = getDisplayName(user);
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        return parts.length > 1
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : (parts[0][0]?.toUpperCase() ?? '?');
    }, [user]);

    return (
        <View style={[styles.avatarRing, isFocused ? styles.avatarRingActive : styles.avatarRingIdle]}>
            {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
                <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
            )}
        </View>
    );
}

function CustomTabBarInner({ state, descriptors, navigation }: BottomTabBarProps) {
    const { theme } = useAppTheme();
    const styles = useTabBarStyles();
    const blurTint = theme.isDark ? 'dark' : 'light';
    const insets = useSafeAreaInsets();
    const { isTablet, isLandscape } = useBreakpoint();
    const { reduceMotion } = useMotionPreferences();
    const { preferOpaque, increaseContrast } = useTabBarVisualPreferences();
    const itemLayouts = useRef<Record<string, LayoutRectangle>>({});
    const trackWidth = useRef(0);
    const didPositionIndicator = useRef(false);
    const indicatorX = useSharedValue(0);
    const indicatorOpacity = useSharedValue(0);
    const indicatorScaleX = useSharedValue(1);
    const indicatorScaleY = useSharedValue(1);

    const nativeLiquidGlass = useMemo(
        () => (
            Platform.OS === 'ios'
            && isLiquidGlassAvailable()
            && isGlassEffectAPIAvailable()
            && !preferOpaque
        ),
        [preferOpaque],
    );

    const focusedRouteKey = state.routes[state.index]?.key;

    const moveIndicator = useCallback((routeKey: string, animate: boolean) => {
        const layout = itemLayouts.current[routeKey];
        if (!layout) {
            return;
        }

        // Layout x is a physical coordinate. Measuring instead of calculating by
        // index keeps the focus correct in RTL and at both phone/tablet widths.
        if (I18nManager.isRTL && trackWidth.current <= 0) {
            return;
        }

        const physicalX = layout.x + (layout.width - FOCUS_INDICATOR_WIDTH) / 2;
        const logicalOriginX = I18nManager.isRTL
            ? trackWidth.current - FOCUS_INDICATOR_WIDTH
            : 0;
        const nextX = physicalX - logicalOriginX;
        const shouldAnimate = animate && didPositionIndicator.current && !reduceMotion;
        indicatorX.value = shouldAnimate
            ? withSpring(nextX, motionSpring.layout)
            : nextX;
        if (shouldAnimate) {
            // A brief horizontal stretch communicates direction while the spring
            // remains fully on the UI thread and interruptible by another tap.
            indicatorScaleX.value = withSequence(
                withSpring(1.12, motionSpring.press),
                withSpring(1, motionSpring.layout),
            );
            indicatorScaleY.value = withSequence(
                withSpring(0.94, motionSpring.press),
                withSpring(1, motionSpring.layout),
            );
        } else {
            indicatorScaleX.value = 1;
            indicatorScaleY.value = 1;
        }
        indicatorOpacity.value = 1;
        didPositionIndicator.current = true;
    }, [
        indicatorOpacity,
        indicatorScaleX,
        indicatorScaleY,
        indicatorX,
        reduceMotion,
    ]);

    useEffect(() => {
        if (focusedRouteKey) {
            moveIndicator(focusedRouteKey, true);
        }
    }, [focusedRouteKey, moveIndicator]);

    const focusIndicatorStyle = useAnimatedStyle<ViewStyle>(() => {
        const transform: ViewStyle['transform'] = [
            { translateX: indicatorX.value },
            { scaleX: indicatorScaleX.value },
            { scaleY: indicatorScaleY.value },
        ];
        return {
            opacity: indicatorOpacity.value,
            transform,
        };
    });

    const handleTabLayout = useCallback((
        routeKey: string,
        isFocused: boolean,
        event: LayoutChangeEvent,
    ) => {
        itemLayouts.current[routeKey] = event.nativeEvent.layout;
        if (isFocused) {
            moveIndicator(routeKey, didPositionIndicator.current);
        }
    }, [moveIndicator]);

    const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
        trackWidth.current = event.nativeEvent.layout.width;
        if (focusedRouteKey) {
            moveIndicator(focusedRouteKey, didPositionIndicator.current);
        }
    }, [focusedRouteKey, moveIndicator]);

    // Bottom position respects safe area (gesture bar on Android, home indicator on iOS)
    // Adding extra spacing for "respiro" as requested
    const bottomPosition = Math.max(insets.bottom + 10, 25);

    // Fábrica de handlers de tab — compartilhada entre a pill e o rail.
    const makeHandlers = (route: BottomTabBarProps['state']['routes'][number], isFocused: boolean) => ({
        onPress: () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
            }
        },
        onLongPress: () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
        },
    });

    // ── Tablet landscape: side rail vertical à esquerda ────────────────────────
    // The rail occupies layout space, so there is no content behind it to justify
    // live glass. A restrained tonal selection keeps the platform hierarchy clear.
    if (isTablet && isLandscape) {
        return (
            <View style={[styles.railContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const isFocused = state.index === index;
                    const isProfileTab = route.name === 'Settings';
                    const { onPress, onLongPress } = makeHandlers(route, isFocused);
                    const accessibilityLabel = options.tabBarAccessibilityLabel
                        ?? options.title
                        ?? route.name;

                    return (
                        <AppPressable
                            key={route.key}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: isFocused }}
                            accessibilityLabel={accessibilityLabel}
                            onPress={onPress}
                            onLongPress={onLongPress}
                            hapticFeedback={isFocused ? 'none' : 'selection'}
                            android_ripple={{
                                color: theme.colors.fillMuted,
                                borderless: false,
                            }}
                            style={({ pressed }) => [
                                styles.railItem,
                                isFocused && styles.railItemActive,
                                isFocused && increaseContrast && styles.railItemHighContrast,
                                pressed && styles.itemPressed,
                            ]}
                        >
                            <View style={styles.iconContainer}>
                                {isProfileTab ? (
                                    <ProfileTabAvatar isFocused={isFocused} />
                                ) : (
                                    <TabBarIcon
                                        name={getIconName(route.name)}
                                        isFocused={isFocused}
                                        size={28}
                                    />
                                )}
                            </View>
                        </AppPressable>
                    );
                })}
            </View>
        );
    }

    // ── Phone / tablet portrait: pill flutuante inferior ───────────────────────
    // Tablet portrait only widens the same measured focus system (360 → 520).
    const focusIndicator = nativeLiquidGlass ? (
        <AnimatedGlassView
            glassEffectStyle="regular"
            colorScheme="auto"
            tintColor={increaseContrast ? theme.colors.fillStrong : theme.colors.fillMuted}
            pointerEvents="none"
            style={[
                styles.focusIndicator,
                styles.nativeFocusIndicator,
                increaseContrast && styles.focusIndicatorHighContrast,
                focusIndicatorStyle,
            ]}
        />
    ) : (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.focusIndicator,
                increaseContrast && styles.focusIndicatorHighContrast,
                focusIndicatorStyle,
            ]}
        >
            {Platform.OS === 'ios' ? <View style={styles.focusIndicatorHighlight} /> : null}
        </Animated.View>
    );

    return (
        // Outer wrapper carries positioning and the subtle neutral shadow while
        // the inner container clips the frosted material.
        <View
            style={[styles.shadowWrap, { bottom: bottomPosition }, isTablet && styles.shadowWrapTablet]}
            pointerEvents="box-none"
        >
            <TabBarMaterial
                nativeLiquidGlass={nativeLiquidGlass}
                preferOpaque={preferOpaque}
                increaseContrast={increaseContrast}
                blurTint={blurTint}
                focusIndicator={focusIndicator}
                onLayout={handleTrackLayout}
                styles={styles}
            >
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const isFocused = state.index === index;
                    const isProfileTab = route.name === 'Settings';
                    const { onPress, onLongPress } = makeHandlers(route, isFocused);
                    const accessibilityLabel = options.tabBarAccessibilityLabel
                        ?? options.title
                        ?? route.name;

                    return (
                        <AppPressable
                            key={route.key}
                            onLayout={(event) => handleTabLayout(route.key, isFocused, event)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: isFocused }}
                            accessibilityLabel={accessibilityLabel}
                            onPress={onPress}
                            onLongPress={onLongPress}
                            hapticFeedback={isFocused ? 'none' : 'selection'}
                            android_ripple={{
                                color: theme.colors.fillMuted,
                                borderless: false,
                            }}
                            style={({ pressed }) => [
                                styles.tabItem,
                                pressed && styles.itemPressed,
                            ]}
                        >
                            <View style={styles.iconContainer}>
                                {isProfileTab ? (
                                    <ProfileTabAvatar isFocused={isFocused} />
                                ) : (
                                    <TabBarIcon
                                        name={getIconName(route.name)}
                                        isFocused={isFocused}
                                        size={24}
                                    />
                                )}
                            </View>
                        </AppPressable>
                    );
                })}
            </TabBarMaterial>
        </View>
    );
}

/** The persistent navigation layer follows the active app appearance. */
export function CustomTabBar(props: BottomTabBarProps) {
    return <CustomTabBarInner {...props} />;
}

function createStyles({ colors, elevation }: AppTheme) {
    return StyleSheet.create({
        // Positioning + floating shadow. Transparent so the inner BlurView samples the
        // real scroll content behind the pill (a solid bg here would kill the blur).
        shadowWrap: {
            position: 'absolute',
            start: 20,
            end: 20,
            maxWidth: 360,
            alignSelf: 'center',
            borderRadius: PILL_RADIUS,
            ...elevation.md,
        },
        // Tablet portrait: pill mais larga (ícones com mais respiro). Phone usa o
        // maxWidth: 360 acima.
        shadowWrapTablet: {
            maxWidth: 520,
        },
        // ── Side rail (tablet landscape) ───────────────────────────────────────────
        railContainer: {
            width: RAIL_WIDTH,
            height: '100%',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            overflow: 'hidden',
            backgroundColor: colors.surface1,
            borderRightWidth: StyleSheet.hairlineWidth,
            borderRightColor: colors.borderSubtle,
        },
        railItem: {
            width: 64,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            height: 64,
            minWidth: TOUCH_TARGET_SIZE,
            minHeight: TOUCH_TARGET_SIZE,
            borderRadius: 32,
            marginVertical: 6,
        },
        railItemActive: {
            backgroundColor: colors.fillMuted,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderStrong,
        },
        railItemHighContrast: {
            backgroundColor: colors.fillStrong,
            borderWidth: 2,
            borderColor: colors.textPrimary,
        },
        glassPill: {
            width: '100%',
            flexDirection: 'row',
            borderRadius: PILL_RADIUS,
            overflow: 'hidden',
            paddingVertical: 10,
            paddingHorizontal: 20,
            justifyContent: 'space-around',
            alignItems: 'center',
            backgroundColor: 'transparent',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderSubtle,
        },
        nativeBaseMaterial: {
            borderRadius: PILL_RADIUS,
        },
        highContrastFrame: {
            borderWidth: 2,
            borderColor: colors.textPrimary,
        },
        opaqueMaterial: {
            backgroundColor: colors.surface1,
        },
        androidTonalVeil: {
            backgroundColor: colors.surface1,
            opacity: 0.46,
        },
        materialVeil: {
            backgroundColor: colors.glass,
        },
        focusIndicator: {
            position: 'absolute',
            top: FOCUS_INDICATOR_TOP,
            // Logical origin is paired with a measured physical→logical conversion.
            start: 0,
            width: FOCUS_INDICATOR_WIDTH,
            height: FOCUS_INDICATOR_HEIGHT,
            borderRadius: FOCUS_INDICATOR_HEIGHT / 2,
            backgroundColor: colors.fillMuted,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderStrong,
            overflow: 'hidden',
        },
        nativeFocusIndicator: {
            backgroundColor: 'transparent',
        },
        focusIndicatorHighContrast: {
            backgroundColor: colors.fillStrong,
            borderWidth: 2,
            borderColor: colors.textPrimary,
        },
        focusIndicatorHighlight: {
            position: 'absolute',
            top: 1,
            start: 10,
            end: 10,
            height: StyleSheet.hairlineWidth,
            borderRadius: StyleSheet.hairlineWidth,
            backgroundColor: colors.textPrimary,
            opacity: 0.44,
        },
        tabItem: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            minWidth: TOUCH_TARGET_SIZE,
            minHeight: TOUCH_TARGET_SIZE,
            borderRadius: PILL_RADIUS,
            overflow: 'hidden',
            zIndex: 1,
        },
        itemPressed: {
            opacity: 0.72,
        },
        iconContainer: {
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
        },
        // Profile avatar ring
        avatarRing: {
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            borderWidth: 2,
        },
        avatarRingIdle: {
            borderColor: colors.borderStrong,
        },
        avatarRingActive: {
            borderColor: colors.textPrimary,
        },
        avatarImage: {
            width: '100%',
            height: '100%',
        },
        avatarFallback: {
            width: '100%',
            height: '100%',
            backgroundColor: colors.surface3,
            alignItems: 'center',
            justifyContent: 'center',
        },
        avatarInitials: {
            fontSize: 13,
            fontFamily: fonts.semibold,
            color: colors.textPrimary,
        },
    });
}

export default CustomTabBar;
