import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, createThemeStyles, useThemeSubscription } from '../../../theme';
import { semanticColors } from '../../../theme/semanticColors';

interface RouteNoDataProps {
  width: number;
  height: number;
}

export function RouteNoData({ width, height }: RouteNoDataProps) {
  useThemeSubscription();
  return (
    <View style={[styles.container, { width, height }]}>
      <Ionicons name="location-outline" size={28} color={colors.textMuted} />
      <Text style={styles.text}>Rota não disponível</Text>
    </View>
  );
}

const styles = createThemeStyles(() => ({
  container: {
    backgroundColor: semanticColors.scrim,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    marginTop: spacing.xs,
  },
}));
