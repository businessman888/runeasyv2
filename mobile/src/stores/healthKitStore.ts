/**
 * Zustand store for Apple HealthKit integration state.
 *
 * Wraps `HealthKitManager` and coordinates with the backend `connected_devices`
 * table via the existing /api/devices endpoints.
 *
 * Platform note: all methods are safe on Android (turn into no-ops) so the
 * store can be imported unconditionally from cross-platform screens.
 */

import { Platform } from 'react-native';
import { create } from 'zustand';

import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from '../services/apiClient';
import { HealthKitManager } from '../services/healthkit';
import * as devicesService from '../services/devices';
import * as Storage from '../utils/storage';
import { useFeedbackStore } from './feedbackStore';
import { useGamificationStore } from './gamificationStore';
import { useStatsStore } from './statsStore';
import { useTrainingStore } from './trainingStore';
import { useWellnessStore } from './wellnessStore';

interface HealthKitState {
    // Capability
    isAvailable: boolean;

    // Backend/user connection state
    isConnected: boolean;
    isConnecting: boolean;

    // Sync state
    isSyncing: boolean;
    lastSyncedAt: string | null;
    lastSyncedCount: number;
    /** Leitura real: `empty` também pode significar permissão negada por privacidade do iOS. */
    lastReadState: 'notAttempted' | 'readable' | 'empty' | 'error';
    /**
     * Por que a última tentativa de sync não rodou. `notConnected` é o caso
     * silencioso que fazia treinos do app nativo do Apple Watch nunca
     * aparecerem: `syncRecentIfConnected` retornava sem log, sem erro e sem UI
     * quando o usuário nunca conectou o Apple Health. Ver AUDITORIA §P4.
     */
    lastSyncSkipReason: 'notConnected' | 'notAvailable' | null;

    // Errors
    error: string | null;

    // Actions
    initialize(): Promise<void>;
    loadConnectionStatus(): Promise<void>;
    connect(): Promise<{ success: boolean; error?: string; needsSettings?: boolean }>;
    disconnect(): Promise<void>;
    syncRecentIfConnected(days?: number): Promise<void>;
    clearLastSyncedCount(): void;
}

const APPLE_HEALTH_PROVIDER = 'apple_health';

async function refreshActivityConsumers(): Promise<void> {
    const end = new Date();
    end.setDate(end.getDate() + 1);
    const start = new Date();
    start.setDate(start.getDate() - 31);
    const toDate = (date: Date) => date.toISOString().slice(0, 10);

    const training = useTrainingStore.getState();
    const gamification = useGamificationStore.getState();
    const feedback = useFeedbackStore.getState();
    const stats = useStatsStore.getState();
    const wellness = useWellnessStore.getState();
    wellness.reset();

    const results = await Promise.allSettled([
        training.fetchWorkouts(toDate(start), toDate(end)),
        training.fetchUpcomingWorkouts(),
        training.fetchPlanOverview(),
        gamification.fetchStats(),
        gamification.fetchBadges(),
        feedback.fetchWorkoutHistory(),
        feedback.fetchLatestActivity('activity'),
        stats.fetchAllStats(),
        wellness.fetchSummary(true),
    ]);

    const rejected = results.filter((result) => result.status === 'rejected').length;
    if (rejected > 0) {
        console.warn(`[healthKitStore] ${rejected} atualização(ões) pós-importação falharam`);
    }
}

export const useHealthKitStore = create<HealthKitState>((set, get) => ({
    isAvailable: false,
    isConnected: false,
    isConnecting: false,
    isSyncing: false,
    lastSyncedAt: null,
    lastSyncedCount: 0,
    lastReadState: 'notAttempted',
    lastSyncSkipReason: null,
    error: null,

    /** One-shot bootstrap — call once from AppNavigator / HomeScreen mount. */
    async initialize() {
        if (Platform.OS !== 'ios') {
            set({ isAvailable: false, isConnected: false });
            return;
        }

        try {
            const available = await HealthKitManager.isAvailable();
            set({
                isAvailable: available,
                lastSyncedAt: HealthKitManager.getLastSyncedAt(),
            });

            if (available) {
                await get().loadConnectionStatus();
            }
        } catch (e) {
            console.warn('[healthKitStore] initialize failed:', e);
            set({ isAvailable: false });
        }
    },

    /**
     * Connected means the backend row exists and the iOS authorization flow
     * was completed. HealthKit does not reveal whether read access was granted;
     * `lastReadState` records the observable result of the real query.
     */
    async loadConnectionStatus() {
        try {
            const [devices, authorizationDecided] = await Promise.all([
                devicesService.listDevices(),
                HealthKitManager.hasAuthorizationDecision(),
            ]);
            const backendConnected = devices.some((d) => d.provider === APPLE_HEALTH_PROVIDER);
            set({ isConnected: backendConnected && authorizationDecided });
        } catch (e) {
            console.warn('[healthKitStore] loadConnectionStatus failed:', e);
            // Don't flip isConnected on transient errors — keep previous state.
        }
    },

    /**
     * Full connect flow:
     * 1. availability check
     * 2. native permission prompt
     * 3. register device on backend
     * 4. enable background delivery
     * 5. initial 30-day sync
     */
    async connect() {
        if (Platform.OS !== 'ios') {
            return { success: false, error: 'Apple Health só está disponível no iOS' };
        }

        set({ isConnecting: true, error: null });

        try {
            const available = await HealthKitManager.isAvailable();
            if (!available) {
                set({ isConnecting: false, isAvailable: false });
                return {
                    success: false,
                    error: 'HealthKit indisponível neste dispositivo',
                };
            }

            const { completed } = await HealthKitManager.requestPermissions();
            if (!completed) {
                set({ isConnecting: false });
                return {
                    success: false,
                    error: 'A autorização do Apple Health não foi concluída.',
                    needsSettings: true,
                };
            }

            // Register on backend so the device shows up in connected devices list
            const userId = await Storage.getItemAsync('user_id');
            if (!userId) {
                set({ isConnecting: false });
                return { success: false, error: 'Usuário não autenticado' };
            }

            const response = await authedFetch(`${BASE_API_URL}/devices/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify({
                    provider: APPLE_HEALTH_PROVIDER,
                    device_name: 'Apple Health',
                }),
            });

            if (!response.ok) {
                const txt = await response.text().catch(() => '');
                throw new Error(`Falha ao registrar dispositivo: HTTP ${response.status} ${txt}`);
            }

            set({ isConnected: true, isConnecting: false });

            // Fire-and-forget background sync enable
            HealthKitManager.enableBackgroundSync().catch(() => undefined);

            // Kick off first sync (30 days) without blocking the UI on errors
            get()
                .syncRecentIfConnected(30)
                .catch((e) => console.warn('[healthKitStore] initial sync failed:', e));

            return { success: true };
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Erro desconhecido';
            console.error('[healthKitStore] connect failed:', e);
            set({ isConnecting: false, error: message });
            return { success: false, error: message };
        }
    },

    async disconnect() {
        if (Platform.OS !== 'ios') return;

        try {
            await devicesService.disconnectDevice(APPLE_HEALTH_PROVIDER);
        } catch (e) {
            console.warn('[healthKitStore] backend disconnect failed:', e);
            // Proceed anyway — we still want to stop local syncs.
        }

        try {
            await HealthKitManager.disableBackgroundSync();
        } catch {
            /* ignore */
        }

        HealthKitManager.resetLocalState();
        HealthKitManager.clearPermissionsCache();

        set({
            isConnected: false,
            lastSyncedAt: null,
            lastSyncedCount: 0,
            lastReadState: 'notAttempted',
            error: null,
        });
    },

    /**
     * Foreground sync entry point. Called from HomeScreen useFocusEffect and
     * after the user connects. Cheap no-op if not iOS or not connected.
     */
    async syncRecentIfConnected(days = 7) {
        if (Platform.OS !== 'ios') return;

        const { isConnected, isSyncing, isAvailable } = get();
        if (isSyncing) return;

        // Registrar o motivo em vez de sair calado: era exatamente esta saída
        // silenciosa que fazia o usuário concluir que o app "não importa"
        // treinos do Apple Watch, quando na verdade a sync nunca rodou.
        if (!isConnected) {
            const reason = isAvailable ? 'notConnected' : 'notAvailable';
            if (get().lastSyncSkipReason !== reason) {
                console.log(`[healthKitStore] sync pulada — ${reason}`);
            }
            set({ lastSyncSkipReason: reason });
            return;
        }

        set({ isSyncing: true, error: null, lastSyncSkipReason: null });

        try {
            const activities = await HealthKitManager.fetchRecentRuns(days);
            const result = await HealthKitManager.syncToBackend(activities);

            console.log(
                `[healthKitStore] sync: ${activities.length} corrida(s) lida(s), ${result.inserted} nova(s)`,
            );

            set({
                isSyncing: false,
                lastSyncedAt: HealthKitManager.getLastSyncedAt(),
                lastSyncedCount: result.inserted,
                lastReadState: activities.length > 0 ? 'readable' : 'empty',
            });

            if (result.inserted > 0) {
                await refreshActivityConsumers();
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Erro desconhecido';
            console.warn('[healthKitStore] syncRecentIfConnected failed:', e);
            set({ isSyncing: false, error: message, lastReadState: 'error' });
        }
    },

    clearLastSyncedCount() {
        set({ lastSyncedCount: 0 });
    },
}));
