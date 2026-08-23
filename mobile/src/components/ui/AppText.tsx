import React, { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
  type TextProps,
} from 'react-native';

import { type ThemeColors, useAppTheme } from '../../theme';
import { typeScale, type TypeScaleVariant } from '../../theme/typeScale';

export interface AppTextProps extends TextProps {
  /** Semantic typography role. */
  variant?: TypeScaleVariant;
  /** Semantic text color. Raw color values remain available through `style`. */
  color?: Extract<
    keyof ThemeColors,
    'textPrimary' | 'textSecondary' | 'textTertiary' | 'accent'
  >;
  /** Convenience alias for the native text alignment style. */
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify';
  onTextLayout?: (event: NativeSyntheticEvent<TextLayoutEventData>) => void;
}

/**
 * RunEasy's accessible, semantic text primitive.
 *
 * Font scaling remains enabled by default and callers retain access to every
 * native Text prop, including accessibility and truncation properties.
 */
export const AppText = forwardRef<Text, AppTextProps>(function AppText(
  {
    variant = 'body',
    color = 'textPrimary',
    align,
    allowFontScaling = true,
    maxFontSizeMultiplier = 2,
    style,
    ...props
  },
  ref,
) {
  const { theme } = useAppTheme();

  return (
    <Text
      ref={ref}
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        styles.base,
        typeScale[variant],
        { color: theme.colors[color] },
        align !== undefined && { textAlign: align },
        style,
      ]}
      {...props}
    />
  );
});

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
