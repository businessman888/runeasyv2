/**
 * Contrato puro do applicationContext iPhone -> Apple Watch.
 *
 * Este arquivo nao importa React Native para que o envelope possa ser validado
 * no Node e reutilizado por fixtures. O transporte continua em appleWatch.ts.
 */

export const WATCH_CONTEXT_SCHEMA_VERSION = 3;
export const WATCH_CONTEXT_SUPPORTED_SCHEMA_VERSIONS = [2, 3] as const;
export const WATCH_CONTEXT_POLICY_VERSIONS = {
    context: 3,
    coach: 1,
    execution: 1,
} as const;

export const WATCH_CONTEXT_WARN_BYTES = 16_000;
export const WATCH_CONTEXT_MAX_BYTES = 200_000;

const OPTIONAL_HEAVY_FIELDS = [
    'today_activities',
    'latest_plan_result',
    'latest_activity_result',
    'coach_policy',
    'execution_steps',
] as const;

export interface WatchPolicyVersions {
    context: number;
    coach: number;
    execution: number;
}

export interface WatchCoachPolicy {
    version: number;
    /** Um unico device pode falar; none e o default seguro. */
    audioOwner: 'watch' | 'phone' | 'none';
    locale: string;
    splitIntervalMeters: number;
    minimumCueGapSeconds: number;
    cueTtlSeconds: number;
    advancedCuesEnabled: boolean;
}

export const WATCH_COACH_DEFAULT_POLICY = {
    version: WATCH_CONTEXT_POLICY_VERSIONS.coach,
    audioOwner: 'watch',
    locale: 'pt-BR',
    splitIntervalMeters: 1_000,
    minimumCueGapSeconds: 20,
    cueTtlSeconds: 8,
    advancedCuesEnabled: false,
} as const satisfies WatchCoachPolicy;

/**
 * O Watch só recebe ownership do áudio quando a experiência está realmente
 * habilitada. A ausência da policy mantém o decoder nativo no default seguro
 * `.none`, impedindo que iPhone e Watch falem ao mesmo tempo.
 */
export function buildWatchCoachPolicy(
    audioCoachEnabled: boolean,
): WatchCoachPolicy | undefined {
    return audioCoachEnabled ? { ...WATCH_COACH_DEFAULT_POLICY } : undefined;
}

export type WatchExecutionStepKind =
    | 'warmup'
    | 'main'
    | 'cooldown'
    | 'work'
    | 'recovery';
export type WatchExecutionMetric = 'distance' | 'time';

/** Espelha SegStep sem depender do motor mobile no decoder do Watch. */
export interface WatchExecutionStep {
    index: number;
    blockIndex: number;
    kind: WatchExecutionStepKind;
    metric: WatchExecutionMetric;
    /** Metros para distance; milissegundos para time. */
    target: number;
    /** Segundos por quilometro. */
    paceMin: number;
    /** Segundos por quilometro. */
    paceMax: number;
    repIndex?: number;
    repTotal?: number;
}

export interface WatchContractCapabilities {
    featureFlags?: {
        liveMap: boolean;
        audioCoach: boolean;
    };
    policyVersions?: WatchPolicyVersions;
    coachPolicy?: WatchCoachPolicy;
    executionSteps?: WatchExecutionStep[];
}

export interface FinalizedWatchContext {
    payload: Record<string, unknown>;
    sizeBytes: number;
    originalSizeBytes: number;
    wasReduced: boolean;
}

export class WatchContextPayloadTooLargeError extends Error {
    readonly sizeBytes: number;

    constructor(sizeBytes: number) {
        super(`Watch applicationContext permanece com ${sizeBytes} bytes apos reducao`);
        this.name = 'WatchContextPayloadTooLargeError';
        this.sizeBytes = sizeBytes;
    }
}

/** Campos versionados adicionados no schema 3. */
export function buildWatchContractFields(
    capabilities: WatchContractCapabilities,
): Record<string, unknown> {
    const liveMapEnabled = capabilities.featureFlags?.liveMap ?? false;
    const audioCoachEnabled = capabilities.featureFlags?.audioCoach ?? false;
    const policyVersions = capabilities.policyVersions ?? WATCH_CONTEXT_POLICY_VERSIONS;

    return {
        schema_version: WATCH_CONTEXT_SCHEMA_VERSION,
        watch_map_enabled: liveMapEnabled,
        watch_coach_enabled: audioCoachEnabled,
        // Mantido durante a janela 1.0.8 -> 1.0.9 para leitores schema 2.
        feature_flags: {
            live_map: liveMapEnabled,
            audio_coach: audioCoachEnabled,
        },
        policy_versions: {
            context: policyVersions.context,
            coach: policyVersions.coach,
            execution: policyVersions.execution,
        },
        coach_policy: capabilities.coachPolicy
            ? {
                version: capabilities.coachPolicy.version,
                audio_owner: capabilities.coachPolicy.audioOwner,
                locale: capabilities.coachPolicy.locale,
                split_interval_meters: capabilities.coachPolicy.splitIntervalMeters,
                minimum_cue_gap_seconds: capabilities.coachPolicy.minimumCueGapSeconds,
                cue_ttl_seconds: capabilities.coachPolicy.cueTtlSeconds,
                advanced_cues_enabled: capabilities.coachPolicy.advancedCuesEnabled,
            }
            : undefined,
        execution_steps: capabilities.executionSteps?.map((step) => ({
            index: step.index,
            block_index: step.blockIndex,
            kind: step.kind,
            metric: step.metric,
            target: step.target,
            pace_min: step.paceMin,
            pace_max: step.paceMax,
            rep_index: step.repIndex,
            rep_total: step.repTotal,
        })),
    };
}

export function watchContextByteLength(payload: Record<string, unknown>): number {
    const json = JSON.stringify(payload);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length;
    return json.length * 2;
}

/** Remove valores que nao pertencem a uma property list do WatchConnectivity. */
export function sanitizeWatchPropertyList(value: unknown): unknown {
    if (value == null) return undefined;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (Array.isArray(value)) {
        return value
            .map(sanitizeWatchPropertyList)
            .filter((item) => item !== undefined);
    }
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .map(([key, item]) => [key, sanitizeWatchPropertyList(item)] as const)
                .filter(([, item]) => item !== undefined),
        );
    }
    return undefined;
}

/** Sanitiza, mede e reduz somente campos opcionais antes de publicar o snapshot. */
export function finalizeWatchApplicationContext(
    draft: Record<string, unknown>,
): FinalizedWatchContext {
    const payload = sanitizeWatchPropertyList(draft) as Record<string, unknown>;
    const originalSizeBytes = watchContextByteLength(payload);
    if (originalSizeBytes <= WATCH_CONTEXT_MAX_BYTES) {
        return { payload, sizeBytes: originalSizeBytes, originalSizeBytes, wasReduced: false };
    }

    const reducedDraft = { ...payload };
    for (const key of OPTIONAL_HEAVY_FIELDS) delete reducedDraft[key];
    // Nunca anuncie coach sem a policy que define um único dono do áudio.
    if (!('coach_policy' in reducedDraft)) {
        reducedDraft.watch_coach_enabled = false;
        const legacyFlags = reducedDraft.feature_flags;
        if (legacyFlags && typeof legacyFlags === 'object' && !Array.isArray(legacyFlags)) {
            reducedDraft.feature_flags = {
                ...(legacyFlags as Record<string, unknown>),
                audio_coach: false,
            };
        }
    }
    const reducedPayload = sanitizeWatchPropertyList(reducedDraft) as Record<string, unknown>;
    const sizeBytes = watchContextByteLength(reducedPayload);
    if (sizeBytes > WATCH_CONTEXT_MAX_BYTES) {
        throw new WatchContextPayloadTooLargeError(sizeBytes);
    }

    return { payload: reducedPayload, sizeBytes, originalSizeBytes, wasReduced: true };
}
