import React from 'react';
import { View, StyleSheet } from 'react-native';

interface CardBaseProps {
  children: React.ReactNode;
  width?: number;
  height?: number;
}

/**
 * Base wrapper for all share cards.
 * Background is transparent — the dark gradient is rendered as a sibling
 * OUTSIDE the ViewShot capture area.
 */
export function CardBase({ children, width = 300, height = 400 }: CardBaseProps) {
  return (
    <View style={[styles.container, { width, height }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
