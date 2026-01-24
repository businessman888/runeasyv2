import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenContainerProps {
    children: React.ReactNode;
    style?: ViewStyle;
}

/**
 * Global screen container that applies safe area insets dynamically.
 * - paddingTop: respects status bar / notch
 * - NO paddingBottom: the BottomBar floats over content, screens handle their own scroll padding
 */
export function ScreenContainer({
    children,
    style,
}: ScreenContainerProps) {
    const insets = useSafeAreaInsets();

    return (
        <View
            style={[
                styles.container,
                { paddingTop: insets.top, paddingBottom: insets.bottom },
                style,
            ]}
        >
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A18',
    },
});

export default ScreenContainer;
