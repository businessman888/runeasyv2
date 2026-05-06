/**
 * Sincroniza o treino do dia + nome do usuário do iPhone para o Apple Watch.
 *
 * Subscreve trainingStore.nextWorkout + authStore.user. Sempre que mudam,
 * envia para o Watch via WatchConnectivity (`updateApplicationContext`),
 * que entrega de forma durável mesmo se o Watch não estiver alcançável agora.
 *
 * Use uma vez no App.tsx.
 */

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useTrainingStore } from '../stores/trainingStore';
import { useAuthStore, getDisplayName } from '../stores/authStore';
import { useAppleWatchStore } from '../stores/appleWatchStore';
import type { TodayWorkoutForWatch } from '../services/appleWatch';

/**
 * Mapeia o tipo de workout do iPhone para o enum mais simples do Watch
 * (que corresponde aos labels visíveis na StartView do relógio).
 */
function mapWorkoutType(t: string | undefined): TodayWorkoutForWatch['type'] {
    switch (t) {
        case 'long_run':
            return 'longao';
        case 'intervals':
        case 'tempo':
        case 'progressive':
            return 'intervalado';
        case 'fartlek':
            return 'tiros';
        case 'recovery':
        case 'easy_run':
        default:
            return 'rodagem';
    }
}

function formatTargetPace(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildWatchPayload(
    workout: ReturnType<typeof useTrainingStore.getState>['nextWorkout'],
): TodayWorkoutForWatch | null {
    if (!workout) return null;
    // Free runs do iPhone não devem ser pushados como treino do dia no Watch.
    // O usuário no Watch sempre pode tocar "Corrida Livre" se não houver plan workout.
    if (workout.source === 'free') return null;

    const distanceKm = typeof workout.distance_km === 'number' ? workout.distance_km : 0;
    const targetPace = formatTargetPace(workout.target_pace_seconds);
    const title =
        workout.title?.trim() ||
        (workout.type === 'long_run' ? 'Longão'
            : workout.type === 'intervals' ? 'Treino Intervalado'
            : workout.type === 'tempo' ? 'Treino Tempo'
            : workout.type === 'fartlek' ? 'Fartlek'
            : workout.type === 'recovery' ? 'Corrida de Recuperação'
            : workout.type === 'progressive' ? 'Progressivo'
            : 'Rodagem Leve');
    const instructions = workout.objective?.trim() || '';

    return {
        id: workout.id,
        type: mapWorkoutType(workout.type),
        title,
        distanceKm,
        targetPace,
        instructions,
    };
}

export function useWatchSync() {
    const nextWorkout = useTrainingStore((s) => s.nextWorkout);
    const user = useAuthStore((s) => s.user);
    const sendTodayWorkoutToWatch = useAppleWatchStore((s) => s.sendTodayWorkoutToWatch);
    const isPaired = useAppleWatchStore((s) => s.isPaired);

    // Cache do último JSON enviado pra evitar push desnecessário (debounce simples)
    const lastSentRef = useRef<string | null>(null);

    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        if (!isPaired) return;

        const userName = getDisplayName(user) || 'Atleta';
        const payload = buildWatchPayload(nextWorkout);
        const cacheKey = JSON.stringify({ payload, userName });

        if (lastSentRef.current === cacheKey) return; // sem mudança — pula
        lastSentRef.current = cacheKey;

        sendTodayWorkoutToWatch(payload, userName);
        console.log('[useWatchSync] pushed to watch:', {
            userName,
            workoutId: payload?.id ?? null,
            workoutTitle: payload?.title ?? null,
        });
    }, [nextWorkout, user, isPaired, sendTodayWorkoutToWatch]);
}
