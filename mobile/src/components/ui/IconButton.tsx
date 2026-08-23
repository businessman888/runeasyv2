import React, { memo } from 'react';
import {
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAppTheme } from '../../theme';
import {
  iconSizes,
  type AppIconName,
  type IconSize,
  type IconTone,
  type IconVariant,
} from '../../theme/iconography';
import { AppIcon } from './AppIcon';
import { AppPressable, type AppPressableProps } from './AppPressable';

export type IconButtonProps = Omit<
  AppPressableProps,
  'accessibilityLabel' | 'accessibilityRole' | 'children' | 'style'
> & {
  /** Required because the visual icon is decorative inside this control. */
  accessibilityLabel: string;
  icon: AppIconName;
  iconSize?: IconSize;
  tone?: IconTone;
  variant?: IconVariant;
  style?: StyleProp<ViewStyle>;
};

function IconButtonComponent({
  accessibilityLabel,
  icon,
  iconSize = iconSizes.md,
  tone = 'primary',
  variant = 'outline',
  disabled = false,
  hitSlop = 4,
  style,
  ...pressableProps
}: IconButtonProps) {
  const { theme } = useAppTheme();

  return (
    <AppPressable
      {...pressableProps}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      android_ripple={{ color: theme.colors.surface3, borderless: true }}
      interactionScale="icon"
      disabled={disabled}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        styles.control,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <AppIcon name={icon} size={iconSize} tone={tone} variant={variant} />
    </AppPressable>
  );
}

export const IconButton = memo(IconButtonComponent);
IconButton.displayName = 'IconButton';

const styles = StyleSheet.create({
  control: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
    borderRadius: 22,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.4,
  },
});

