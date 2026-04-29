import React from 'react';
import { View, StyleSheet } from 'react-native';

interface CardBaseProps {
  children: React.ReactNode;
  width?: number;
  height?: number;
}

export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 568;

export function CardBase({ children, width = CARD_WIDTH, height = CARD_HEIGHT }: CardBaseProps) {
  return (
    <View
      style={[
        styles.container,
        { width, height, backgroundColor: 'transparent' },
      ]}
      collapsable={false}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
