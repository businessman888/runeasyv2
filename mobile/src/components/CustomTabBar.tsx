import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Image, Text, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { TabBarIcon } from './TabBarIcon';
import { colors } from '../theme';
import { useAuthStore, getAvatarUrl, getDisplayName } from '../stores';

// Real frosted blur on Android needs expo-blur's experimental RenderEffect method
// (API 31+); the default Android path barely blurs. Safe here because the blur
// layer sits UNDER the touchable items and is pointerEvents="none" — taps land on
// the items directly and never fall through the (touch-stealing) blur surface.
const ANDROID_BLUR_METHOD: 'dimezisBlurView' | undefined =
    Platform.OS === 'android' ? 'dimezisBlurView' : undefined;

// Top-light → bottom-shade sheen that sells the "frosted glass" depth (mirrors
// the sheen used by GlassTeaseOverlay so the tab bar reads as the same material).
const SHEEN_COLORS = [
    'rgba(255, 255, 255, 0.06)',
    'rgba(255, 255, 255, 0)',
    'rgba(0, 0, 0, 0.12)',
] as const;
const SHEEN_LOCATIONS = [0, 0.5, 1] as const;

const PILL_RADIUS = 40;

/** Circular profile photo for the "Settings" tab. Renders the user's avatar (or
 *  their initials as a fallback) inside a ring that lights up cyan with a neon
 *  glow when the Profile tab is active — the premium avatar indicator used in
 *  apps like Instagram/Strava, replacing the generic person glyph. */
function ProfileTabAvatar({ isFocused }: { isFocused: boolean }) {
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

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();

    // Bottom position respects safe area (gesture bar on Android, home indicator on iOS)
    // Adding extra spacing for "respiro" as requested
    const bottomPosition = Math.max(insets.bottom + 10, 25);

    return (
        // Outer wrapper carries positioning + shadow (kept off the inner glass
        // container, whose overflow:hidden would otherwise clip the iOS glow).
        <View style={[styles.shadowWrap, { bottom: bottomPosition }]} pointerEvents="box-none">
            <View style={styles.glassPill}>
                {/* Frosted blur of the scroll content behind the floating pill. */}
                <BlurView
                    intensity={40}
                    tint="dark"
                    experimentalBlurMethod={ANDROID_BLUR_METHOD}
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                />
                {/* Navy veil keeps icons/labels legible over the blur. */}
                <View
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBarGlassFill }]}
                />
                {/* Glass sheen for depth. */}
                <LinearGradient
                    colors={SHEEN_COLORS}
                    locations={SHEEN_LOCATIONS}
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                />

                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const isFocused = state.index === index;
                    const isCenterTab = route.name === 'Ranking';
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

                    const getIconName = (): 'home' | 'calendar' | 'trophy' | 'brain' | 'profile' => {
                        switch (route.name) {
                            case 'Home': return 'home';
                            case 'Calendar': return 'calendar';
                            case 'Ranking': return 'trophy';
                            case 'Wellness': return 'brain';
                            case 'Settings': return 'profile';
                            default: return 'home';
                        }
                    };

                    return (
                        <TouchableOpacity
                            key={route.key}
                            accessibilityRole="button"
                            accessibilityState={isFocused ? { selected: true } : {}}
                            accessibilityLabel={options.tabBarAccessibilityLabel}
                            onPress={onPress}
                            onLongPress={onLongPress}
                            style={styles.tabItem}
                        >
                            {/* Active indicator - glow line at top */}
                            {isFocused && !isCenterTab && (
                                <View style={styles.activeIndicator} />
                            )}

                            {/* Icon — Profile shows the user's circular avatar instead of a glyph */}
                            <View style={[
                                styles.iconContainer,
                                isCenterTab && styles.centerIconContainer,
                            ]}>
                                {isProfileTab ? (
                                    <ProfileTabAvatar isFocused={isFocused} />
                                ) : (
                                    <TabBarIcon
                                        name={getIconName()}
                                        color={isCenterTab ? '#FFFFFF' : (isFocused ? '#00D4FF' : '#6B6B8D')}
                                        size={isCenterTab ? 25 : 24}
                                    />
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    // Positioning + floating shadow. Transparent so the inner BlurView samples the
    // real scroll content behind the pill (a solid bg here would kill the blur).
    shadowWrap: {
        position: 'absolute',
        left: 20,
        right: 20,
        maxWidth: 360,
        alignSelf: 'center',
        borderRadius: PILL_RADIUS,
        // Floating effect: subtle neutral drop only — the cyan reads from the
        // hairline border alone (clean/minimal, no neon glow).
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
        elevation: 6,
    },
    glassPill: {
        flexDirection: 'row',
        borderRadius: PILL_RADIUS,
        overflow: 'hidden',
        paddingVertical: 12,
        paddingHorizontal: 20,
        justifyContent: 'space-around',
        alignItems: 'center',
        // Premium cyan hairline edge.
        borderWidth: 1,
        borderColor: colors.proGlassBorderCyan,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        height: 50,
    },
    activeIndicator: {
        position: 'absolute',
        top: -12,
        width: 24,
        height: 4,
        backgroundColor: '#00D4FF',
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: 4,
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
        elevation: 5,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    centerIconContainer: {
        backgroundColor: '#00C4E8',
        width: 52,
        height: 52,
        borderRadius: 26,
        elevation: 8,
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
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
        borderColor: colors.tabBarIdleBorder,
    },
    avatarRingActive: {
        // Clean cyan ring only — no glow, matching the HomeFixedHeader avatar.
        borderColor: colors.primary,
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    avatarFallback: {
        width: '100%',
        height: '100%',
        backgroundColor: '#1C1C2E',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitials: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.primary,
    },
});

export default CustomTabBar;
