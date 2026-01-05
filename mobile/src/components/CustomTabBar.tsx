import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '../theme';
import { TabBarIcon } from './TabBarIcon';

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    return (
        <View style={styles.container}>
            <View style={styles.tabBar}>
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const isFocused = state.index === index;
                    const isCenterTab = route.name === 'Badges';

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
                            case 'Badges': return 'trophy';
                            case 'Evolution': return 'brain';
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
                            {/* Single active indicator - glow line at top */}
                            {isFocused && !isCenterTab && (
                                <View style={styles.activeIndicator} />
                            )}

                            {/* Icon - changes color only, no background */}
                            <View style={[
                                styles.iconContainer,
                                isCenterTab && styles.centerIconContainer,
                            ]}>
                                <TabBarIcon
                                    name={getIconName()}
                                    color={isCenterTab ? '#FFFFFF' : (isFocused ? '#00D4FF' : '#6B6B8D')}
                                    size={isCenterTab ? 25 : 24}
                                />
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingBottom: Platform.OS === 'ios' ? 25 : 15,
        paddingHorizontal: 20,
        zIndex: 999,
        elevation: 999,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#15152A',
        borderRadius: 40,
        paddingVertical: 12,
        paddingHorizontal: 20,
        justifyContent: 'space-around',
        alignItems: 'center',
        width: '100%',
        maxWidth: 360,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
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
        // Subtle shadow glow effect
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
        // No background - icon floats
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
});

export default CustomTabBar;
