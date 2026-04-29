import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

interface CardBrandProps {
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { w: 96, h: 38 },
  md: { w: 120, h: 48 },
  lg: { w: 150, h: 60 },
};

export function CardBrand({ size = 'md' }: CardBrandProps) {
  const { w, h } = SIZES[size];
  return (
    <View style={styles.container}>
      <Image
        source={require('../../../../assets/adaptive-icon.png')}
        style={{ width: w, height: h }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
