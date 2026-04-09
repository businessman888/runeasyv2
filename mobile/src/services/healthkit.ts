/**
 * HealthKit integration layer (iOS only).
 *
 * Responsibilities:
 *  - Check HealthKit availability on the current device
 *  - Request read permissions for running workouts + metrics
 *  - Query recent running workouts, heart-rate samples, and GPS routes
 *  - Normalize data into the shape expected by the backend
 *    (POST /api/devices/apple-health/sync)
 *  - Local idempotency cache of already-synced UUIDs (MMKV)
 *  - Offline fallback queue for failed syncs (MMKV)
 *
 * The backend is the source of truth for cross-device deduplication — this
 * service only avoids re-sending workouts the backend has already confirmed.
 */

import { Linking, Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { BASE_API_URL } from '../config/api.config';
import * as Storage from '../utils/storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HealthKitGpsPoint {
    lat: number;
    lng: number;
    altitude?: number;
    timestamp: number; // epoch ms
}

export interface NormalizedHealthKitActivity {
    external_id: string; // raw HKWorkout UUID (backend adds "apple_health_" prefix)
    start_date: string; // ISO
    end_date: string; // ISO
    duration_seconds: number;
    distance_meters: number;
    total_energy_burned_kcal?: number;
    average_heartrate?: number;
    max_heartrate?: number;
    source_name?: string;
    gps_route?: HealthKitGpsPoint[];
}

export interface SyncResult {
    inserted: number;
    skipped: number;
    errors: number;
    queuedOffline: number;
}

// ─── MMKV (persistent caches) ────────────────────────────────────────────────

const syncedIdsStorage = createMMKV({ id: 'healthkit-synced-ids' });
const pendingStorage = createMMKV({ id: 'pending-healthkit-sync' });
const metadataStorage = createMMKV({ id: 'healthkit-metadata' });

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
        console.error('[HealthKit] Failed to persist synced ids:', e);
    }
}

function getPending(): NormalizedHealthKitActivity[] {
    try {
        const raw = pendingStorage.getString(PENDING_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function setPending(list: NormalizedHealthKitActivity[]) {
    try {
        pendingStorage.set(PENDING_KEY, JSON.stringify(list));
    } catch (e) {
        console.error('[HealthKit] Failed to persist pending queue:', e);
    }
}

// ─── Manager ─────────────────────────────────────────────────────────────────

class HealthKitManagerClass {
    private readonly isIOS = Platform.OS === 'ios';

    /** Is HealthKit usable on this device? */
    async isAvailable(): Promise<boolean> {
        if (!this.isIOS) return false;
        try {
            const hk = await import('@kingstinct/react-native-healthkit');
            return hk.isHealthDataAvailable();
        } catch (e) {
            console.warn('[HealthKit] isAvailable check failed:', e);
            return false;
        }
    }

    /**
     * Request read permissions. HealthKit never exposes a real "granted"
     * status for read types (Apple privacy rule), so we optimistically flag
     * the permission as granted once the user has passed through the prompt.
     */
    async requestPermissions(): Promise<{ granted: boolean }> {
        if (!this.isIOS) return { granted: false };

        try {
            const hk = await import('@kingstinct/react-native-healthkit');

            const toRead = [
                'HKWorkoutTypeIdentifier',
                'HKWorkoutRouteTypeIdentifier',
                'HKQuantityTypeIdentifierHeartRate',
                'HKQuantityTypeIdentifierDistanceWalkingRunning',
                'HKQuantityTypeIdentifierActiveEnergyBurned',
                'HKQuantityTypeIdentifierStepCount',
                'HKQuantityTypeIdentifierRunningSpeed',
            ] as const;

            await hk.requestAuthorization({
                toRead: toRead as unknown as readonly any[],
                toShare: [],
            });

            metadataStorage.set(PERMISSION_GRANTED_KEY, true);
            return { granted: true };
        } catch (e) {
            console.error('[HealthKit] requestPermissions failed:', e);
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

    clearPermissionsCache() {
        metadataStorage.remove(PERMISSION_GRANTED_KEY);
    }

    /** Open the iOS Health app settings so the user can grant manually. */
    openHealthSettings() {
        Linking.openURL('x-apple-health://').catch(() => {
            Linking.openURL('app-settings:').catch(() => {
                /* swallow */
            });
        });
    }

    /**
     * Fetch running workouts from the last N days, enriched with HR and GPS.
     * Returns pre-normalized objects ready to POST to the backend.
     */
    async fetchRecentRuns(days = 30): Promise<NormalizedHealthKitActivity[]> {
        if (!this.isIOS) return [];

        try {
            const hk = await import('@kingstinct/react-native-healthkit');
            const { WorkoutActivityType } = hk;

            const from = new Date(Date.now() - days * 24 * 3600 * 1000);

            const workouts = await hk.queryWorkoutSamples({
                limit: 0, // all samples in range
                ascending: false,
                filter: {
                    workoutActivityType: WorkoutActivityType.running,
                    date: { startDate: from },
                },
            });

            const results: NormalizedHealthKitActivity[] = [];

            for (const w of workouts) {
                // Extra safety: only HKWorkoutActivityTypeRunning survives.
                if (w.workoutActivityType !== WorkoutActivityType.running) continue;

                const distanceMeters = this.quantityToMeters(w.totalDistance);
                const durationSeconds = this.quantityToSeconds(w.duration);
                const calories = this.quantityToKcal(w.totalEnergyBurned);

                // HR + route are independent, fetch in parallel
                const [hr, gps] = await Promise.all([
                    this.fetchHeartRateForWorkout(w).catch(() => undefined),
                    this.fetchRouteForWorkout(w).catch(() => undefined),
                ]);

                results.push({
                    external_id: w.uuid,
                    start_date: w.startDate.toISOString(),
                    end_date: w.endDate.toISOString(),
                    duration_seconds: durationSeconds,
                    distance_meters: distanceMeters,
                    total_energy_burned_kcal: calories,
                    average_heartrate: hr?.average,
                    max_heartrate: hr?.max,
                    source_name: this.extractSourceName(w),
                    gps_route: gps,
                });
            }

            return results;
        } catch (e) {
            console.error('[HealthKit] fetchRecentRuns failed:', e);
            return [];
        }
    }

    /** Returns average + max BPM over the workout window. */
    private async fetchHeartRateForWorkout(
        workout: any,
    ): Promise<{ average: number; max: number } | undefined> {
        const hk = await import('@kingstinct/react-native-healthkit');
        const samples = await hk.queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
            limit: 0,
            ascending: true,
            unit: 'count/min',
            filter: {
                date: { startDate: workout.startDate, endDate: workout.endDate },
            },
        });

        if (!samples || samples.length === 0) return undefined;

        let sum = 0;
        let max = 0;
        for (const s of samples) {
            const bpm = s.quantity;
            sum += bpm;
            if (bpm > max) max = bpm;
        }
        const average = sum / samples.length;
        return { average, max };
    }

    /** Returns GPS points from the first HKWorkoutRoute attached, if any. */
    private async fetchRouteForWorkout(
        workout: any,
    ): Promise<HealthKitGpsPoint[] | undefined> {
        try {
            const routes = await workout.getWorkoutRoutes();
            if (!routes || routes.length === 0) return undefined;

            const points: HealthKitGpsPoint[] = [];
            for (const route of routes) {
                for (const loc of route.locations) {
                    points.push({
                        lat: loc.latitude,
                        lng: loc.longitude,
                        altitude: typeof loc.altitude === 'number' ? loc.altitude : undefined,
                        timestamp:
                            loc.date instanceof Date ? loc.date.getTime() : Number(loc.date),
                    });
                }
            }
            return points.length > 0 ? points : undefined;
        } catch (e) {
            // Workouts logged without route (e.g., manual entries) throw here.
            return undefined;
        }
    }

    /**
     * Dedup against our local MMKV cache, POST the remaining activities
     * to the backend, and queue failures for retry.
     */
    async syncToBackend(
        activities: NormalizedHealthKitActivity[],
    ): Promise<SyncResult> {
        const synced = loadSyncedIds();
        const pending = getPending();

        // Local filter: skip what we've already confirmed with the backend
        const fresh = activities.filter((a) => !synced.has(a.external_id));

        // Merge in any previously-queued offline payloads
        const pendingMap = new Map(pending.map((p) => [p.external_id, p]));
        for (const a of fresh) {
            pendingMap.set(a.external_id, a); // most recent wins
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
            const response = await fetch(`${BASE_API_URL}/devices/apple-health/sync`, {
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

            // Mark everything the backend accepted (inserted or skipped as dup)
            for (const r of json.results || []) {
                if (
                    r.action === 'inserted' ||
                    r.action === 'skipped' ||
                    r.action === 'skipped_crossprovider'
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
            console.warn('[HealthKit] Backend sync failed, queuing offline:', e);
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

    /** Wipe local caches when the user disconnects. */
    resetLocalState() {
        syncedIdsStorage.remove(SYNCED_IDS_KEY);
        pendingStorage.remove(PENDING_KEY);
        metadataStorage.remove(LAST_SYNCED_AT_KEY);
        metadataStorage.remove(PERMISSION_GRANTED_KEY);
    }

    // ─── Background delivery (best-effort) ───────────────────────────────

    /**
     * Register HealthKit to wake the app when new running workouts arrive.
     * The observer callback (`subscribeToChanges`) is flaky under New
     * Architecture (kingstinct Issue #106), so we also rely on foreground
     * sync triggered from HomeScreen as the reliable path.
     */
    async enableBackgroundSync(): Promise<void> {
        if (!this.isIOS) return;
        try {
            const hk = await import('@kingstinct/react-native-healthkit');
            await hk.enableBackgroundDelivery(
                'HKWorkoutTypeIdentifier',
                hk.UpdateFrequency.immediate,
            );
        } catch (e) {
            console.warn('[HealthKit] enableBackgroundDelivery failed:', e);
        }
    }

    async disableBackgroundSync(): Promise<void> {
        if (!this.isIOS) return;
        try {
            const hk = await import('@kingstinct/react-native-healthkit');
            await hk.disableBackgroundDelivery('HKWorkoutTypeIdentifier');
        } catch (e) {
            console.warn('[HealthKit] disableBackgroundDelivery failed:', e);
        }
    }

    // ─── Small helpers ───────────────────────────────────────────────────

    /** HealthKit returns a Quantity; coerce to a number of meters. */
    private quantityToMeters(q: unknown): number {
        if (!q) return 0;
        const any = q as { quantity?: number; unit?: string };
        if (typeof any.quantity !== 'number') return 0;
        // The kingstinct lib normalizes distance to meters when unit is 'm'.
        // totalDistance on WorkoutSample defaults to the preferred unit,
        // which for distance is meters per HealthKit SI.
        if (any.unit === 'km') return any.quantity * 1000;
        if (any.unit === 'mi') return any.quantity * 1609.344;
        return any.quantity;
    }

    private quantityToSeconds(q: unknown): number {
        if (!q) return 0;
        const any = q as { quantity?: number; unit?: string };
        if (typeof any.quantity !== 'number') return 0;
        if (any.unit === 'min') return any.quantity * 60;
        if (any.unit === 'hr') return any.quantity * 3600;
        return any.quantity; // assume seconds
    }

    private quantityToKcal(q: unknown): number | undefined {
        if (!q) return undefined;
        const any = q as { quantity?: number; unit?: string };
        if (typeof any.quantity !== 'number') return undefined;
        if (any.unit === 'J') return any.quantity / 4184;
        if (any.unit === 'kJ') return any.quantity / 4.184;
        return any.quantity; // assume kcal
    }

    private extractSourceName(workout: any): string | undefined {
        try {
            return (
                workout?.sourceRevision?.source?.name ??
                workout?.metadata?.HKMetadataKeySourceName ??
                undefined
            );
        } catch {
            return undefined;
        }
    }
}

export const HealthKitManager = new HealthKitManagerClass();
