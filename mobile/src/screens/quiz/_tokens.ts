/**
 * Single source of truth for the onboarding quiz visual language.
 *
 * Why this exists: every quiz screen used to re-declare its own colors, title
 * sizes, bullet shapes and option spacing, producing the inconsistencies the
 * UI audit flagged (spacing 10–24px, radio-30 vs radio-24 vs checkbox, four
 * font families). Consume these tokens instead of hardcoding.
 *
 * Font note: the app only loads Plus Jakarta Sans at runtime (App.tsx →
 * useFonts). The previous `Poppins-*` / `Inter-*` references silently fell back
 * to the system font, so we standardize on the loaded brand font via `fonts`.
 */
import { fonts } from '../../theme';

export const QUIZ = {
    color: {
        bg: '#0F0F1E',
        card: '#1C1C2E',
        cyan: '#00D4FF',
        text: '#EBEBF5',
        textDim: 'rgba(235, 235, 245, 0.6)',
        selectedFill: 'rgba(0, 212, 255, 0.10)',
        stroke: 'rgba(235, 235, 245, 0.1)',
        border: 'rgba(235, 235, 245, 0.16)',
    },
    // Title/subtitle scale — one size everywhere (was 20/24/28/30 across screens).
    title: {
        fontFamily: fonts.bold,
        fontSize: 26,
        lineHeight: 34,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        lineHeight: 22,
    },
    optionTitle: {
        fontFamily: fonts.semibold,
        fontSize: 18,
    },
    optionSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
    },
    // The ONE spacing between options.
    gapOptions: 12,
    card: {
        radius: 16,
        padding: 16,
        borderWidth: 2,
    },
    // Single radio bullet, always on the right.
    bullet: {
        size: 26,
        dot: 14,
    },
    iconBox: {
        size: 48,
        radius: 12,
    },
} as const;

export default QUIZ;
