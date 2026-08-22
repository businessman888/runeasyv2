import React, { memo, type ComponentProps } from 'react';
import { Ionicons } from '@react-native-vector-icons/ionicons/static';

import {
  iconography,
  iconSizes,
  iconToneColors,
  type AppIconName,
  type IconSize,
  type IconTone,
  type IconVariant,
} from '../../theme/iconography';

type IoniconsProps = ComponentProps<typeof Ionicons>;

type AppIconAccessibilityProps =
  | {
      /** Decorative icons are hidden from assistive technologies by default. */
      decorative?: true;
      accessibilityLabel?: never;
    }
  | {
      decorative: false;
      accessibilityLabel: string;
    };

export type AppIconProps = Omit<
  IoniconsProps,
  'name' | 'size' | 'color' | 'accessible' | 'accessibilityLabel'
> &
  AppIconAccessibilityProps & {
    name: AppIconName;
    size?: IconSize;
    tone?: IconTone;
    variant?: IconVariant;
  };

function AppIconComponent({
  name,
  size = iconSizes.md,
  tone = 'primary',
  variant = 'outline',
  decorative = true,
  accessibilityLabel,
  ...iconProps
}: AppIconProps) {
  return (
    <Ionicons
      {...iconProps}
      name={iconography[name][variant]}
      size={size}
      color={iconToneColors[tone]}
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      accessibilityRole={decorative ? undefined : 'image'}
    />
  );
}

export const AppIcon = memo(AppIconComponent);
AppIcon.displayName = 'AppIcon';

