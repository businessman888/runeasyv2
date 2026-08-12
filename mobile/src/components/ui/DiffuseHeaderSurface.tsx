import React, { memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing } from '../../theme';

interface DiffuseHeaderSurfaceProps {
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
}

/**
 * Solid navigation surface with a soft fade into the screen content.
 *
 * Unlike `GlassSurface`, this component never samples or blurs what scrolls
 * underneath it. The header therefore keeps a stable contrast on Android and
 * iOS while the gradient supplies the small amount of depth needed to separate
 * navigation from content.
 */
export const DiffuseHeaderSurface = memo(function DiffuseHeaderSurface({
    children,
    style,
}: DiffuseHeaderSurfaceProps) {
    return (
        <View style={[styles.surface, style]}>
            <LinearGradient
                pointerEvents="none"
                colors={[colors.backgroundLight, colors.background]}
                style={StyleSheet.absoluteFill}
            />
            {children}
            <LinearGradient
                pointerEvents="none"
                colors={[colors.background, 'transparent']}
                style={styles.diffuseShadow}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    surface: {
        backgroundColor: colors.backgroundLight,
    },
    diffuseShadow: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        height: spacing.xl,
    },
});

export default DiffuseHeaderSurface;
