/**
 * Hooks para integração Garmin Connect IQ.
 *
 *   useGarmin()      — estado do dispositivo (para UI: card "Garmin Conectado").
 *   useGarminSync()  — pushes automáticos do treino do dia para o relógio
 *                      (espelha o estilo de useWatchSync para Apple Watch).
 */

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { GarminDevice } from '../../modules/expo-garmin-connect-iq/src';
import {
    initGarmin,
    getConnectedDevice,
    isAppInstalledOnDevice as checkAppInstalled,
    onDeviceStatusChange,
    sendTodayWorkout,
    TodayWorkoutForGarmin,
    PaceZone,
} from '../services/garminConnect';
import { useTrainingStore, type ScheduleDay } from '../stores/trainingStore';
import { useAuthStore } from '../stores/authStore';
import * as Storage from '../utils/storage';

// ---------------------------------------------------------------------------
// useGarmin — estado para UI
// ---------------------------------------------------------------------------

export interface UseGarminResult {
    isInitialized: boolean;
    device: GarminDevice | null;
    isAppInstalledOnWatch: boolean | null;
    /** Re-checa app instalado no relógio (após usuário voltar da loja CIQ). */
    refreshAppInstalled: () => Promise<void>;
}

export function useGarmin(): UseGarminResult {
    const [isInitialized, setInitialized] = useState(false);
    const [device, setDevice] = useState<GarminDevice | null>(null);
    const [isAppInstalledOnWatch, setIsAppInstalledOnWatch] = useState<boolean | null>(null);

    useEffect(() => {
        if (Platform.OS === 'web') return;

        let cancelled = false;
        (async () => {
            try {
                await initGarmin();
                if (cancelled) return;
                setInitialized(true);

                const dev = await getConnectedDevice();
                if (cancelled) return;
                setDevice(dev);

                if (dev) {
                    const installed = await checkAppInstalled(dev.id);
                    if (!cancelled) setIsAppInstalledOnWatch(installed);
                }
            } catch (e) {
                console.warn('[useGarmin] init failed:', e);
            }
        })();

        const unsub = onDeviceStatusChange((d) => {
            setDevice((prev) => {
                // Mesma id: atualiza status; nova id: substitui.
                if (prev && prev.id === d.id) return { ...prev, ...d };
                return d.status === 'connected' ? d : prev;
            });
        });

        return () => {
            cancelled = true;
            unsub();
        };
    }, []);

    const refreshAppInstalled = async () => {
        if (!device) return;
        try {
            const installed = await checkAppInstalled(device.id);
            setIsAppInstalledOnWatch(installed);
        } catch (e) {
            console.warn('[useGarmin] refreshAppInstalled failed:', e);
        }
    };

    return { isInitialized, device, isAppInstalledOnWatch, refreshAppInstalled };
}

// ---------------------------------------------------------------------------
// useGarminSync — push automático do treino do dia
// ---------------------------------------------------------------------------

function mapWorkoutType(t: string | undefined | null): TodayWorkoutForGarmin['type'] {
    switch (t) {
        case 'long_run':       return 'longao';
        case 'intervals':
        case 'tempo':
        case 'progressive':    return 'intervalado';
        case 'fartlek':        return 'tiros';
        case 'recovery':
        case 'easy_run':
        default:               return 'rodagem';
    }
}

function formatTargetPace(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}/km`;
}

/**
 * Deriva as 5 zonas Z1-Z5 a partir do pace alvo do treino. Convenção simples:
 *   Z5 = target - 60s (corrida forte)
 *   Z4 = target - 30s
 *   Z3 = target (treino)
 *   Z2 = target + 30s
 *   Z1 = target + 60s (recuperação)
 *
 * Cada zona tem ±10s de tolerância.
 */
function deriveZones(targetSecondsPerKm: number | null | undefined): TodayWorkoutForGarmin['zones'] {
    if (!targetSecondsPerKm || targetSecondsPerKm <= 0) return undefined;
    const z = (offset: number): PaceZone => ({
        min: Math.max(targetSecondsPerKm + offset - 10, 60),
        max: Math.max(targetSecondsPerKm + offset + 10, 70),
    });
    return {
        z5: z(-60),
        z4: z(-30),
        z3: z(0),
        z2: z(30),
        z1: z(60),
    };
}

function buildTodayWorkoutForGarmin(today: ScheduleDay | null): TodayWorkoutForGarmin | null {
    if (!today || today.type !== 'workout' || !today.workout) return null;
    const w = today.workout;
    const distanceKm = typeof w.distance_km === 'number' ? w.distance_km : 0;
    const targetPace = formatTargetPace(w.target_pace_seconds);

    const titleByType: Record<string, string> = {
        long_run: 'Longão',
        intervals: 'Treino Intervalado',
        tempo: 'Treino Tempo',
        fartlek: 'Fartlek',
        recovery: 'Corrida de Recuperação',
        progressive: 'Progressivo',
        easy_run: 'Rodagem Leve',
    };
    const title = w.title?.trim() || titleByType[w.type] || 'Rodagem Leve';
    const status: TodayWorkoutForGarmin['status'] =
        today.status === 'completed' ? 'completed' : 'pending';

    return {
        id: w.id,
        type: mapWorkoutType(w.type),
        title: `${title} - ${distanceKm.toFixed(0)}km`,
        distanceKm,
        targetPace,
        instructions: w.objective?.trim() || '',
        targetDurationSeconds: w.target_duration_seconds ?? null,
        zones: deriveZones(w.target_pace_seconds),
        status,
    };
}

/**
 * Push automático do treino do dia para o relógio Garmin quando:
 *   1. Há dispositivo Garmin conectado
 *   2. Existe treino do dia
 *   3. O conteúdo mudou desde o último push (evita spam)
 *
 * Use uma vez no App.tsx via <GarminSyncManager />.
 */
export function useGarminSync(): void {
    const { device } = useGarmin();
    const today = useTrainingStore((s) => s.today);
    const user = useAuthStore((s) => s.user);
    const lastSentRef = useRef<string | null>(null);

    useEffect(() => {
        if (Platform.OS === 'web') return;
        if (!device || device.status !== 'connected') return;
        if (!user) return;

        const workout = buildTodayWorkoutForGarmin(today);
        if (!workout) return;

        const cacheKey = JSON.stringify({ deviceId: device.id, workout });
        if (lastSentRef.current === cacheKey) return;
        lastSentRef.current = cacheKey;

        (async () => {
            try {
                const token = (await Storage.getItemAsync('access_token')) || '';
                await sendTodayWorkout(device, workout, token);
                console.log('[useGarminSync] pushed to Garmin:', {
                    deviceId: device.id,
                    workoutId: workout.id,
                    status: workout.status,
                });
            } catch (e) {
                console.warn('[useGarminSync] sendTodayWorkout failed:', e);
                lastSentRef.current = null; // permite retry
            }
        })();
    }, [device, today, user]);
}
