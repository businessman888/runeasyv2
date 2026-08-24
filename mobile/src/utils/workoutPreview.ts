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

/**
 * O BLOCO QUE DEFINE O TREINO — e a faixa de pace dele.
 *
 * ── POR QUE ISTO EXISTE (Fase 6.4) ───────────────────────────────────────────
 *
 * O card do dia mostrava `instructions_json[0].pace_min`: o **primeiro** bloco
 * (o aquecimento) e a **borda rápida** da faixa dele. Dois erros no mesmo
 * número, e o segundo é o pior — o cue `aliviar_ritmo` dispara exatamente
 * quando o corredor passa de `pace_min`. O app exibia a borda rápida como alvo
 * e depois repreendia quem correu nela.
 *
 * A preferência `main → repeat → primeiro` é a MESMA de
 * `resolveWorkoutPaceSeconds` — é o bloco que caracteriza o treino. Num
 * intervalado o esforço mora em `work`, não no topo do bloco.
 *
 * Devolve a faixa INTEIRA e a zona: quem exibe decide o que fazer com elas, e
 * a zona é o que diz se um treino é fácil (Z1/Z2) sem depender de uma lista de
 * `type` para manter em sincronia com o gerador.
 */
export interface MainEffortBand {
    /** Borda RÁPIDA, em segundos/km. */
    paceMin: number | null;
    /** Borda LENTA, em segundos/km — o alvo da orientação de esforço. */
    paceMax: number | null;
    /** `Z1`…`Z5`, quando o segmento a declara. */
    zone: string | null;
}

/** O sub-bloco onde o esforço realmente mora (o `work` de um intervalado). */
function effortOf(segment: unknown): Record<string, unknown> | null {
    if (!isRecord(segment)) return null;
    if (positiveNumber(segment.pace_min) != null) return segment;
    if (isRecord(segment.work)) return segment.work;
    return null;
}

export function mainEffortBand(
    instructions: readonly unknown[] | null | undefined,
): MainEffortBand {
    const empty: MainEffortBand = { paceMin: null, paceMax: null, zone: null };
    const segments = instructions ?? [];
    if (segments.length === 0) return empty;

    const preferred =
        segments.find((s) => isRecord(s) && s.type === 'main') ??
        segments.find((s) => isRecord(s) && s.type === 'repeat') ??
        segments[0];

    const effort = effortOf(preferred);
    if (!effort) return empty;

    // A zona pode viver no sub-bloco de esforço ou no topo do `repeat` — mesma
    // precedência que o backend usa em `applyZonePacesToSegments`.
    const rawZone =
        effort.zone ?? (isRecord(preferred) ? preferred.zone : undefined);

    return {
        paceMin: paceValueToSecondsPerKm(positiveNumber(effort.pace_min)),
        paceMax: paceValueToSecondsPerKm(positiveNumber(effort.pace_max)),
        zone: typeof rawZone === 'string' ? rawZone : null,
    };
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
