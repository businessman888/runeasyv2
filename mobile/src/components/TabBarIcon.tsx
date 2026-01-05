import React from 'react';
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';

interface TabBarIconProps {
    name: 'home' | 'calendar' | 'trophy' | 'brain' | 'profile';
    color: string;
    size?: number;
}

export function TabBarIcon({ name, color, size = 24 }: TabBarIconProps) {
    // Map our icon names to @expo/vector-icons names
    switch (name) {
        case 'home':
            return <Ionicons name="home" size={size} color={color} />;
        case 'calendar':
            return <Ionicons name="calendar" size={size} color={color} />;
        case 'trophy':
            return <Ionicons name="trophy" size={size} color={color} />;
        case 'brain':
            return <MaterialCommunityIcons name="brain" size={size} color={color} />;
        case 'profile':
            return <Ionicons name="person" size={size} color={color} />;
        default:
            return <Ionicons name="ellipse" size={size} color={color} />;
    }
}

export default TabBarIcon;
