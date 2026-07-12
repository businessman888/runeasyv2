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
    type: 'warmup' | 'main' | 'cooldown' | 'repeat';
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

/** Pace (min/km decimal, ex. 4.5 = 4:30) → "4:30/km". Undefined se ausente. */
const formatPaceMin = (paceMin: number | null | undefined): string | undefined => {
    if (typeof paceMin !== 'number' || !isFinite(paceMin) || paceMin <= 0) return undefined;
    const m = Math.floor(paceMin);
    const s = Math.round((paceMin - m) * 60);
    return `${m}:${s.toString().padStart(2, '0')}/km`;
};

/** Rótulo de quantidade de um sub-bloco: "400m", "1 km", "90s" ou "10:00 min". */
const amountLabel = (e: { distance_km?: number; duration_seconds?: number }): string => {
    if (e?.distance_km != null && e.distance_km > 0) {
        return e.distance_km >= 1
            ? `${formatKm(e.distance_km)} km`
            : `${Math.round(e.distance_km * 1000)}m`;
    }
    if (e?.duration_seconds != null && e.duration_seconds > 0) {
        const sec = e.duration_seconds;
        if (sec < 60) return `${sec}s`;
        const m = Math.floor(sec / 60);
        const rem = sec % 60;
        return rem === 0 ? `${m}:00 min` : `${m}:${rem.toString().padStart(2, '0')} min`;
    }
    return '—';
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
            const isRepeat = segment?.type === 'repeat';
            const fallbackDescription =
                segment?.type === 'warmup'
                    ? 'Trote leve z1/z2 para ativar'
                    : segment?.type === 'cooldown'
                        ? 'Trote muito leve + alongamento estático.'
                        : isRepeat
                            ? 'Séries fortes com recuperação entre elas'
                            : 'Ritmo forte, focado na técnica';

            const isMainLike = segment?.type === 'main' || isRepeat;
            const title =
                segment?.type === 'warmup'
                    ? 'Aquecimento'
                    : segment?.type === 'cooldown'
                        ? 'Desaquecimento'
                        : isRepeat
                            ? 'Intervalado'
                            : 'Principal';

            // Duração e pace: intervalado usa "Nx <tiro>" e o pace do work; blocos
            // simples usam distância OU tempo. Tolera o formato antigo (achatado).
            let duration: string;
            let pace: string | undefined;
            let recovery: string | undefined;
            if (isRepeat) {
                const reps = Math.max(1, Math.round(segment.reps || 1));
                duration = `${reps}× ${amountLabel(segment.work ?? {})}`;
                pace = formatPaceMin(segment.work?.pace_min);
                const recAmount = amountLabel(segment.recovery ?? {});
                const recPace = formatPaceMin(segment.recovery?.pace_min);
                recovery = recAmount !== '—'
                    ? `Recuperação ${recAmount}${recPace ? ` · ${recPace}` : ''}`
                    : undefined;
            } else {
                duration = amountLabel(segment ?? {});
                pace = formatPaceMin(segment?.pace_min);
            }

            return {
                id: String(index + 1),
                title,
                subtitle: `Bloco ${String(index + 1).padStart(2, '0')}${isMainLike ? ' - PRINCIPAL' : ''}`,
                type: (segment?.type ?? 'main') as WorkoutBlock['type'],
                duration,
                description: md?.description || fallbackDescription,
                coachNote: md?.coach_note ?? null,
                pace,
                recovery,
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
