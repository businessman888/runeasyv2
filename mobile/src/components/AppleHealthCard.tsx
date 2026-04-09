/**
 * Apple Health connection card for the Settings screen.
 *
 * iOS-only — returns null on Android or when HealthKit is unavailable on the
 * device (iPad, simulator, etc.). Handles the entire connect/disconnect
 * lifecycle via the healthKitStore, including the permission-denied fallback
 * that offers to open the native Health app.
 */

import React, { useEffect } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { useHealthKit } from '../hooks/useHealthKit';

const DS = {
    card: '#1C1C2E',
    cyan: '#00D4FF',
    text: '#FFFFFF',
    textSecondary: 'rgba(235,235,245,0.6)',
    success: '#4ADE80',
    danger: '#FF6B6B',
    border: 'rgba(255,255,255,0.08)',
};

function formatLastSynced(iso: string | null): string {
    if (!iso) return 'Nunca sincronizado';
    try {
        const date = new Date(iso);
        const now = Date.now();
        const diffMs = now - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Agora mesmo';
        if (diffMin < 60) return `Há ${diffMin} min`;
        const diffHours = Math.floor(diffMin / 60);
        if (diffHours < 24) return `Há ${diffHours}h`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `Há ${diffDays}d`;
        return date.toLocaleDateString('pt-BR');
    } catch {
        return 'Desconhecido';
    }
}

export function AppleHealthCard() {
    const {
        isAvailable,
        isConnected,
        isConnecting,
        isSyncing,
        lastSyncedAt,
        connect,
        disconnect,
        initialize,
    } = useHealthKit();

    useEffect(() => {
        initialize();
    }, [initialize]);

    if (Platform.OS !== 'ios' || !isAvailable) {
        return null;
    }

    const handleConnect = async () => {
        const result = await connect();
        if (result.success) return;

        if (result.needsSettings) {
            Alert.alert(
                'Permissão necessária',
                'Para sincronizar seus treinos, habilite o acesso ao RunEasy nas configurações do app Saúde.',
                [
                    { text: 'Continuar sem', style: 'cancel' },
                    {
                        text: 'Abrir Ajustes',
                        onPress: () => {
                            Linking.openURL('x-apple-health://').catch(() => {
                                Linking.openURL('app-settings:').catch(() => undefined);
                            });
                        },
                    },
                ],
            );
            return;
        }

        if (result.error) {
            Alert.alert('Não foi possível conectar', result.error);
        }
    };

    const handleDisconnect = () => {
        Alert.alert(
            'Desconectar Apple Health?',
            'O RunEasy deixará de sincronizar automaticamente novos treinos do Apple Watch.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Desconectar',
                    style: 'destructive',
                    onPress: () => {
                        disconnect();
                    },
                },
            ],
        );
    };

    const busy = isConnecting || isSyncing;

    return (
        <View
            style={styles.card}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={
                isConnected
                    ? `Apple Health conectado. ${formatLastSynced(lastSyncedAt)}`
                    : 'Apple Health não conectado'
            }
        >
            <View style={styles.row}>
                <View style={styles.iconContainer}>
                    <MaterialCommunityIcons name="heart-pulse" size={24} color={DS.cyan} />
                </View>

                <View style={styles.info}>
                    <Text style={styles.title}>Apple Health</Text>
                    <View style={styles.statusRow}>
                        {isConnected ? (
                            <>
                                <Ionicons
                                    name="checkmark-circle"
                                    size={14}
                                    color={DS.success}
                                />
                                <Text style={styles.statusText}>
                                    Conectado · {formatLastSynced(lastSyncedAt)}
                                </Text>
                            </>
                        ) : (
                            <Text style={styles.statusText}>Não conectado</Text>
                        )}
                    </View>
                </View>

                <TouchableOpacity
                    style={[
                        styles.button,
                        isConnected ? styles.buttonDisconnect : styles.buttonConnect,
                        busy && styles.buttonDisabled,
                    ]}
                    onPress={isConnected ? handleDisconnect : handleConnect}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={isConnected ? 'Desconectar Apple Health' : 'Conectar Apple Health'}
                    activeOpacity={0.7}
                >
                    {busy ? (
                        <ActivityIndicator
                            size="small"
                            color={isConnected ? DS.danger : DS.cyan}
                        />
                    ) : (
                        <Text
                            style={[
                                styles.buttonText,
                                isConnected ? styles.buttonTextDisconnect : styles.buttonTextConnect,
                            ]}
                        >
                            {isConnected ? 'Desconectar' : 'Conectar'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: DS.card,
        borderRadius: 16,
        padding: 14,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,212,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    info: {
        flex: 1,
    },
    title: {
        fontSize: 15,
        fontWeight: '600',
        color: DS.text,
        marginBottom: 2,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statusText: {
        fontSize: 12,
        color: DS.textSecondary,
    },
    button: {
        paddingHorizontal: 14,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 100,
    },
    buttonConnect: {
        backgroundColor: 'rgba(0,212,255,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(0,212,255,0.4)',
    },
    buttonDisconnect: {
        backgroundColor: 'rgba(255,107,107,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,107,107,0.3)',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        fontSize: 13,
        fontWeight: '600',
    },
    buttonTextConnect: {
        color: DS.cyan,
    },
    buttonTextDisconnect: {
        color: DS.danger,
    },
});

export default AppleHealthCard;
