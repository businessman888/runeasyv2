import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { getSyncStatus, getProviderLabel, SyncStatus } from '../services/devices';

// Design System Colors
const DS = {
    cyan: '#00D4FF',
    card: '#1A1A2E',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    success: '#4ADE80',
};

const SyncIcon = ({ color }: { color: string }) => (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
            fill={color}
        />
    </Svg>
);

const GpsIcon = ({ color }: { color: string }) => (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={3} fill={color} />
        <Path
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
            stroke={color}
            strokeWidth={1.5}
            fill="none"
        />
    </Svg>
);

interface SyncStatusBadgeProps {
    compact?: boolean;
}

export function SyncStatusBadge({ compact = false }: SyncStatusBadgeProps) {
    const [status, setStatus] = useState<SyncStatus | null>(null);

    useEffect(() => {
        getSyncStatus()
            .then(setStatus)
            .catch(() => setStatus(null));
    }, []);

    if (!status) return null;

    if (status.hasConnectedDevice) {
        const mainProvider = status.connectedProviders[0];
        const label = getProviderLabel(mainProvider.provider);

        return (
            <View style={[styles.badge, styles.badgeConnected]}>
                <SyncIcon color={DS.success} />
                <Text style={styles.badgeText}>
                    {compact ? label : `${label} Sincronizado`}
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.badge, styles.badgeGps]}>
            <GpsIcon color={DS.cyan} />
            <Text style={styles.badgeText}>
                {compact ? 'GPS' : 'Pronto para rastrear via GPS'}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    badgeConnected: {
        backgroundColor: 'rgba(74, 222, 128, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(74, 222, 128, 0.3)',
    },
    badgeGps: {
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '500',
        color: DS.text,
    },
});
