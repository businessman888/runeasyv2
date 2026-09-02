import React, { useMemo } from 'react';
import { View, StyleSheet, Image, Text, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { TabBarIcon } from './TabBarIcon';
import { AppPressable } from './ui/AppPressable';
import { fonts, darkTheme, ThemeScope, useAppTheme, type AppTheme } from '../theme';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useAuthStore, getAvatarUrl, getDisplayName } from '../stores';

// Real frosted blur on Android needs expo-blur's experimental RenderEffect method
// (API 31+); the default Android path barely blurs. Safe here because the blur
// layer sits under the interactive items and is pointerEvents="none" — taps land
// on the controls and never fall through the blur surface.
const ANDROID_BLUR_METHOD: 'dimezisBlurView' | undefined =
    Platform.OS === 'android' ? 'dimezisBlurView' : undefined;

const PILL_RADIUS = 40;
const RAIL_WIDTH = 84;

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
    // Ocupa largura real no layout (tabBarPosition='left' no Navigator posiciona a
    // cena ao lado, sem sobreposição). Mantém a identidade de vidro fosco da pill.
    if (isTablet && isLandscape) {
        return (
            <View style={[styles.railContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
                <BlurView
                    intensity={40}
                    tint={blurTint}
                    experimentalBlurMethod={ANDROID_BLUR_METHOD}
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                />
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glassVeil]} />

                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const isFocused = state.index === index;
                    const isProfileTab = route.name === 'Settings';
                    const { onPress, onLongPress } = makeHandlers(route, isFocused);

                    return (
                        <AppPressable
                            key={route.key}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isFocused }}
                            accessibilityLabel={options.tabBarAccessibilityLabel ?? route.name}
                            onPress={onPress}
                            onLongPress={onLongPress}
                            hapticFeedback={isFocused ? 'none' : 'selection'}
                            style={({ pressed }) => [
                                styles.railItem,
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
    // Phone idêntico ao original; tablet portrait apenas alarga o teto da pill
    // (de 360 → 520) para os ícones respirarem numa tela maior.
    return (
        // Outer wrapper carries positioning and the subtle neutral shadow while
        // the inner container clips the frosted material.
        <View
            style={[styles.shadowWrap, { bottom: bottomPosition }, isTablet && styles.shadowWrapTablet]}
            pointerEvents="box-none"
        >
            <View style={styles.glassPill}>
                {/* Frosted blur of the scroll content behind the floating pill. */}
                <BlurView
                    intensity={40}
                    tint={blurTint}
                    experimentalBlurMethod={ANDROID_BLUR_METHOD}
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                />
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glassVeil]} />

                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const isFocused = state.index === index;
                    const isProfileTab = route.name === 'Settings';

                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        });

                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate(route.name);
                        }
                    };

                    const onLongPress = () => {
                        navigation.emit({
                            type: 'tabLongPress',
                            target: route.key,
                        });
                    };


                    return (
                        <AppPressable
                            key={route.key}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isFocused }}
                            accessibilityLabel={options.tabBarAccessibilityLabel ?? route.name}
                            onPress={onPress}
                            onLongPress={onLongPress}
                            hapticFeedback={isFocused ? 'none' : 'selection'}
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
            </View>
        </View>
    );
}

/**
 * The floating tab bar keeps the DARK palette in every appearance.
 *
 * It is the app's one persistent surface — it never scrolls away and sits on
 * top of every screen — so pinning it gives the product a fixed anchor while
 * the content behind it changes appearance. `ThemeScope` re-provides the theme
 * context, so the tab icons follow along without `AppIcon` needing a color
 * override it does not have.
 */
export function CustomTabBar(props: BottomTabBarProps) {
    return (
        <ThemeScope theme={darkTheme}>
            <CustomTabBarInner {...props} />
        </ThemeScope>
    );
}

function createStyles({ colors, elevation }: AppTheme) {
    return StyleSheet.create({
        // Positioning + floating shadow. Transparent so the inner BlurView samples the
        // real scroll content behind the pill (a solid bg here would kill the blur).
        shadowWrap: {
            position: 'absolute',
            left: 20,
            right: 20,
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
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            height: 64,
            minWidth: 44,
            minHeight: 44,
            marginVertical: 6,
        },
        glassPill: {
            flexDirection: 'row',
            borderRadius: PILL_RADIUS,
            overflow: 'hidden',
            paddingVertical: 12,
            paddingHorizontal: 20,
            justifyContent: 'space-around',
            alignItems: 'center',
            backgroundColor: colors.glass,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderSubtle,
        },
        glassVeil: {
            backgroundColor: colors.glass,
        },
        tabItem: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            height: 50,
            minWidth: 44,
            minHeight: 44,
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
