import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, borderRadius, spacing } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { toneEmoji } from '../../utils/formatters';
import { StickerBase } from './StickerBase';

interface Props { data: ShareCardData; }

/** S05 — Feedback hero in a speech bubble */
export function S05_HeroBubble({ data }: Props) {
  const fb = data.feedback;
  return (
    <StickerBase>
      <View style={styles.bubble}>
        <Text style={styles.emoji}>{fb ? toneEmoji(fb.heroTone) : '🏃'}</Text>
        <Text style={styles.text} numberOfLines={3}>
          {fb?.heroMessage || 'Treino concluído!'}
        </Text>
      </View>
    </StickerBase>
  );
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
    width: 130,
  },
  emoji: {
    fontSize: 22,
  },
  text: {
    color: colors.textLight,
    fontSize: 10,
    fontWeight: typography.fontWeights.medium,
    textAlign: 'center',
    lineHeight: 14,
  },
});
