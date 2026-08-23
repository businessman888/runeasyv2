import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { contentMaxWidth } from '../theme/responsive';
import { type ThemeColors, useThemedStyles } from '../theme';

interface ScreenContainerProps {
    children: React.ReactNode;
    style?: ViewStyle;
    /**
     * Só em tablet: centraliza o conteúdo numa coluna de leitura com largura
     * máxima (evita formulários/quiz/detalhes esticarem a tela inteira). Em
     * phone é ignorado — layout idêntico ao atual.
     */
    centered?: boolean;
}

/**
 * Global screen container that applies safe area insets dynamically.
 * - paddingTop: respects status bar / notch
 * - NO paddingBottom: the BottomBar floats over content, screens handle their own scroll padding
 * - centered (tablet only): caps content width and centers it horizontally
 */
export function ScreenContainer({
    children,
    style,
    centered = false,
}: ScreenContainerProps) {
    const styles = useThemedStyles(createStyles);
    const insets = useSafeAreaInsets();
    const { width, isTablet, isLargeTablet } = useBreakpoint();

    const maxWidth = centered ? contentMaxWidth(width, isTablet, isLargeTablet) : undefined;

    return (
        <View
            style={[
                styles.container,
                { paddingTop: insets.top, paddingBottom: insets.bottom },
                // Em tablet com `centered`, centraliza o filho; phone não muda.
                maxWidth ? styles.centeredOuter : null,
                style,
            ]}
        >
            {maxWidth ? (
                <View style={[styles.centeredInner, { maxWidth }]}>{children}</View>
            ) : (
                children
            )}
        </View>
    );
}

function createStyles(colors: ThemeColors) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.canvas,
        },
        centeredOuter: {
            alignItems: 'center',
        },
        centeredInner: {
            flex: 1,
            width: '100%',
        },
    });
}

export default ScreenContainer;
