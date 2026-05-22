import React, { memo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors, typography } from '../../theme';

/**
 * Two-or-more-segment tab control matching the Figma `componentSelectWorkout`
 * node (1252-1300): a hairline bottom divider with the active segment marked by
 * a 3px cyan underline and cyan label; inactive labels at ~60% white.
 *
 * Reused on Home and Calendar to switch between "Treinos" and "Atividades".
 */

export interface SegmentedTab<K extends string = string> {
    key: K;
    label: string;
}

interface SegmentedTabsProps<K extends string = string> {
    tabs: SegmentedTab<K>[];
    activeKey: K;
    onChange: (key: K) => void;
    style?: StyleProp<ViewStyle>;
}

function SegmentedTabsInner<K extends string = string>({
    tabs,
    activeKey,
    onChange,
    style,
}: SegmentedTabsProps<K>) {
    const handlePress = useCallback(
        (key: K) => () => {
            if (key !== activeKey) onChange(key);
        },
        [activeKey, onChange],
    );

    return (
        <View style={[styles.container, style]}>
            {tabs.map((tab) => {
                const isActive = tab.key === activeKey;
                return (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.tab, isActive && styles.tabActive]}
                        onPress={handlePress(tab.key)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                        accessibilityRole="tab"
                        accessibilityLabel={tab.label}
                        accessibilityState={{ selected: isActive }}
                    >
                        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(235, 235, 245, 0.1)', // Figma hairline divider
    },
    tab: {
        flex: 1,
        minHeight: 50, // Figma height; also satisfies 44px min touch target
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: colors.primary, // #00D4FF
    },
    tabText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        color: 'rgba(235, 235, 245, 0.6)', // Figma inactive label
    },
    tabTextActive: {
        color: colors.primary,
    },
});

export const SegmentedTabs = memo(SegmentedTabsInner) as typeof SegmentedTabsInner;
