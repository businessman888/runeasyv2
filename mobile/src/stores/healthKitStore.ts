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
import { HealthKitManager } from '../services/healthkit';
import * as devicesService from '../services/devices';
import * as Storage from '../utils/storage';

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

export const useHealthKitStore = create<HealthKitState>((set, get) => ({
    isAvailable: false,
    isConnected: false,
    isConnecting: false,
    isSyncing: false,
    lastSyncedAt: null,
    lastSyncedCount: 0,
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

    /** Fetch connected_devices list and set isConnected if apple_health row exists. */
    async loadConnectionStatus() {
        try {
            const devices = await devicesService.listDevices();
            const connected = devices.some((d) => d.provider === APPLE_HEALTH_PROVIDER);
            set({ isConnected: connected });
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

            const { granted } = await HealthKitManager.requestPermissions();
            if (!granted) {
                set({ isConnecting: false });
                return {
                    success: false,
                    error: 'Permissão negada. Abra Ajustes para habilitar.',
                    needsSettings: true,
                };
            }

            // Register on backend so the device shows up in connected devices list
            const userId = await Storage.getItemAsync('user_id');
            if (!userId) {
                set({ isConnecting: false });
                return { success: false, error: 'Usuário não autenticado' };
            }

            const response = await fetch(`${BASE_API_URL}/devices/connect`, {
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
            error: null,
        });
    },

    /**
     * Foreground sync entry point. Called from HomeScreen useFocusEffect and
     * after the user connects. Cheap no-op if not iOS or not connected.
     */
    async syncRecentIfConnected(days = 7) {
        if (Platform.OS !== 'ios') return;

        const { isConnected, isSyncing } = get();
        if (!isConnected || isSyncing) return;

        set({ isSyncing: true, error: null });

        try {
            const activities = await HealthKitManager.fetchRecentRuns(days);
            const result = await HealthKitManager.syncToBackend(activities);

            set({
                isSyncing: false,
                lastSyncedAt: HealthKitManager.getLastSyncedAt(),
                lastSyncedCount: result.inserted,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Erro desconhecido';
            console.warn('[healthKitStore] syncRecentIfConnected failed:', e);
            set({ isSyncing: false, error: message });
        }
    },

    clearLastSyncedCount() {
        set({ lastSyncedCount: 0 });
    },
}));
