/**
 * Google Health Connect connection card for the Settings screen.
 *
 * Android-only — returns null on iOS. Handles the full connect/disconnect
 * lifecycle via the healthConnectStore, including the "Health Connect not
 * installed" fallback that opens the Play Store entry for the system app
 * (com.google.android.apps.healthdata), and the permission-denied fallback
 * that deep-links into the Health Connect settings screen.
 */

import React, { useEffect } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { useHealthConnect } from '../hooks/useHealthConnect';

const DS = {
    card: '#1C1C2E',
    cyan: '#00D4FF',
    text: '#FFFFFF',
    textSecondary: 'rgba(235,235,245,0.6)',
    success: '#4ADE80',
    danger: '#FF6B6B',
    warning: '#FBBF24',
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

export function HealthConnectCard() {
    const {
        isAvailable,
        needsInstall,
        isConnected,
        isConnecting,
        isSyncing,
        lastSyncedAt,
        connect,
        disconnect,
        initialize,
        openHealthConnectSettings,
        openPlayStore,
    } = useHealthConnect();

    useEffect(() => {
        initialize();
    }, [initialize]);

    if (Platform.OS !== 'android') {
        return null;
    }

    const handleConnect = async () => {
        // Pre-check: if HC isn't installed yet, send the user to Play Store
        // instead of running the SDK and getting an opaque error.
        if (needsInstall) {
            Alert.alert(
                'Health Connect necessário',
                'Para sincronizar com seu Galaxy Watch (e outros relógios Android), instale o app Health Connect pela Play Store.',
                [
                    { text: 'Agora não', style: 'cancel' },
                    { text: 'Instalar', onPress: () => openPlayStore() },
                ],
            );
            return;
        }

        const result = await connect();
        if (result.success) return;

        if (result.needsInstall) {
            Alert.alert(
                'Health Connect necessário',
                'Instale o Health Connect pela Play Store e tente novamente.',
                [
                    { text: 'Agora não', style: 'cancel' },
                    { text: 'Instalar', onPress: () => openPlayStore() },
                ],
            );
            return;
        }

        if (result.needsSettings) {
            Alert.alert(
                'Permissão necessária',
                'Abra o Health Connect e habilite a permissão de leitura de Exercício para o RunEasy.',
                [
                    { text: 'Continuar sem', style: 'cancel' },
                    {
                        text: 'Abrir Health Connect',
                        onPress: () => openHealthConnectSettings(),
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
            'Desconectar Health Connect?',
            'O RunEasy deixará de sincronizar automaticamente as corridas do seu Galaxy Watch (ou outros relógios Android).',
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

    // Three visible states:
    //   1. Not installed → CTA "Instalar"
    //   2. Installed, not connected → CTA "Conectar"
    //   3. Connected → CTA "Desconectar" + "Conectado · há Xmin"
    const statusContent = (() => {
        if (needsInstall) {
            return (
                <>
                    <Ionicons name="alert-circle" size={14} color={DS.warning} />
                    <Text style={styles.statusText}>App não instalado</Text>
                </>
            );
        }
        if (isConnected) {
            return (
                <>
                    <Ionicons name="checkmark-circle" size={14} color={DS.success} />
                    <Text style={styles.statusText}>
                        Conectado · {formatLastSynced(lastSyncedAt)}
                    </Text>
                </>
            );
        }
        return <Text style={styles.statusText}>Não conectado</Text>;
    })();

    const buttonLabel = needsInstall
        ? 'Instalar'
        : isConnected
        ? 'Desconectar'
        : 'Conectar';

    const buttonStyle = isConnected
        ? styles.buttonDisconnect
        : styles.buttonConnect;
    const buttonTextStyle = isConnected
        ? styles.buttonTextDisconnect
        : styles.buttonTextConnect;

    const onPress = needsInstall
        ? () => openPlayStore()
        : isConnected
        ? handleDisconnect
        : handleConnect;

    return (
        <View
            style={styles.card}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={
                isConnected
                    ? `Health Connect conectado. ${formatLastSynced(lastSyncedAt)}`
                    : needsInstall
                    ? 'Health Connect não instalado'
                    : 'Health Connect não conectado'
            }
        >
            <View style={styles.row}>
                <View style={styles.iconContainer}>
                    <MaterialCommunityIcons name="watch" size={24} color={DS.cyan} />
                </View>

                <View style={styles.info}>
                    <Text style={styles.title}>Health Connect</Text>
                    <View style={styles.statusRow}>{statusContent}</View>
                </View>

                <TouchableOpacity
                    style={[styles.button, buttonStyle, busy && styles.buttonDisabled]}
                    onPress={onPress}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`${buttonLabel} Health Connect`}
                    activeOpacity={0.7}
                >
                    {busy ? (
                        <ActivityIndicator
                            size="small"
                            color={isConnected ? DS.danger : DS.cyan}
                        />
                    ) : (
                        <Text style={[styles.buttonText, buttonTextStyle]}>
                            {buttonLabel}
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

export default HealthConnectCard;
