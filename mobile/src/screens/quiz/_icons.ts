/**
 * Unified Ionicons map for the onboarding option screens.
 *
 * Replaces the hand-drawn inline SVG paths (Objective/Level) and the single
 * running icon that was repeated across every RecentDistance option. GoalType
 * already used Ionicons — this generalizes that pattern.
 */
import { Ionicons } from '@expo/vector-icons';

export type IoniconName = keyof typeof Ionicons.glyphMap;

// Objective (data.goal storeValue → icon)
export const OBJECTIVE_ICONS: Record<string, IoniconName> = {
    '5k': 'walk-outline',
    '10k': 'pulse-outline',
    half_marathon: 'trophy-outline',
    marathon: 'medal-outline',
    general_fitness: 'fitness-outline',
};

// Experience level (data.experience_level storeValue → icon)
export const LEVEL_ICONS: Record<string, IoniconName> = {
    beginner: 'leaf-outline',
    intermediate: 'trending-up-outline',
    advanced: 'flame-outline',
};

// Recent distance (km value → icon). 0 = "nunca corri" (sentinela).
export const DISTANCE_ICONS: Record<number, IoniconName> = {
    0: 'help-circle-outline',
    3: 'walk-outline',
    5: 'pulse-outline',
    10: 'speedometer-outline',
    15: 'flame-outline',
};

// Recent frequency (últimas 4 semanas) — storeValue → icon
export const RECENT_FREQUENCY_ICONS: Record<string, IoniconName> = {
    never: 'remove-circle-outline',
    '1x': 'ellipse-outline',
    '2x': 'reorder-two-outline',
    '3x': 'reorder-three-outline',
    '4x_plus': 'flame-outline',
};

// Current weekly volume (km/semana atual) — storeValue → icon
export const WEEKLY_KM_ICONS: Record<string, IoniconName> = {
    lt5: 'walk-outline',
    '5_10': 'pulse-outline',
    '10_20': 'speedometer-outline',
    '20_30': 'trending-up-outline',
    gt30: 'flame-outline',
};

// Walk capacity (fluxo "nunca corri") — storeValue → icon
export const WALK_CAPACITY_ICONS: Record<string, IoniconName> = {
    easy: 'happy-outline',
    effort: 'walk-outline',
    not_yet: 'bandage-outline',
};

// Goal type
export const GOAL_TYPE_ICONS: Record<string, IoniconName> = {
    distance: 'trending-up-outline',
    race: 'flag-outline',
};

export const DEFAULT_OPTION_ICON: IoniconName = 'ellipse-outline';
