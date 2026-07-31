import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Barra de progresso segmentada — um segmento por card, no padrão que o usuário
 * já conhece de Instagram/WhatsApp Stories.
 *
 * Deliberadamente SEM animação de preenchimento por tempo: estes stories não
 * avançam sozinhos. O usuário lê no ritmo dele, então o segmento é binário
 * (visto / não visto) e o atual fica cheio. Uma barra que "enche" prometeria um
 * autoplay que não existe.
 */

interface StoryProgressBarProps {
  total: number;
  current: number;
  /** Cor do segmento ativo — o accent do card em foco. */
  accent: string;
}

export const StoryProgressBar = memo(function StoryProgressBar({
  total,
  current,
  accent,
}: StoryProgressBarProps) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Card ${current + 1} de ${total}`}
      accessibilityValue={{ min: 1, max: total, now: current + 1 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            i <= current && { backgroundColor: accent, opacity: i === current ? 1 : 0.55 },
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(235,235,245,0.22)',
  },
});
