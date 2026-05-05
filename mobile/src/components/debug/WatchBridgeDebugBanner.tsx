/**
 * Banner de debug que aparece SOMENTE em __DEV__.
 * Mostra visualmente quando uma corrida é recebida do Apple Watch via WatchConnectivity (Phase 4).
 * Auto-fade após 12s. Tap descarta manualmente.
 *
 * Remover depois que Phase 5 (integração com trainingStore) estiver consolidada.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppleWatchStore } from '../../stores/appleWatchStore';

const AUTO_DISMISS_MS = 12_000;

export function WatchBridgeDebugBanner() {
    const lastRun = useAppleWatchStore((s) => s.lastReceivedRun);
    const lastAt = useAppleWatchStore((s) => s.lastReceivedAt);
    const isPaired = useAppleWatchStore((s) => s.isPaired);
    const clear = useAppleWatchStore((s) => s.clearLastReceivedRun);
    const [dismissed, setDismissed] = useState(false);

    // Reset dismiss quando uma nova corrida chega
    useEffect(() => {
        if (lastRun) setDismissed(false);
    }, [lastAt]);

    // Auto-dismiss após 12s
    useEffect(() => {
        if (!lastRun || dismissed) return;
        const t = setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
        return () => clearTimeout(t);
    }, [lastAt, dismissed, lastRun]);

    if (!__DEV__) return null;
    if (!lastRun || dismissed) {
        // Mostra um badge minúsculo de status do bridge (canto)
        return (
            <View pointerEvents="none" style={styles.statusBadge}>
                <Text style={styles.statusText}>
                    ⌚ {isPaired ? 'Paired' : 'No Watch'}
                </Text>
            </View>
        );
    }

    const distKm = (lastRun.total_distance_meters / 1000).toFixed(2);
    const min = Math.floor(lastRun.duration_seconds / 60);
    const sec = lastRun.duration_seconds % 60;
    const durationStr = `${min}:${sec.toString().padStart(2, '0')}`;
    const points = lastRun.route_points?.length ?? 0;
    const isPlan = lastRun.workout_id ? 'plan' : 'free';

    return (
        <Pressable
            onPress={() => {
                setDismissed(true);
                clear();
            }}
            style={styles.banner}
        >
            <Text style={styles.bannerTitle}>✓ Corrida recebida do Watch</Text>
            <Text style={styles.bannerLine}>
                {distKm} km · {durationStr} · {points} pts GPS · {isPlan}
            </Text>
            {lastRun.avg_heart_rate != null && (
                <Text style={styles.bannerLineMuted}>
                    FC {lastRun.avg_heart_rate} avg / {lastRun.max_heart_rate ?? '--'} max · {lastRun.calories ?? '--'} kcal
                </Text>
            )}
            <Text style={styles.bannerHint}>(toque pra descartar)</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        top: 60,
        left: 12,
        right: 12,
        zIndex: 9999,
        backgroundColor: '#15152A',
        borderColor: '#00D4FF',
        borderWidth: 1.5,
        borderRadius: 12,
        padding: 12,
        shadowColor: '#00D4FF',
        shadowOpacity: 0.45,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
    },
    bannerTitle: {
        color: '#00D4FF',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 4,
    },
    bannerLine: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
    bannerLineMuted: {
        color: '#A0A0B2',
        fontSize: 11,
        marginTop: 2,
    },
    bannerHint: {
        color: '#A0A0B2',
        fontSize: 9,
        marginTop: 6,
        opacity: 0.6,
    },
    statusBadge: {
        position: 'absolute',
        top: 60,
        right: 12,
        backgroundColor: 'rgba(21,21,42,0.85)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        zIndex: 9999,
    },
    statusText: {
        color: '#A0A0B2',
        fontSize: 9,
        fontWeight: '600',
    },
});
