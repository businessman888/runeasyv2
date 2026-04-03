import React from 'react';
import { View, StyleSheet } from 'react-native';

interface StickerBaseProps {
  children: React.ReactNode;
  size?: number;
}

/**
 * Base wrapper for stickers — transparent background, square.
 */
export function StickerBase({ children, size = 140 }: StickerBaseProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
