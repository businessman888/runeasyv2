/**
 * Thin selector hook over the healthConnectStore.
 *
 * Components should use this instead of reaching into the store directly —
 * it keeps subscriptions narrow and gives us a single place to expose the
 * public API surface for Health Connect (Android).
 */

import { useHealthConnectStore } from '../stores/healthConnectStore';

export function useHealthConnect() {
    const isAvailable = useHealthConnectStore((s) => s.isAvailable);
    const needsInstall = useHealthConnectStore((s) => s.needsInstall);
    const isConnected = useHealthConnectStore((s) => s.isConnected);
    const isConnecting = useHealthConnectStore((s) => s.isConnecting);
    const isSyncing = useHealthConnectStore((s) => s.isSyncing);
    const lastSyncedAt = useHealthConnectStore((s) => s.lastSyncedAt);
    const lastSyncedCount = useHealthConnectStore((s) => s.lastSyncedCount);
    const error = useHealthConnectStore((s) => s.error);

    const connect = useHealthConnectStore((s) => s.connect);
    const disconnect = useHealthConnectStore((s) => s.disconnect);
    const syncRecentIfConnected = useHealthConnectStore((s) => s.syncRecentIfConnected);
    const initialize = useHealthConnectStore((s) => s.initialize);
    const loadConnectionStatus = useHealthConnectStore((s) => s.loadConnectionStatus);
    const openHealthConnectSettings = useHealthConnectStore((s) => s.openHealthConnectSettings);
    const openPlayStore = useHealthConnectStore((s) => s.openPlayStore);
    const clearLastSyncedCount = useHealthConnectStore((s) => s.clearLastSyncedCount);

    return {
        isAvailable,
        needsInstall,
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
        openHealthConnectSettings,
        openPlayStore,
        clearLastSyncedCount,
    };
}
