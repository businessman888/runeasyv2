/**
 * Semantic dark-theme colors.
 *
 * Components should consume these names instead of raw color values so the
 * visual hierarchy can evolve without coupling UI code to a specific palette.
 */
export const semanticColors = {
  canvas: '#050506',
  surface1: '#0D0D0F',
  surface2: '#141416',
  surface3: '#1B1B1E',
  glass: 'rgba(255,255,255,0.055)',
  borderSubtle: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.13)',
  textPrimary: '#F7F7F8',
  textSecondary: '#A7A7AE',
  textTertiary: '#7F7F88',
  accent: '#00D4FF',
  transparent: 'transparent',
} as const;

export type SemanticColor = keyof typeof semanticColors;
export type SemanticColorValue = (typeof semanticColors)[SemanticColor];
