/**
 * Google Health Connect integration layer (Android only).
 *
 * Mirrors the architecture of `healthkit.ts` for iOS:
 *  - Check Health Connect availability on the device
 *  - Request read permissions for ExerciseSession + supporting metrics
 *  - Query recent running workouts (RUNNING and RUNNING_TREADMILL),
 *    enriched with heart-rate samples and ExerciseRoute GPS
 *  - Normalize data into the shape expected by the backend
 *    (POST /api/devices/health-connect/sync)
 *  - Local idempotency cache of already-synced record ids (MMKV)
 *  - Offline fallback queue for failed syncs (MMKV)
 *
 * The backend is the source of truth for cross-device deduplication — this
 * service only avoids re-sending records the backend has already confirmed.
 */

import { Linking, Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { BASE_API_URL } from '../config/api.config';
import * as Storage from '../utils/storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HealthConnectGpsPoint {
    lat: number;
    lng: number;
    altitude?: number;
    timestamp: number; // epoch ms
}

export interface NormalizedHealthConnectActivity {
    external_id: string;            // ExerciseSessionRecord.metadata.id (backend adds 'hc_' prefix)
    start_date: string;             // ISO
    end_date: string;               // ISO
    duration_seconds: number;
    distance_meters: number;
    energy_burned_kcal?: number;
    average_heartrate?: number;
    max_heartrate?: number;
    exercise_type: 'RUNNING' | 'RUNNING_OUTDOOR' | 'RUNNING_TREADMILL';
    source_name?: string;
    gps_route?: HealthConnectGpsPoint[];
}

export interface SyncResult {
    inserted: number;
    skipped: number;
    errors: number;
    queuedOffline: number;
}

// ─── MMKV (persistent caches) ────────────────────────────────────────────────

const syncedIdsStorage = createMMKV({ id: 'hc-synced-ids' });
const pendingStorage = createMMKV({ id: 'hc-pending-sync' });
const metadataStorage = createMMKV({ id: 'hc-metadata' });

const SYNCED_IDS_KEY = 'synced_ids';
const PENDING_KEY = 'pending_list';
const PERMISSION_GRANTED_KEY = 'permission_granted';
const LAST_SYNCED_AT_KEY = 'last_synced_at';

function loadSyncedIds(): Set<string> {
    try {
        const raw = syncedIdsStorage.getString(SYNCED_IDS_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

function saveSyncedIds(ids: Set<string>) {
    try {
        syncedIdsStorage.set(SYNCED_IDS_KEY, JSON.stringify(Array.from(ids)));
    } catch (e) {
        console.error('[HealthConnect] Failed to persist synced ids:', e);
    }
}

function getPending(): NormalizedHealthConnectActivity[] {
    try {
        const raw = pendingStorage.getString(PENDING_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function setPending(list: NormalizedHealthConnectActivity[]) {
    try {
        pendingStorage.set(PENDING_KEY, JSON.stringify(list));
    } catch (e) {
        console.error('[HealthConnect] Failed to persist pending queue:', e);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Health Connect ExerciseType ints (from react-native-health-connect/constants):
//   RUNNING = 56, RUNNING_TREADMILL = 57. Everything else is filtered out.
const EXERCISE_TYPE_RUNNING = 56;
const EXERCISE_TYPE_RUNNING_TREADMILL = 57;

function mapExerciseTypeNumberToString(
    n: number,
): 'RUNNING' | 'RUNNING_TREADMILL' | null {
    if (n === EXERCISE_TYPE_RUNNING) return 'RUNNING';
    if (n === EXERCISE_TYPE_RUNNING_TREADMILL) return 'RUNNING_TREADMILL';
    return null;
}

/** Convert a HealthConnect `Length` quantity into meters. */
function lengthToMeters(len: unknown): number {
    if (!len || typeof len !== 'object') return 0;
    const l = len as { value?: number; unit?: string };
    if (typeof l.value !== 'number') return 0;
    switch (l.unit) {
        case 'kilometers': return l.value * 1000;
        case 'miles': return l.value * 1609.344;
        case 'inches': return l.value * 0.0254;
        case 'feet': return l.value * 0.3048;
        case 'meters':
        default: return l.value;
    }
}

/** Convert a HealthConnect `Energy` quantity into kilocalories. */
function energyToKcal(en: unknown): number | undefined {
    if (!en || typeof en !== 'object') return undefined;
    const e = en as { value?: number; unit?: string };
    if (typeof e.value !== 'number') return undefined;
    switch (e.unit) {
        case 'calories': return e.value / 1000;
        case 'joules': return e.value / 4184;
        case 'kilojoules': return e.value / 4.184;
        case 'kilocalories':
        default: return e.value;
    }
}

// ─── Manager ─────────────────────────────────────────────────────────────────

class HealthConnectManagerClass {
    private readonly isAndroid = Platform.OS === 'android';

    /** Is Health Connect installed and reachable on this device? */
    async isAvailable(): Promise<boolean> {
        if (!this.isAndroid) return false;
        try {
            const hc = await import('react-native-health-connect');
            const status = await hc.getSdkStatus();
            // SDK_AVAILABLE = 3
            return status === hc.SdkAvailabilityStatus.SDK_AVAILABLE;
        } catch (e) {
            console.warn('[HealthConnect] isAvailable check failed:', e);
            return false;
        }
    }

    /**
     * Initialize the SDK. Returns true on success, false when Health Connect
     * isn't installed or the SDK couldn't be set up (caller may then prompt
     * the user to install the HC system app from Play Store).
     */
    async initialize(): Promise<boolean> {
        if (!this.isAndroid) return false;
        try {
            const hc = await import('react-native-health-connect');
            return await hc.initialize();
        } catch (e) {
            console.warn('[HealthConnect] initialize failed:', e);
            return false;
        }
    }

    /**
     * Request read permissions for the metrics RunEasy uses. Health Connect
     * returns the list of *actually granted* permissions — we check that the
     * essentials are present before considering the user "connected".
     */
    async requestPermissions(): Promise<{ granted: boolean }> {
        if (!this.isAndroid) return { granted: false };

        try {
            const hc = await import('react-native-health-connect');

            const granted = await hc.requestPermission([
                { accessType: 'read', recordType: 'ExerciseSession' },
                { accessType: 'read', recordType: 'HeartRate' },
                { accessType: 'read', recordType: 'Distance' },
                { accessType: 'read', recordType: 'TotalCaloriesBurned' },
            ]);

            // Defense: the user can dismiss specific scopes — require the
            // bare minimum (ExerciseSession) before flagging as connected.
            const hasExercise = granted.some(
                (p) =>
                    'recordType' in p &&
                    p.recordType === 'ExerciseSession' &&
                    p.accessType === 'read',
            );

            if (hasExercise) metadataStorage.set(PERMISSION_GRANTED_KEY, true);

            return { granted: hasExercise };
        } catch (e) {
            console.error('[HealthConnect] requestPermissions failed:', e);
            return { granted: false };
        }
    }

    /**
     * Best-effort check whether the user has previously authorized us.
     * Used to decide whether foreground sync should run without prompting.
     */
    hasPermissionsCached(): boolean {
        return metadataStorage.getBoolean(PERMISSION_GRANTED_KEY) ?? false;
    }

    /**
     * Verify with the OS that the cached permission is still effective —
     * the user can revoke it from Health Connect settings at any time.
     */
    async hasGrantedPermissions(): Promise<boolean> {
        if (!this.isAndroid) return false;
        try {
            const hc = await import('react-native-health-connect');
            const granted = await hc.getGrantedPermissions();
            return granted.some(
                (p) =>
                    'recordType' in p &&
                    p.recordType === 'ExerciseSession' &&
                    p.accessType === 'read',
            );
        } catch (e) {
            console.warn('[HealthConnect] getGrantedPermissions failed:', e);
            return false;
        }
    }

    /** Open the Health Connect settings so the user can adjust manually. */
    openHealthConnectSettings() {
        if (!this.isAndroid) return;
        import('react-native-health-connect')
            .then((hc) => hc.openHealthConnectSettings())
            .catch(() => {
                /* swallow */
            });
    }

    /** Open the Play Store entry for Health Connect (used when missing). */
    openPlayStoreForHealthConnect() {
        const market = 'market://details?id=com.google.android.apps.healthdata';
        const web =
            'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';
        Linking.openURL(market).catch(() => {
            Linking.openURL(web).catch(() => {
                /* swallow */
            });
        });
    }

    /**
     * Fetch running ExerciseSessionRecord rows from the last N days, enriched
     * with HR (aggregated from HeartRate samples in the same window) and the
     * GPS route when present. Returns pre-normalized objects ready to POST.
     */
    async fetchRecentRuns(
        days = 7,
    ): Promise<NormalizedHealthConnectActivity[]> {
        if (!this.isAndroid) return [];

        try {
            const hc = await import('react-native-health-connect');

            const now = new Date();
            const from = new Date(now.getTime() - days * 24 * 3600 * 1000);

            const { records } = await hc.readRecords('ExerciseSession', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: from.toISOString(),
                    endTime: now.toISOString(),
                },
                ascendingOrder: false,
            });

            const results: NormalizedHealthConnectActivity[] = [];

            for (const rec of records) {
                const exerciseType = mapExerciseTypeNumberToString(
                    rec.exerciseType,
                );
                if (!exerciseType) continue;

                const startMs = new Date(rec.startTime).getTime();
                const endMs = new Date(rec.endTime).getTime();
                const durationSec = Math.max(0, (endMs - startMs) / 1000);

                // Distance + calories are independent records linked by time
                // window; fetch in parallel to minimize latency.
                const [distanceMeters, calories, hr] = await Promise.all([
                    this.aggregateDistanceMeters(hc, rec.startTime, rec.endTime),
                    this.aggregateCaloriesKcal(hc, rec.startTime, rec.endTime),
                    this.aggregateHeartRate(hc, rec.startTime, rec.endTime),
                ]);

                // ExerciseRoute may be embedded on the record (Samsung Health
                // often does this) or absent (treadmill, manual entries).
                // Never throw if it's missing — that's the common case.
                const gpsRoute = this.routeToGpsPoints(rec.exerciseRoute);

                results.push({
                    external_id: rec.metadata?.id ?? `${rec.startTime}-${rec.endTime}`,
                    start_date: rec.startTime,
                    end_date: rec.endTime,
                    duration_seconds: durationSec,
                    distance_meters: distanceMeters,
                    energy_burned_kcal: calories,
                    average_heartrate: hr?.average,
                    max_heartrate: hr?.max,
                    exercise_type: exerciseType,
                    source_name: rec.metadata?.dataOrigin,
                    gps_route: gpsRoute,
                });
            }

            return results;
        } catch (e) {
            console.error('[HealthConnect] fetchRecentRuns failed:', e);
            return [];
        }
    }

    private async aggregateDistanceMeters(
        hc: typeof import('react-native-health-connect'),
        startTime: string,
        endTime: string,
    ): Promise<number> {
        try {
            const result = await hc.aggregateRecord({
                recordType: 'Distance',
                timeRangeFilter: { operator: 'between', startTime, endTime },
            });
            const dist = (result as { DISTANCE?: unknown })?.DISTANCE;
            return lengthToMeters(dist);
        } catch {
            return 0;
        }
    }

    private async aggregateCaloriesKcal(
        hc: typeof import('react-native-health-connect'),
        startTime: string,
        endTime: string,
    ): Promise<number | undefined> {
        try {
            const result = await hc.aggregateRecord({
                recordType: 'TotalCaloriesBurned',
                timeRangeFilter: { operator: 'between', startTime, endTime },
            });
            const cals = (result as { ENERGY_TOTAL?: unknown })?.ENERGY_TOTAL;
            return energyToKcal(cals);
        } catch {
            return undefined;
        }
    }

    private async aggregateHeartRate(
        hc: typeof import('react-native-health-connect'),
        startTime: string,
        endTime: string,
    ): Promise<{ average: number; max: number } | undefined> {
        try {
            const { records: hrRecords } = await hc.readRecords('HeartRate', {
                timeRangeFilter: { operator: 'between', startTime, endTime },
                ascendingOrder: true,
            });
            if (!hrRecords || hrRecords.length === 0) return undefined;

            let sum = 0;
            let count = 0;
            let max = 0;
            for (const rec of hrRecords) {
                for (const s of rec.samples ?? []) {
                    const bpm = s.beatsPerMinute;
                    if (typeof bpm !== 'number' || bpm <= 0) continue;
                    sum += bpm;
                    count += 1;
                    if (bpm > max) max = bpm;
                }
            }
            if (count === 0) return undefined;
            return { average: sum / count, max };
        } catch {
            return undefined;
        }
    }

    private routeToGpsPoints(
        route?: { route?: Array<{
            time: string;
            latitude: number;
            longitude: number;
            altitude?: { value?: number; unit?: string };
        }> },
    ): HealthConnectGpsPoint[] | undefined {
        if (!route || !route.route || route.route.length === 0) return undefined;
        const points: HealthConnectGpsPoint[] = [];
        for (const loc of route.route) {
            const altMeters = loc.altitude
                ? lengthToMeters(loc.altitude)
                : undefined;
            points.push({
                lat: loc.latitude,
                lng: loc.longitude,
                altitude: altMeters,
                timestamp: new Date(loc.time).getTime(),
            });
        }
        return points.length > 0 ? points : undefined;
    }

    /**
     * Dedup against our local MMKV cache, POST the remaining activities
     * to the backend, and queue failures for retry.
     */
    async syncToBackend(
        activities: NormalizedHealthConnectActivity[],
    ): Promise<SyncResult> {
        const synced = loadSyncedIds();
        const pending = getPending();

        // Local filter: skip what we've already confirmed with the backend
        const fresh = activities.filter((a) => !synced.has(a.external_id));

        // Merge previously-queued offline payloads with new ones (most recent
        // wins) so the next backend call clears the backlog in one shot.
        const pendingMap = new Map(pending.map((p) => [p.external_id, p]));
        for (const a of fresh) {
            pendingMap.set(a.external_id, a);
        }
        const batch = Array.from(pendingMap.values());

        if (batch.length === 0) {
            return { inserted: 0, skipped: 0, errors: 0, queuedOffline: 0 };
        }

        const userId = await Storage.getItemAsync('user_id');
        if (!userId) {
            setPending(batch);
            return { inserted: 0, skipped: 0, errors: 0, queuedOffline: batch.length };
        }

        try {
            const response = await fetch(`${BASE_API_URL}/devices/health-connect/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify({ activities: batch }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const json = (await response.json()) as {
                inserted: number;
                skipped: number;
                errors: number;
                results: Array<{ external_id: string; action: string }>;
            };

            // Mark every accepted record (inserted, dedup-skipped, or
            // dropped-as-non-running) so we don't retry it next time.
            for (const r of json.results || []) {
                if (
                    r.action === 'inserted' ||
                    r.action === 'skipped' ||
                    r.action === 'skipped_crossprovider' ||
                    r.action === 'skipped_non_running'
                ) {
                    synced.add(r.external_id);
                }
            }
            saveSyncedIds(synced);

            // Requeue only the errored items
            const erroredIds = new Set(
                (json.results || []).filter((r) => r.action === 'error').map((r) => r.external_id),
            );
            const requeued = batch.filter((b) => erroredIds.has(b.external_id));
            setPending(requeued);

            metadataStorage.set(LAST_SYNCED_AT_KEY, new Date().toISOString());

            return {
                inserted: json.inserted || 0,
                skipped: json.skipped || 0,
                errors: json.errors || 0,
                queuedOffline: requeued.length,
            };
        } catch (e) {
            console.warn('[HealthConnect] Backend sync failed, queuing offline:', e);
            setPending(batch);
            return {
                inserted: 0,
                skipped: 0,
                errors: 0,
                queuedOffline: batch.length,
            };
        }
    }

    /** Retry anything stuck in the offline queue (no new fetch). */
    async retryPending(): Promise<SyncResult> {
        const pending = getPending();
        if (pending.length === 0) {
            return { inserted: 0, skipped: 0, errors: 0, queuedOffline: 0 };
        }
        return this.syncToBackend([]);
    }

    getLastSyncedAt(): string | null {
        return metadataStorage.getString(LAST_SYNCED_AT_KEY) ?? null;
    }

    /**
     * Wipe ALL Health Connect-related MMKV caches. Called on logout to
     * prevent the next user on the same device from seeing the previous
     * user's idempotency cache (which would cause silent skips) and to
     * drop any pending queue items they didn't own.
     */
    resetLocalState() {
        syncedIdsStorage.remove(SYNCED_IDS_KEY);
        pendingStorage.remove(PENDING_KEY);
        metadataStorage.remove(LAST_SYNCED_AT_KEY);
        metadataStorage.remove(PERMISSION_GRANTED_KEY);
    }
}

export const HealthConnectManager = new HealthConnectManagerClass();
