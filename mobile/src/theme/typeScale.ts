import type { TextStyle } from 'react-native';

import { fonts } from './index';

type TypeScaleStyle = Readonly<
  Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'fontVariant'>
>;

export const typeScale = {
  display: {
    fontFamily: fonts.extrabold,
    fontSize: 36,
    lineHeight: 42,
  },
  titleLarge: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 24,
    lineHeight: 30,
  },
  headline: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    lineHeight: 24,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  callout: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
  data: {
    fontFamily: fonts.bold,
    fontSize: 32,
    lineHeight: 38,
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TypeScaleStyle>;

export type TypeScaleVariant = keyof typeof typeScale;
