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

const PHASE_STYLES: Record<PhaseKey, PhaseStyle> = {
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

const FALLBACK: PhaseStyle = PHASE_STYLES.base;

export function getPhaseStyle(phase: string | null | undefined): PhaseStyle {
    if (!phase) return FALLBACK;
    const key = phase.toLowerCase() as PhaseKey;
    return PHASE_STYLES[key] ?? FALLBACK;
}
