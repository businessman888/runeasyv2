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
import { formatPaceRangeLabel } from './pace';

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
    walk_run: 'Caminhada e Corrida',
};

/**
 * Duração total (segundos) somando os segmentos por TEMPO (expande `repeat`:
 * reps × (work + recovery)). Segmentos por distância contribuem 0 — por isso só
 * é usada como fonte de verdade quando o treino é por tempo (distance_km≈0),
 * como o protocolo caminhada/corrida ("nunca corri"). Fonte única de verdade.
 */
export const workoutDurationSeconds = (instructions: any[] | null | undefined): number => {
    if (!Array.isArray(instructions)) return 0;
    let total = 0;
    for (const seg of instructions) {
        if (seg?.type === 'repeat') {
            const reps = Math.max(1, Math.round(seg.reps || 1));
            total += reps * ((seg.work?.duration_seconds || 0) + (seg.recovery?.duration_seconds || 0));
        } else {
            total += seg?.duration_seconds || 0;
        }
    }
    return total;
};

/** Segundos → "36 min" ou "1h05". */
export const formatDurationLabel = (seconds: number): string => {
    const m = Math.round(seconds / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h` : `${h}h${String(rem).padStart(2, '0')}`;
};

/** Treino é medido por tempo (sem distância) — ex.: protocolo caminhada/corrida. */
export const isTimeBasedWorkout = (
    distanceKm: number | null | undefined,
    instructions: any[] | null | undefined,
): boolean => {
    const km = typeof distanceKm === 'number' ? distanceKm : 0;
    return !(km > 0) && workoutDurationSeconds(instructions) > 0;
};

/** Faixa-alvo de pace (segundos/km, tolera decimal legado) → "4:50–5:10/km". */
const paceRange = (
    min: number | null | undefined,
    max: number | null | undefined,
): string | undefined => {
    const label = formatPaceRangeLabel(min, max);
    return label ? `${label}/km` : undefined;
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
                pace = paceRange(segment.work?.pace_min, segment.work?.pace_max);
                const recAmount = amountLabel(segment.recovery ?? {});
                const recPace = paceRange(segment.recovery?.pace_min, segment.recovery?.pace_max);
                recovery = recAmount !== '—'
                    ? `Recuperação ${recAmount}${recPace ? ` · ${recPace}` : ''}`
                    : undefined;
            } else {
                duration = amountLabel(segment ?? {});
                pace = paceRange(segment?.pace_min, segment?.pace_max);
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

    // Treino por tempo (caminhada/corrida): exibir DURAÇÃO (soma dos segmentos),
    // nunca "0 km / 0 min" derivado de distance_km*6.
    const typeLabel = WORKOUT_TYPE_LABELS[workout.type] || workout.type;
    const timeBased = isTimeBasedWorkout(workout.distance_km, workout.instructions_json);
    const durationLabel = timeBased
        ? formatDurationLabel(workoutDurationSeconds(workout.instructions_json))
        : `${Math.round((workout.distance_km || 0) * 6)} min`; // estimativa 6 min/km

    return {
        id: workout.id,
        title: timeBased
            ? `${typeLabel} - ${durationLabel}`
            : `${typeLabel} - ${distanceLabel}km`,
        distance: timeBased ? '—' : `${distanceLabel} km`,
        duration: durationLabel,
        rpe: rpeFromMetadata,
        blocks,
        insight,
        zone: (metadata?.zone as TrainingZone | undefined) ?? null,
        phase: (metadata?.week_phase as WorkoutPhase | undefined) ?? null,
        weekNumber: workout.week_number ?? null,
    };
}
