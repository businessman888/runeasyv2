import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface RunningIconProps {
  size?: number;
  color?: string;
}

export function RunningIcon({ size = 30, color = '#00D4FF' }: RunningIconProps) {
  return <MaterialCommunityIcons name="run" size={size} color={color} />;
}
