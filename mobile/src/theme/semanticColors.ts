import type { ThemeColors } from './contracts';

/**
 * Semantic dark-theme colors.
 *
 * Components should consume these names instead of raw color values so the
 * visual hierarchy can evolve without coupling UI code to a specific palette.
 */
export const darkColors = {
  canvas: '#050506',
  surface1: '#0D0D0F',
  surface2: '#141416',
  surface3: '#1B1B1E',
  glass: 'rgba(255,255,255,0.055)',
  borderSubtle: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.13)',
  textPrimary: '#F7F7F8',
  textOnAccentMuted: 'rgba(5,5,6,0.68)',
  onboardingIconInk: '#0E0E1F',
  onboardingIconInkAlt: '#0F0F1E',
  textSecondary: '#A7A7AE',
  recovery: '#9747FF',
  success: '#10B981',
  warning: '#FFC400',
  danger: '#EF4444',
  info: '#3B82F6',
  textTertiary: '#7F7F88',
  accent: '#00D4FF',
  textOnAccent: '#050506',
  accentSubtle: 'rgba(0,212,255,0.10)',
  successSubtle: 'rgba(16,185,129,0.12)',
  warningSubtle: 'rgba(255,196,0,0.12)',
  dangerSubtle: 'rgba(239,68,68,0.12)',
  overlaySoft: 'rgba(5,5,6,0.24)',
  overlayFaint: 'rgba(5,5,6,0.14)',
  overlayMedium: 'rgba(5,5,6,0.46)',
  overlayStrong: 'rgba(5,5,6,0.85)',
  scrim: 'rgba(0,0,0,0.62)',
  transparent: 'transparent',
} as const satisfies ThemeColors;

/**
 * @deprecated Compatibility alias while screens migrate to useAppTheme().
 * New theme-aware code must consume colors from the provider.
 */
export const semanticColors = darkColors;

export type SemanticColor = keyof typeof semanticColors;
export type SemanticColorValue = (typeof semanticColors)[SemanticColor];
