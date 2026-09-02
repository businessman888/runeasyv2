import type { ThemeColors } from './contracts';

/**
 * Nebulosa — the app's original navy/violet palette, brought back as an
 * alternative appearance.
 *
 * Source: `docs/HISTORICAL-SOLID-BACKGROUND-COLORS.md`, the audit of commit
 * `1541466` (the state before the redesign/tokenization front).
 *
 * The hues are historical; the STRUCTURE is not. That audit found five
 * competing canvases and two interchangeable "main card" tones, with no rule
 * tying a color to an elevation. This palette keeps the navy identity but
 * spends it on the one surface ladder the current contract defines:
 *
 *   canvas #0A0A18  →  surface1 #15152A  →  surface2 #1A1A2E  →  surface3 #1E1E32
 *   (colors.background)  (colors.streakCard)  (colors.card)    (colors.highlight)
 *
 * `#1C1C2E` is deliberately left out. It was the second "card principal",
 * visually a hair away from `#1A1A2E`, and section 9.2 of the audit names that
 * pair as a defect. Reintroducing it would rebuild the flatness the ladder is
 * there to prevent.
 *
 * Brand hues (`accent`, `recovery`) and the text ramp match `darkColors` — this
 * is a different surface, not a different brand, and the text contrast is
 * already validated. The translucent tokens are white-alpha exactly as in dark,
 * so glass surfaces keep one identity across both dark appearances.
 */
export const nebulaColors = {
  canvas: '#0A0A18',
  surface1: '#15152A',
  surface2: '#1A1A2E',
  surface3: '#1E1E32',
  glass: 'rgba(255,255,255,0.055)',
  fillSubtle: 'rgba(255,255,255,0.06)',
  fillMuted: 'rgba(255,255,255,0.10)',
  fillStrong: 'rgba(255,255,255,0.20)',
  borderSubtle: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.13)',
  textPrimary: '#F7F7F8',
  textOnMedia: '#FFFFFF',
  textOnMediaMuted: 'rgba(255,255,255,0.72)',
  textOnAccentMuted: 'rgba(10,10,24,0.68)',
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
  textOnAccent: '#0A0A18',
  accentSubtle: 'rgba(0,212,255,0.10)',
  successSubtle: 'rgba(16,185,129,0.12)',
  warningSubtle: 'rgba(255,196,0,0.12)',
  dangerSubtle: 'rgba(239,68,68,0.12)',
  overlaySoft: 'rgba(10,10,24,0.24)',
  overlayFaint: 'rgba(10,10,24,0.14)',
  overlayMedium: 'rgba(10,10,24,0.46)',
  overlayStrong: 'rgba(10,10,24,0.85)',
  scrim: 'rgba(0,0,0,0.62)',
  shadow: '#000000',
  transparent: 'transparent',
} as const satisfies ThemeColors;
