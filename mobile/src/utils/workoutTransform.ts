/**
 * Shared transform: API workout → UI `WorkoutData` for the workout detail screen.
 *
 * Extracted from CalendarScreen so the dedicated WorkoutDetailScreen and the
 * calendar can build the exact same block structure. When the backend ships the
 * `metadata` payload (Daniels enrichment) we surface zone/effort/scientific note
 * plus per-segment zone, description and coach_note. Pre-refinement workouts
 * (`metadata` null) keep the original fallback copy so nothing breaks.
 */
import type { TrainingZone, WorkoutPhase } from '../stores/trainingStore';

export interface WorkoutBlock {
    id: string;
    title: string;
    subtitle: string;
    type: 'warmup' | 'main' | 'cooldown';
    duration?: string;
    description?: string;
    /** Coach voice for this block (2nd person, ≤20 words). Only present on enriched plans. */
    coachNote?: string | null;
    pace?: string;
    recovery?: string;
    zone?: TrainingZone | null;
}

export interface WorkoutData {
    id: string;
    title: string;
    distance: string;
    duration: string;
    rpe: string;
    blocks: WorkoutBlock[];
    insight: string;
    zone?: TrainingZone | null;
    phase?: WorkoutPhase | null;
    weekNumber?: number | null;
}

/**
 * Format raw `distance_km` for display: round to 2 decimals, strip trailing
 * zeros ("0.3", "8.5", "21.1"). GPS-derived floats are routine.
 */
export const formatKm = (km: number | null | undefined): string => {
    if (typeof km !== 'number' || !isFinite(km)) return '0';
    return Number(km.toFixed(2)).toString();
};

const WORKOUT_TYPE_LABELS: Record<string, string> = {
    easy_run: 'Rodagem Leve',
    long_run: 'Longão',
    intervals: 'Intervalados',
    tempo: 'Tempo Run',
    recovery: 'Recuperação',
    fartlek: 'Fartlek',
    progressive: 'Progressivo',
    repetition: 'Repetições',
    hill_repeats: 'Subidas',
    race_simulation: 'Simulado',
    free_run: 'Corrida Livre',
};

export function transformWorkoutToUI(workout: any): WorkoutData {
    const metadata = workout?.metadata ?? null;
    const segmentDescriptions: Array<{
        zone?: string | null;
        description?: string | null;
        coach_note?: string | null;
    }> = metadata?.segment_descriptions ?? [];

    const blocks: WorkoutBlock[] = (workout.instructions_json || []).map(
        (segment: any, index: number) => {
            const md = segmentDescriptions[index];
            const fallbackDescription =
                segment.type === 'warmup'
                    ? 'Trote leve z1/z2 para ativar'
                    : segment.type === 'cooldown'
                        ? 'Trote muito leve + alongamento estático.'
                        : 'Ritmo forte, focado na técnica';

            return {
                id: String(index + 1),
                title:
                    segment.type === 'warmup'
                        ? 'Aquecimento'
                        : segment.type === 'cooldown'
                            ? 'Desaquecimento'
                            : 'Principal',
                subtitle: `Bloco ${String(index + 1).padStart(2, '0')}${segment.type === 'main' ? ' - PRINCIPAL' : ''}`,
                type: segment.type,
                duration: `${formatKm(segment.distance_km)} km`,
                description: md?.description || fallbackDescription,
                coachNote: md?.coach_note ?? null,
                pace:
                    segment.pace_min && segment.pace_max
                        ? `${segment.pace_min.toFixed(0)}:${((segment.pace_min % 1) * 60).toFixed(0).padStart(2, '0')}/km`
                        : undefined,
                zone: (md?.zone as TrainingZone | undefined) ?? null,
            };
        },
    );

    const distanceLabel = formatKm(workout.distance_km);
    const rpeFromMetadata = metadata?.perceived_effort
        ? `RPE ${metadata.perceived_effort}`
        : 'RPE 6/10';
    const insight =
        metadata?.scientific_note ||
        workout.objective ||
        'Mantenha o foco e aproveite o treino!';

    return {
        id: workout.id,
        title: `${WORKOUT_TYPE_LABELS[workout.type] || workout.type} - ${distanceLabel}km`,
        distance: `${distanceLabel} km`,
        duration: `${Math.round((workout.distance_km || 0) * 6)} min`, // Estimate based on 6 min/km
        rpe: rpeFromMetadata,
        blocks,
        insight,
        zone: (metadata?.zone as TrainingZone | undefined) ?? null,
        phase: (metadata?.week_phase as WorkoutPhase | undefined) ?? null,
        weekNumber: workout.week_number ?? null,
    };
}
