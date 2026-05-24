/**
 * Listener global de conexão de rede que dispara o retry das filas locais
 * de workouts pendentes (`pending-workouts` e `pending-free-runs` MMKV) assim
 * que o app detecta que a rede voltou a estar ativa.
 *
 * Fluxo:
 *   1. NetInfo.addEventListener observa mudanças de conectividade.
 *   2. Quando passa de offline → online (ou de "isConnected=false" → true) E
 *      `isInternetReachable` é true (ou null em iOS quando indeterminado),
 *      disparamos `retryPendingWorkouts()` + `retryPendingFreeRuns()` no
 *      trainingStore.
 *   3. Debounce de 1.5s pra evitar disparos repetidos quando a rede oscila
 *      entre WiFi / 4G durante a reconexão.
 *
 * Uso: chame `useNetworkRetry()` uma vez no `App.tsx` via um manager (segue
 * o mesmo padrão de `<WatchSyncManager />` e `<GarminSyncManager />`).
 */

import { useEffect, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

import { useTrainingStore } from '../stores/trainingStore';

const RETRY_DEBOUNCE_MS = 1_500;

function isOnline(state: NetInfoState): boolean {
    if (state.isConnected !== true) return false;
    // No iOS, isInternetReachable pode vir null no boot — tratamos null como
    // "provavelmente conectado" pra não bloquear retry.
    return state.isInternetReachable !== false;
}

export function useNetworkRetry(): void {
    const lastOnlineRef = useRef<boolean | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const triggerRetry = () => {
            const store = useTrainingStore.getState();
            console.log('[useNetworkRetry] Rede online — disparando retry de pendentes');
            void store.retryPendingWorkouts();
            void store.retryPendingFreeRuns();
        };

        const unsubscribe = NetInfo.addEventListener((state) => {
            const online = isOnline(state);
            const wasOnline = lastOnlineRef.current;
            lastOnlineRef.current = online;

            // Só dispara retry quando muda de offline → online (ou no primeiro
            // tick após o app subir conectado, pra varrer pendentes acumulados
            // de sessões anteriores).
            const shouldRetry =
                online && (wasOnline === false || wasOnline === null);

            if (!shouldRetry) return;

            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(triggerRetry, RETRY_DEBOUNCE_MS);
        });

        return () => {
            unsubscribe();
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);
}
