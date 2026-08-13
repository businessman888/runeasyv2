import { paceValueToSecondsPerKm } from './pace';

type UnknownRecord = Record<string, unknown>;

export interface WorkoutPreviewInput {
    type: string;
    distance_km?: number | null;
    target_pace_seconds?: number | null;
    target_duration_seconds?: number | null;
    instructions_json?: readonly unknown[] | null;
}

const DEFAULT_PACE_SECONDS: Record<string, number> = {
    easy_run: 390,
    long_run: 360,
    intervals: 300,
    tempo: 330,
    recovery: 420,
    fartlek: 330,
    progressive: 345,
};

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null;
}

function positiveNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : null;
}

function instructionPace(segment: unknown): number | null {
    if (!isRecord(segment)) return null;
    const direct = positiveNumber(segment.pace_min);
    if (direct != null) return paceValueToSecondsPerKm(direct);
    if (!isRecord(segment.work)) return null;
    const workPace = positiveNumber(segment.work.pace_min);
    return workPace == null ? null : paceValueToSecondsPerKm(workPace);
}

function instructionDuration(segment: unknown): number {
    if (!isRecord(segment)) return 0;
    const direct = positiveNumber(segment.duration_seconds) ?? 0;
    if (segment.type !== 'repeat') return direct;

    const repetitions = Math.max(1, Math.round(positiveNumber(segment.reps) ?? 1));
    const work = isRecord(segment.work)
        ? positiveNumber(segment.work.duration_seconds) ?? 0
        : 0;
    const recovery = isRecord(segment.recovery)
        ? positiveNumber(segment.recovery.duration_seconds) ?? 0
        : 0;
    return repetitions * (work + recovery);
}

export function resolveWorkoutPaceSeconds(workout: WorkoutPreviewInput): number | null {
    if (typeof workout.distance_km === 'number' && workout.distance_km <= 0) return null;

    const direct = positiveNumber(workout.target_pace_seconds);
    if (direct != null) return paceValueToSecondsPerKm(direct);

    const instructions = workout.instructions_json ?? [];
    const preferred = instructions.find(
        (segment) => isRecord(segment) && segment.type === 'main',
    ) ?? instructions.find(
        (segment) => isRecord(segment) && segment.type === 'repeat',
    );
    const fromInstruction = instructionPace(preferred ?? instructions[0]);
    if (fromInstruction != null) return fromInstruction;

    return DEFAULT_PACE_SECONDS[workout.type] ?? 360;
}

export function resolveWorkoutDurationSeconds(workout: WorkoutPreviewInput): number | null {
    const direct = positiveNumber(workout.target_duration_seconds);
    if (direct != null) return Math.round(direct);

    // Espelha o card mobile: treinos por distância usam pace × distância;
    // somar apenas blocos temporais parciais (ex.: aquecimento) subestimaria o total.
    const distance = positiveNumber(workout.distance_km);
    const pace = resolveWorkoutPaceSeconds(workout);
    if (distance != null && pace != null) return Math.round(distance * pace);

    const instructionsDuration = (workout.instructions_json ?? []).reduce<number>(
        (total, segment) => total + instructionDuration(segment),
        0,
    );
    if (instructionsDuration > 0) return Math.round(instructionsDuration);
    return null;
}

export function getEarnableBadgeSlugs(workout: WorkoutPreviewInput): string[] {
    const distance = positiveNumber(workout.distance_km) ?? 0;
    const paceSeconds = resolveWorkoutPaceSeconds(workout);
    const estimatedMinutes = (resolveWorkoutDurationSeconds(workout) ?? 0) / 60;
    const candidates: Array<{ slug: string; priority: number }> = [];

    if (distance >= 42) candidates.push({ slug: 'maratona_completa', priority: 10 });
    else if (distance >= 21) candidates.push({ slug: 'maratonista', priority: 9 });

    if (estimatedMinutes >= 120) candidates.push({ slug: 'duas_horas', priority: 8 });
    else if (estimatedMinutes >= 60) candidates.push({ slug: 'uma_hora', priority: 7 });

    if ((workout.type === 'intervals' || workout.type === 'tempo') && paceSeconds != null) {
        const paceMinutes = paceSeconds / 60;
        if (paceMinutes < 3.5) candidates.push({ slug: 'foguete', priority: 6 });
        else if (paceMinutes < 4) candidates.push({ slug: 'velocista_iv', priority: 5 });
        else if (paceMinutes < 4.5) candidates.push({ slug: 'velocista_iii', priority: 5 });
        else if (paceMinutes < 5) candidates.push({ slug: 'velocista_ii', priority: 5 });
        else if (paceMinutes < 5.5) candidates.push({ slug: 'velocista_i', priority: 5 });
    }

    candidates.push({ slug: 'fiel_ao_plano', priority: 3 });
    candidates.push({ slug: 'primeiro_passo', priority: 1 });

    return candidates
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 2)
        .map(({ slug }) => slug);
}
