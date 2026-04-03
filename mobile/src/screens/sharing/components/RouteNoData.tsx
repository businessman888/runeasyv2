import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../../theme';

interface RouteNoDataProps {
  width: number;
  height: number;
}

export function RouteNoData({ width, height }: RouteNoDataProps) {
  return (
    <View style={[styles.container, { width, height }]}>
      <Ionicons name="location-outline" size={28} color={colors.textMuted} />
      <Text style={styles.text}>Rota não disponível</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(14, 14, 31, 0.6)',
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    marginTop: spacing.xs,
  },
});
