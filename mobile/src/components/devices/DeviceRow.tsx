/**
 * Profile "Dispositivos" list row — Runna-inspired, clean/neutral.
 *
 * Shows the brand logo + device name + a compact connection status, and a
 * chevron that opens the per-device pre-connection screen (`DeviceConnect`).
 * The connect/disconnect actions themselves live on that screen's button.
 *
 * Renders `null` when the integration isn't offered on the current platform
 * (e.g. Apple Watch on Android, Galaxy Watch on iOS), so the Settings screen
 * can list every provider unconditionally.
 */

import React, { memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, fonts } from '../../theme';
import { WEARABLES, type WearableProvider } from '../../config/wearables.config';
import {
    useWearableConnection,
    formatLastSynced,
} from '../../hooks/useWearableConnection';
import type { RootStackParamList } from '../../navigation/navigationRef';

const STATUS_CONNECTED = '#4ADE80';
const STATUS_WARNING = '#FBBF24';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface DeviceRowProps {
    provider: WearableProvider;
}

function DeviceRowComponent({ provider }: DeviceRowProps) {
    const navigation = useNavigation<Nav>();
    const config = WEARABLES[provider];
    const { isApplicable, status, lastSyncedAt } = useWearableConnection(provider);

    if (!isApplicable) return null;

    const isConnected = status === 'connected';
    const needsInstall = status === 'needsInstall';

    const statusLabel = isConnected
        ? lastSyncedAt
            ? `Conectado · ${formatLastSynced(lastSyncedAt)}`
            : 'Conectado'
        : needsInstall
        ? 'App não instalado'
        : 'Não conectado';

    const dotColor = isConnected
        ? STATUS_CONNECTED
        : needsInstall
        ? STATUS_WARNING
        : null;

    return (
        <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('DeviceConnect', { provider })}
            accessibilityRole="button"
            accessibilityLabel={`${config.rowLabel}, ${statusLabel}`}
            accessibilityHint="Abre as instruções de conexão"
        >
            <View style={styles.logoTile}>
                <Image source={config.logo} style={styles.logo} resizeMode="contain" />
            </View>

            <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>
                    {config.rowLabel}
                </Text>
                <View style={styles.statusRow}>
                    {dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
                    <Text style={styles.statusText} numberOfLines={1}>
                        {statusLabel}
                    </Text>
                </View>
            </View>

            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
    );
}

export const DeviceRow = memo(DeviceRowComponent);

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 64,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    logoTile: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    logo: {
        width: 26,
        height: 26,
    },
    info: {
        flex: 1,
    },
    title: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        color: colors.text,
        marginBottom: 3,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    statusText: {
        fontFamily: fonts.regular,
        fontSize: 12.5,
        color: colors.textSecondary,
    },
});

export default DeviceRow;
