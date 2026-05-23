/**
 * Wrapper TS sobre o Expo Module nativo `expo-garmin-connect-iq` (Connect IQ
 * Mobile SDK). Espelha o estilo do `appleWatch.ts`:
 *
 *   iPhone → Watch: `sendTodayWorkout()` envia o treino do dia + zonas.
 *   Watch → iPhone: o app no relógio chama `Communications.transmit()`; aqui
 *   escutamos `onMessage` e roteamos `WORKOUT_COMPLETE` para `listeners.completedRun`.
 *
 * Idempotente: pode chamar `initGarmin()` várias vezes sem efeitos colaterais.
 */

import { Platform } from 'react-native';

import ExpoGarminConnectIQ, {
    GarminDevice,
    GarminIncomingMessage,
} from '../../modules/expo-garmin-connect-iq/src';
import { GARMIN_APP_UUID, GARMIN_STORE_UUID } from '../constants/garmin';

// ---------------------------------------------------------------------------
// Tipos — payloads que trafegam entre o app do relógio e o mobile
// ---------------------------------------------------------------------------

export interface GarminRoutePoint {
    latitude: number;
    longitude: number;
    altitude: number | null;
    timestamp: number; // unix epoch ms
    speed: number | null;
    accuracy: number | null;
}

export interface CompletedRunFromGarmin {
    /** Quando null = corrida livre; quando string = treino do plano com este id. */
    workout_id: string | null;
    /** Garmin activity id (string única dentro do app no relógio). Usada para dedup. */
    external_id: string;
    total_distance_meters: number;
    duration_seconds: number;
    avg_pace_seconds_per_km: number;
    avg_heart_rate: number | null;
    max_heart_rate: number | null;
    calories: number | null;
    route_points: GarminRoutePoint[];
    started_at: string; // ISO 8601
    source: 'garmin_watch';
    /** "fēnix 7 Pro" etc. — vem do app no relógio. */
    garmin_device_name: string;
}

export interface PaceZone {
    /** s/km (mínimo da faixa). */
    min: number;
    /** s/km (máximo da faixa). */
    max: number;
}

export interface TodayWorkoutForGarmin {
    id: string;
    type: 'rodagem' | 'longao' | 'intervalado' | 'tiros' | 'rest';
    title: string;
    distanceKm: number;
    /** Pace alvo em formato display ("5:30/km"). */
    targetPace: string;
    instructions: string;
    /** Duração-alvo em segundos (para o card do relógio mostrar "Tempo: 51:35"). */
    targetDurationSeconds?: number | null;
    /** Z1-Z5 derivadas do pace do usuário (limite mínimo/máximo em s/km por zona). */
    zones?: { z1: PaceZone; z2: PaceZone; z3: PaceZone; z4: PaceZone; z5: PaceZone };
    status?: 'pending' | 'completed';
}

/** Envelope esperado em mensagens recebidas do relógio. */
interface GarminEnvelope {
    type: 'WORKOUT_COMPLETE' | 'HANDSHAKE_ACK' | string;
    payload?: unknown;
    sent_at?: string;
}

// ---------------------------------------------------------------------------
// Listener registry
// ---------------------------------------------------------------------------

type CompletedRunListener = (run: CompletedRunFromGarmin) => void;
type DeviceStatusListener = (device: GarminDevice) => void;
type HandshakeAckListener = (payload: Record<string, unknown>) => void;

const listeners = {
    completedRun: new Set<CompletedRunListener>(),
    deviceStatus: new Set<DeviceStatusListener>(),
    handshakeAck: new Set<HandshakeAckListener>(),
};

let initialized = false;
let initializing: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Inicializa o SDK e registra os listeners. Idempotente — pode ser chamado
 * múltiplas vezes (várias screens) sem efeito colateral.
 */
export function initGarmin(): Promise<void> {
    if (initialized) return Promise.resolve();
    if (initializing) return initializing;
    if (Platform.OS === 'web') return Promise.resolve();

    initializing = (async () => {
        await ExpoGarminConnectIQ.initialize(GARMIN_APP_UUID, GARMIN_STORE_UUID);

        ExpoGarminConnectIQ.addListener('onMessage', ({ message }) => {
            handleIncomingMessage(message);
        });

        ExpoGarminConnectIQ.addListener('onDeviceStatusChange', ({ device }) => {
            listeners.deviceStatus.forEach((cb) => {
                try {
                    cb(device);
                } catch (e) {
                    console.warn('[Garmin] deviceStatus listener error:', e);
                }
            });
        });

        initialized = true;
        console.log('[Garmin] initialized');
    })();

    return initializing;
}

function handleIncomingMessage(message: GarminIncomingMessage) {
    const envelope = message.payload as GarminEnvelope | null;
    const type = envelope?.type ?? message.type;

    if (type === 'WORKOUT_COMPLETE') {
        const raw = (envelope?.payload ?? envelope) as Record<string, unknown>;
        const run = parseCompletedRun(raw, message.deviceId);
        if (run) {
            listeners.completedRun.forEach((cb) => {
                try {
                    cb(run);
                } catch (e) {
                    console.warn('[Garmin] completedRun listener error:', e);
                }
            });
        }
    } else if (type === 'HANDSHAKE_ACK') {
        const payload = (envelope?.payload ?? envelope) as Record<string, unknown>;
        listeners.handshakeAck.forEach((cb) => {
            try {
                cb(payload);
            } catch (e) {
                console.warn('[Garmin] handshakeAck listener error:', e);
            }
        });
    }
}

function parseCompletedRun(raw: Record<string, unknown>, deviceId: string): CompletedRunFromGarmin | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const distance = Number(raw.distance_m ?? raw.total_distance_meters);
    const duration = Number(raw.duration_s ?? raw.duration_seconds);
    if (!Number.isFinite(distance) || !Number.isFinite(duration)) return null;

    const route = Array.isArray(raw.route)
        ? (raw.route as unknown[]).map((p) => parseRoutePoint(p)).filter(Boolean) as GarminRoutePoint[]
        : (Array.isArray(raw.route_points)
            ? (raw.route_points as GarminRoutePoint[])
            : []);

    return {
        workout_id: (raw.workout_id as string | null) ?? null,
        external_id: String(raw.activity_id ?? raw.external_id ?? `${deviceId}-${Date.now()}`),
        total_distance_meters: distance,
        duration_seconds: duration,
        avg_pace_seconds_per_km: Number(raw.avg_pace ?? raw.avg_pace_seconds_per_km ?? duration / Math.max(distance / 1000, 0.001)),
        avg_heart_rate: nullableNumber(raw.avg_hr ?? raw.avg_heart_rate),
        max_heart_rate: nullableNumber(raw.max_hr ?? raw.max_heart_rate),
        calories: nullableNumber(raw.calories),
        route_points: route,
        started_at: String(raw.started_at ?? new Date(Date.now() - duration * 1000).toISOString()),
        source: 'garmin_watch',
        garmin_device_name: String(raw.device_name ?? 'Garmin'),
    };
}

function parseRoutePoint(raw: unknown): GarminRoutePoint | null {
    // Formato tuple `[lat, lng, alt, ts]` ou objeto `{ latitude, longitude, ... }`.
    if (Array.isArray(raw) && raw.length >= 2) {
        return {
            latitude: Number(raw[0]),
            longitude: Number(raw[1]),
            altitude: raw[2] != null ? Number(raw[2]) : null,
            timestamp: raw[3] != null ? Number(raw[3]) : Date.now(),
            speed: null,
            accuracy: null,
        };
    }
    if (typeof raw === 'object' && raw !== null) {
        const p = raw as Record<string, unknown>;
        const lat = Number(p.latitude ?? p.lat);
        const lng = Number(p.longitude ?? p.lng ?? p.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
            latitude: lat,
            longitude: lng,
            altitude: nullableNumber(p.altitude ?? p.alt),
            timestamp: Number(p.timestamp ?? p.ts ?? Date.now()),
            speed: nullableNumber(p.speed),
            accuracy: nullableNumber(p.accuracy),
        };
    }
    return null;
}

function nullableNumber(v: unknown): number | null {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function isGarminConnectInstalled(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    return ExpoGarminConnectIQ.isGarminConnectInstalled();
}

export async function openGarminConnectStore(): Promise<void> {
    return ExpoGarminConnectIQ.openGarminConnectStore();
}

export async function getKnownDevices(): Promise<GarminDevice[]> {
    if (Platform.OS === 'web') return [];
    return ExpoGarminConnectIQ.getKnownDevices();
}

export async function getConnectedDevice(): Promise<GarminDevice | null> {
    const devices = await getKnownDevices();
    return devices.find((d) => d.status === 'connected') ?? null;
}

export async function isAppInstalledOnDevice(deviceId: string): Promise<boolean> {
    return ExpoGarminConnectIQ.isAppInstalledOnDevice(deviceId);
}

export async function openAppStoreOnDevice(deviceId: string): Promise<void> {
    return ExpoGarminConnectIQ.openAppStoreOnDevice(deviceId);
}

/**
 * Envia o treino do dia + zonas de pace para o app no relógio.
 * O `userToken` é incluído para que o relógio possa, no futuro, autenticar
 * sync direto com o backend (não usado nesta fase — sempre relay via mobile).
 */
export async function sendTodayWorkout(
    device: GarminDevice,
    workout: TodayWorkoutForGarmin,
    userToken: string,
): Promise<void> {
    const payload = {
        type: 'WORKOUT_DATA',
        workout,
        user_token: userToken,
        sent_at: new Date().toISOString(),
    };
    return ExpoGarminConnectIQ.sendMessage(device.id, payload);
}

/**
 * Handshake inicial — envia HANDSHAKE com user token e aguarda HANDSHAKE_ACK
 * por até `timeoutMs`. Não falha se não houver ACK (relógio antigo pode não
 * implementar) — apenas resolve indicando se o ack chegou.
 */
export async function performHandshake(
    device: GarminDevice,
    userToken: string,
    timeoutMs = 5000,
): Promise<boolean> {
    let unsub: (() => void) | null = null;
    const ackPromise = new Promise<boolean>((resolve) => {
        unsub = onHandshakeAck(() => resolve(true));
        setTimeout(() => resolve(false), timeoutMs);
    });
    await ExpoGarminConnectIQ.sendMessage(device.id, {
        type: 'HANDSHAKE',
        user_token: userToken,
        sent_at: new Date().toISOString(),
    });
    const acked = await ackPromise;
    unsub?.();
    return acked;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export function onCompletedRun(cb: CompletedRunListener): () => void {
    listeners.completedRun.add(cb);
    return () => listeners.completedRun.delete(cb);
}

export function onDeviceStatusChange(cb: DeviceStatusListener): () => void {
    listeners.deviceStatus.add(cb);
    return () => listeners.deviceStatus.delete(cb);
}

export function onHandshakeAck(cb: HandshakeAckListener): () => void {
    listeners.handshakeAck.add(cb);
    return () => listeners.handshakeAck.delete(cb);
}

// ---------------------------------------------------------------------------
// DEV ONLY — mock helpers usados pelo DevMenuScreen.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-unused-vars */
export function __simulateCompletedRun(partial?: Partial<CompletedRunFromGarmin>): void {
    if (!__DEV__) return;
    const now = Date.now();
    const distance = partial?.total_distance_meters ?? 5230;
    const duration = partial?.duration_seconds ?? 1845;
    const run: CompletedRunFromGarmin = {
        workout_id: null,
        external_id: `mock-${now}`,
        total_distance_meters: distance,
        duration_seconds: duration,
        avg_pace_seconds_per_km: duration / Math.max(distance / 1000, 0.001),
        avg_heart_rate: 155,
        max_heart_rate: 178,
        calories: 420,
        route_points: [],
        started_at: new Date(now - duration * 1000).toISOString(),
        source: 'garmin_watch',
        garmin_device_name: 'fēnix 7 Pro (Mock)',
        ...partial,
    };
    listeners.completedRun.forEach((cb) => cb(run));
}

export function __simulateDeviceStatus(status: GarminDevice['status']): void {
    if (!__DEV__) return;
    const device: GarminDevice = { id: 'mock-device', name: 'fēnix 7 Pro (Mock)', status };
    listeners.deviceStatus.forEach((cb) => cb(device));
}
