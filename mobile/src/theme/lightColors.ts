import type { ThemeColors } from './contracts';

/**
 * Accessible light palette for development validation.
 *
 * The cyan accent is intentionally darker than the brand cyan so interactive
 * text and controls retain AA contrast on light surfaces.
 */
export const lightColors = {
  canvas: '#F6F7F8',
  surface1: '#FFFFFF',
  surface2: '#F1F3F5',
  surface3: '#E8EBEF',
  glass: 'rgba(255,255,255,0.78)',
  fillSubtle: 'rgba(17,19,24,0.04)',
  fillMuted: 'rgba(17,19,24,0.08)',
  fillStrong: 'rgba(17,19,24,0.14)',
  borderSubtle: 'rgba(17,19,24,0.08)',
  borderStrong: 'rgba(17,19,24,0.14)',
  textPrimary: '#111318',
  textOnMedia: '#FFFFFF',
  textOnMediaMuted: 'rgba(255,255,255,0.72)',
  textOnAccentMuted: 'rgba(255,255,255,0.74)',
  onboardingIconInk: '#0E0E1F',
  onboardingIconInkAlt: '#0F0F1E',
  textSecondary: '#525761',
  recovery: '#7042C1',
  success: '#087A55',
  warning: '#8A5A00',
  danger: '#C73737',
  info: '#1D64C8',
  textTertiary: '#6B717C',
  accent: '#007C92',
  textOnAccent: '#FFFFFF',
  accentSubtle: 'rgba(0,124,146,0.10)',
  successSubtle: 'rgba(8,122,85,0.10)',
  warningSubtle: 'rgba(138,90,0,0.10)',
  dangerSubtle: 'rgba(199,55,55,0.10)',
  overlaySoft: 'rgba(17,19,24,0.08)',
  overlayFaint: 'rgba(17,19,24,0.04)',
  overlayMedium: 'rgba(17,19,24,0.24)',
  overlayStrong: 'rgba(17,19,24,0.72)',
  scrim: 'rgba(17,19,24,0.42)',
  shadow: '#000000',
  transparent: 'transparent',
} as const satisfies ThemeColors;
