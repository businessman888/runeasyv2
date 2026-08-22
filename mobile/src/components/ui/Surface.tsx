import React, { forwardRef, type PropsWithChildren } from 'react';
import {
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { semanticColors } from '../../theme/semanticColors';
import { borderRadius, spacing } from '../../theme';

export type SurfaceVariant =
  | 'canvas'
  | 'surface1'
  | 'surface2'
  | 'surface3'
  | 'glass';
export type SurfaceBorder = 'none' | 'subtle' | 'strong';
export type SurfaceRadius = 'none' | 'small' | 'medium' | 'large' | 'full';
export type SurfaceSpacing = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface SurfaceProps extends PropsWithChildren<ViewProps> {
  variant?: SurfaceVariant;
  border?: SurfaceBorder;
  radius?: SurfaceRadius;
  padding?: SurfaceSpacing;
}

const backgroundByVariant = StyleSheet.create<Record<SurfaceVariant, ViewStyle>>({
  canvas: { backgroundColor: semanticColors.canvas },
  surface1: { backgroundColor: semanticColors.surface1 },
  surface2: { backgroundColor: semanticColors.surface2 },
  surface3: { backgroundColor: semanticColors.surface3 },
  glass: { backgroundColor: semanticColors.glass },
});

const borderByVariant = StyleSheet.create<Record<SurfaceBorder, ViewStyle>>({
  none: { borderWidth: 0 },
  subtle: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.borderSubtle,
  },
  strong: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.borderStrong,
  },
});

const radiusByVariant = StyleSheet.create<Record<SurfaceRadius, ViewStyle>>({
  none: { borderRadius: 0 },
  small: { borderRadius: borderRadius.md },
  medium: { borderRadius: borderRadius.lg },
  large: { borderRadius: borderRadius.xl },
  full: { borderRadius: borderRadius.full },
});

const paddingByVariant = StyleSheet.create<Record<SurfaceSpacing, ViewStyle>>({
  none: { padding: 0 },
  xs: { padding: spacing.xs },
  sm: { padding: spacing.sm },
  md: { padding: spacing.base },
  lg: { padding: spacing.xl },
  xl: { padding: spacing['2xl'] },
});

/** A neutral surface primitive with semantic palette and layout tokens. */
export const Surface = forwardRef<View, SurfaceProps>(function Surface(
  {
    variant = 'surface1',
    border = 'subtle',
    radius = 'medium',
    padding = 'none',
    style,
    children,
    ...props
  },
  ref,
) {
  return (
    <View
      ref={ref}
      style={[
        backgroundByVariant[variant],
        borderByVariant[border],
        radiusByVariant[radius],
        paddingByVariant[padding],
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
});
