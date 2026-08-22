import React, { memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { spacing } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

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
                colors={[semanticColors.surface1, semanticColors.canvas]}
                style={StyleSheet.absoluteFill}
            />
            {children}
            <LinearGradient
                pointerEvents="none"
                colors={[semanticColors.canvas, semanticColors.transparent]}
                style={styles.diffuseShadow}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    surface: {
        backgroundColor: semanticColors.surface1,
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
