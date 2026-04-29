import { TextStyle, Platform } from 'react-native';
import { colors } from '../../../../theme';

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };
const SHADOW: TextStyle = {
  textShadowColor: 'rgba(0, 0, 0, 0.55)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 8,
};
const SHADOW_SOFT: TextStyle = {
  textShadowColor: 'rgba(0, 0, 0, 0.45)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
};

const SYSTEM_DISPLAY = Platform.select({
  ios: 'System',
  android: 'sans-serif-condensed',
  default: 'System',
});

export const cardText = {
  badge: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
  } as TextStyle,

  // Small uppercase label above each metric
  metricLabel: {
    color: 'rgba(235, 235, 245, 0.75)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    ...SHADOW_SOFT,
  } as TextStyle,

  // Mid-size metric value (sub metrics)
  metricValueMd: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 30,
    fontFamily: SYSTEM_DISPLAY,
    ...TABULAR,
    ...SHADOW,
  } as TextStyle,

  // Large metric (Card 1)
  metricValueLg: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: 50,
    fontFamily: SYSTEM_DISPLAY,
    ...TABULAR,
    ...SHADOW,
  } as TextStyle,

  // Hero metric (Card 2 — Pace gigante)
  heroValue: {
    color: '#FFFFFF',
    fontSize: 96,
    fontWeight: '900',
    letterSpacing: -3,
    lineHeight: 100,
    fontFamily: SYSTEM_DISPLAY,
    ...TABULAR,
    ...SHADOW,
  } as TextStyle,

  heroValueSm: {
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 70,
    fontFamily: SYSTEM_DISPLAY,
    ...TABULAR,
    ...SHADOW,
  } as TextStyle,

  // Hero unit (e.g. "/Km" under the big pace)
  heroUnit: {
    color: 'rgba(235, 235, 245, 0.85)',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
    ...SHADOW_SOFT,
  } as TextStyle,

  // Achievement title (e.g. "MARATONA COMPLETA")
  achievementTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textAlign: 'center',
    ...SHADOW,
  } as TextStyle,

  achievementSubtitle: {
    color: 'rgba(235, 235, 245, 0.7)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    ...SHADOW_SOFT,
  } as TextStyle,

  tileValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
    fontFamily: SYSTEM_DISPLAY,
    ...TABULAR,
    ...SHADOW_SOFT,
  } as TextStyle,

  tileLabel: {
    color: 'rgba(235, 235, 245, 0.6)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  } as TextStyle,
};
