/**
 * Zustand store for Google Health Connect integration state.
 *
 * Wraps `HealthConnectManager` and coordinates with the backend
 * `connected_devices` table via the existing /api/devices endpoints.
 *
 * Platform note: all methods are safe on iOS (turn into no-ops) so the store
 * can be imported unconditionally from cross-platform screens — mirroring
 * the behaviour of healthKitStore on Android.
 */

import { Platform } from 'react-native';
import { create } from 'zustand';

import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from '../services/apiClient';
import { HealthConnectManager } from '../services/healthConnect';
import * as devicesService from '../services/devices';
import * as Storage from '../utils/storage';
import { useWellnessStore } from './wellnessStore';

interface HealthConnectState {
    // Capability
    isAvailable: boolean;          // Health Connect installed & SDK reachable
    needsInstall: boolean;         // SDK not present — user should install from Play Store

    // Backend/user connection state
    isConnected: boolean;
    isConnecting: boolean;

    // Sync state
    isSyncing: boolean;
    lastSyncedAt: string | null;
    lastSyncedCount: number;

    // Errors
    error: string | null;

    // Actions
    initialize(): Promise<void>;
    loadConnectionStatus(): Promise<void>;
    connect(): Promise<{ success: boolean; error?: string; needsInstall?: boolean; needsSettings?: boolean }>;
    disconnect(): Promise<void>;
    syncRecentIfConnected(days?: number): Promise<void>;
    openHealthConnectSettings(): void;
    openPlayStore(): void;
    clearLastSyncedCount(): void;
}

const HEALTH_CONNECT_PROVIDER = 'health_connect';

export const useHealthConnectStore = create<HealthConnectState>((set, get) => ({
    isAvailable: false,
    needsInstall: false,
    isConnected: false,
    isConnecting: false,
    isSyncing: false,
    lastSyncedAt: null,
    lastSyncedCount: 0,
    error: null,

    /** One-shot bootstrap — call once from HomeScreen mount / AppNavigator. */
    async initialize() {
        if (Platform.OS !== 'android') {
            set({ isAvailable: false, needsInstall: false, isConnected: false });
            return;
        }

        try {
            const available = await HealthConnectManager.isAvailable();
            set({
                isAvailable: available,
                needsInstall: !available,
                lastSyncedAt: HealthConnectManager.getLastSyncedAt(),
            });

            if (available) {
                // SDK init is cheap and idempotent; do it eagerly so subsequent
                // reads don't pay the warm-up cost on the user's tap.
                await HealthConnectManager.initialize();
                await get().loadConnectionStatus();
            }
        } catch (e) {
            console.warn('[healthConnectStore] initialize failed:', e);
            set({ isAvailable: false, needsInstall: true });
        }
    },

    /** Fetch connected_devices list and set isConnected if a health_connect row exists. */
    async loadConnectionStatus() {
        try {
            const devices = await devicesService.listDevices();
            const connectedRow = devices.some(
                (d) => d.provider === HEALTH_CONNECT_PROVIDER,
            );
            // Confirm the OS still grants us read access — the user can revoke
            // from Health Connect settings without notifying the app.
            const stillHasPermission = connectedRow
                ? await HealthConnectManager.hasGrantedPermissions()
                : false;
            set({ isConnected: connectedRow && stillHasPermission });
        } catch (e) {
            console.warn('[healthConnectStore] loadConnectionStatus failed:', e);
            // Don't flip isConnected on transient errors — keep previous state.
        }
    },

    /**
     * Full connect flow:
     * 1. availability check (install prompt if missing)
     * 2. native permission request
     * 3. register device on backend
     * 4. initial 30-day sync
     */
    async connect() {
        if (Platform.OS !== 'android') {
            return { success: false, error: 'Health Connect só está disponível no Android' };
        }

        set({ isConnecting: true, error: null });

        try {
            const available = await HealthConnectManager.isAvailable();
            if (!available) {
                set({ isConnecting: false, isAvailable: false, needsInstall: true });
                return {
                    success: false,
                    error: 'Health Connect não está instalado. Instale pela Play Store.',
                    needsInstall: true,
                };
            }

            const initialized = await HealthConnectManager.initialize();
            if (!initialized) {
                set({ isConnecting: false });
                return {
                    success: false,
                    error: 'Não foi possível inicializar o Health Connect.',
                };
            }

            const { granted } = await HealthConnectManager.requestPermissions();
            if (!granted) {
                set({ isConnecting: false });
                return {
                    success: false,
                    error: 'Permissão negada. Abra Health Connect e habilite o acesso a Exercício.',
                    needsSettings: true,
                };
            }

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
                    provider: HEALTH_CONNECT_PROVIDER,
                    device_name: 'Health Connect',
                }),
            });

            if (!response.ok) {
                const txt = await response.text().catch(() => '');
                throw new Error(`Falha ao registrar dispositivo: HTTP ${response.status} ${txt}`);
            }

            set({ isConnected: true, isConnecting: false });

            // Kick off first sync (30 days) without blocking the UI on errors.
            get()
                .syncRecentIfConnected(30)
                .catch((e) => console.warn('[healthConnectStore] initial sync failed:', e));

            return { success: true };
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Erro desconhecido';
            console.error('[healthConnectStore] connect failed:', e);
            set({ isConnecting: false, error: message });
            return { success: false, error: message };
        }
    },

    async disconnect() {
        if (Platform.OS !== 'android') return;

        try {
            await devicesService.disconnectDevice(HEALTH_CONNECT_PROVIDER);
        } catch (e) {
            console.warn('[healthConnectStore] backend disconnect failed:', e);
            // Proceed anyway — we still want to stop local syncs.
        }

        HealthConnectManager.resetLocalState();

        set({
            isConnected: false,
            lastSyncedAt: null,
            lastSyncedCount: 0,
            error: null,
        });
    },

    /**
     * Foreground sync entry point. Called from HomeScreen useFocusEffect and
     * after the user connects. Cheap no-op if not Android or not connected.
     */
    async syncRecentIfConnected(days = 7) {
        if (Platform.OS !== 'android') return;

        const { isConnected, isSyncing } = get();
        if (!isConnected || isSyncing) return;

        set({ isSyncing: true, error: null });

        try {
            const activities = await HealthConnectManager.fetchRecentRuns(days);
            const result = await HealthConnectManager.syncToBackend(activities);

            set({
                isSyncing: false,
                lastSyncedAt: HealthConnectManager.getLastSyncedAt(),
                lastSyncedCount: result.inserted,
            });

            if (result.inserted > 0) {
                useWellnessStore.getState().reset();
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Erro desconhecido';
            console.warn('[healthConnectStore] syncRecentIfConnected failed:', e);
            set({ isSyncing: false, error: message });
        }
    },

    openHealthConnectSettings() {
        HealthConnectManager.openHealthConnectSettings();
    },

    openPlayStore() {
        HealthConnectManager.openPlayStoreForHealthConnect();
    },

    clearLastSyncedCount() {
        set({ lastSyncedCount: 0 });
    },
}));
