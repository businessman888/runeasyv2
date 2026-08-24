import { semanticColors } from '../../theme/semanticColors';

/**
 * Visual tokens for training phases (base / build / peak / taper).
 *
 * Each phase gets its own accent color so users can scan the plan and feel
 * the progression — much like the energy color shifts on Strava's training
 * blocks. PT-BR labels match the AI prompt's phase naming convention.
 */

export type PhaseKey = 'base' | 'build' | 'peak' | 'taper';

export interface PhaseStyle {
    label: string;
    accent: string;          // bold accent (text + pill fill)
    pillBg: string;          // translucent fill for the pill
    glow: string;            // shadow / glow tint for the current week
}

function createPhaseStyles(): Record<PhaseKey, PhaseStyle> {
  return {
    base: {
        label: 'Base',
        accent: semanticColors.accent,
        pillBg: semanticColors.accentSubtle,
        glow: semanticColors.canvas,
    },
    build: {
        label: 'Desenvolvimento',
        accent: '#A78BFA',
        pillBg: 'rgba(167, 139, 250, 0.16)',
        glow: semanticColors.canvas,
    },
    peak: {
        label: 'Específico',
        accent: '#FFB547',
        pillBg: 'rgba(255, 181, 71, 0.16)',
        glow: semanticColors.canvas,
    },
    taper: {
        label: 'Polimento',
        accent: '#32E08A',
        pillBg: 'rgba(50, 224, 138, 0.16)',
        glow: semanticColors.canvas,
    },
  };
}

export function getPhaseStyle(phase: string | null | undefined): PhaseStyle {
    const phaseStyles = createPhaseStyles();
    const fallback = phaseStyles.base;

    if (!phase) return fallback;
    const key = phase.toLowerCase() as PhaseKey;
    return phaseStyles[key] ?? fallback;
}
