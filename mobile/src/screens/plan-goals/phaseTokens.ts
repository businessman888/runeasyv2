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
        accent: '#00D4FF',
        pillBg: 'rgba(0, 212, 255, 0.14)',
        glow: 'rgba(0, 212, 255, 0.35)',
    },
    build: {
        label: 'Desenvolvimento',
        accent: '#A78BFA',
        pillBg: 'rgba(167, 139, 250, 0.16)',
        glow: 'rgba(167, 139, 250, 0.35)',
    },
    peak: {
        label: 'Específico',
        accent: '#FFB547',
        pillBg: 'rgba(255, 181, 71, 0.16)',
        glow: 'rgba(255, 181, 71, 0.35)',
    },
    taper: {
        label: 'Polimento',
        accent: '#32E08A',
        pillBg: 'rgba(50, 224, 138, 0.16)',
        glow: 'rgba(50, 224, 138, 0.35)',
    },
};

const FALLBACK: PhaseStyle = PHASE_STYLES.base;

export function getPhaseStyle(phase: string | null | undefined): PhaseStyle {
    if (!phase) return FALLBACK;
    const key = phase.toLowerCase() as PhaseKey;
    return PHASE_STYLES[key] ?? FALLBACK;
}
