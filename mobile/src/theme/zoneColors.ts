import { colors } from './index';
import type { TrainingZone } from '../stores/trainingStore';

/**
 * Daniels training zone palette. Maps each zone to a color from the
 * existing design system so we don't introduce new tokens.
 *
 * Z1 Easy        → success green (low intensity, base aerobic)
 * Z2 Marathon    → primary cyan (steady, sustainable)
 * Z3 Threshold   → warning yellow (uncomfortable but controlled)
 * Z4 Interval    → accent amber (hard, VO2max)
 * Z5 Repetition  → error red (very hard, speed)
 */
export const ZONE_COLORS: Record<TrainingZone, string> = {
    Z1: colors.success,
    Z2: colors.primary,
    Z3: colors.warning,
    Z4: colors.accent,
    Z5: colors.error,
};

export const ZONE_LABELS: Record<TrainingZone, string> = {
    Z1: 'Easy',
    Z2: 'Marathon',
    Z3: 'Threshold',
    Z4: 'Interval',
    Z5: 'Repetition',
};

export const PHASE_LABELS: Record<'base' | 'build' | 'peak' | 'taper', string> = {
    base: 'Base',
    build: 'Desenvolvimento',
    peak: 'Específico',
    taper: 'Polimento',
};

export function getZoneColor(zone: TrainingZone | null | undefined): string | null {
    if (!zone) return null;
    return ZONE_COLORS[zone] ?? null;
}

export function getZoneLabel(zone: TrainingZone | null | undefined): string | null {
    if (!zone) return null;
    return ZONE_LABELS[zone] ?? null;
}
