import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { StickerBase } from './StickerBase';

interface Props { data: ShareCardData; }

/** S10 — RunEasy branding sticker */
export function S10_RunEasyLogo(_props: Props) {
  return (
    <StickerBase>
      <View style={styles.container}>
        <MaterialCommunityIcons name="run" size={40} color={colors.primary} />
        <Text style={styles.text}>RunEasy</Text>
      </View>
    </StickerBase>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
  },
  text: {
    color: colors.primary,
    fontSize: typography.fontSizes['2xl'],
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 1,
  },
});
