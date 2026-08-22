import React from 'react';
import { AppIcon } from './ui/AppIcon';
import type { AppIconName, IconSize } from '../theme/iconography';

interface TabBarIconProps {
    name: 'home' | 'calendar' | 'trophy' | 'wellness' | 'profile';
    isFocused: boolean;
    size?: IconSize;
}

const semanticIconNames: Record<TabBarIconProps['name'], AppIconName> = {
    home: 'home',
    calendar: 'calendar',
    trophy: 'trophy',
    wellness: 'wellness',
    profile: 'profile',
};

export function TabBarIcon({ name, isFocused, size = 24 }: TabBarIconProps) {
    return (
        <AppIcon
            name={semanticIconNames[name]}
            size={size}
            tone={isFocused ? 'accent' : 'tertiary'}
            variant={isFocused ? 'filled' : 'outline'}
        />
    );
}

export default TabBarIcon;
