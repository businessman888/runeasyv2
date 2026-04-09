/**
 * Thin selector hook over the healthKitStore.
 *
 * Components should use this instead of reaching into the store directly —
 * it keeps subscriptions narrow and gives us a single place to expose the
 * public API surface for HealthKit.
 */

import { useHealthKitStore } from '../stores/healthKitStore';

export function useHealthKit() {
    const isAvailable = useHealthKitStore((s) => s.isAvailable);
    const isConnected = useHealthKitStore((s) => s.isConnected);
    const isConnecting = useHealthKitStore((s) => s.isConnecting);
    const isSyncing = useHealthKitStore((s) => s.isSyncing);
    const lastSyncedAt = useHealthKitStore((s) => s.lastSyncedAt);
    const lastSyncedCount = useHealthKitStore((s) => s.lastSyncedCount);
    const error = useHealthKitStore((s) => s.error);

    const connect = useHealthKitStore((s) => s.connect);
    const disconnect = useHealthKitStore((s) => s.disconnect);
    const syncRecentIfConnected = useHealthKitStore((s) => s.syncRecentIfConnected);
    const initialize = useHealthKitStore((s) => s.initialize);
    const loadConnectionStatus = useHealthKitStore((s) => s.loadConnectionStatus);
    const clearLastSyncedCount = useHealthKitStore((s) => s.clearLastSyncedCount);

    return {
        isAvailable,
        isConnected,
        isConnecting,
        isSyncing,
        lastSyncedAt,
        lastSyncedCount,
        error,
        connect,
        disconnect,
        syncRecentIfConnected,
        initialize,
        loadConnectionStatus,
        clearLastSyncedCount,
    };
}
