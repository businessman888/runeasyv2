/**
 * Garmin Connect IQ connection card for the Settings screen.
 *
 * Mostra status de conexão com o relógio Garmin (via Connect IQ Mobile SDK)
 * e oferece botões para conectar/desconectar. Retorna `null` se a plataforma
 * for web — funciona em iOS e Android quando o app Garmin Connect Mobile está
 * instalado e o relógio pareado.
 *
 * Conexão real é feita pelo WearableSelectionModal no onboarding. Aqui só
 * espelhamos o estado em `connected_devices` + `useGarmin()`.
 */

import React, { useCallback, useEffect, useState } from 'react';
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

import { useGarmin } from '../hooks/useGarmin';
import {
    checkProviderStatus,
    connectDeviceManual,
    disconnectDevice,
} from '../services/devices';
import {
    initGarmin,
    isGarminConnectInstalled,
    openGarminConnectStore,
    getConnectedDevice,
    isAppInstalledOnDevice as isGarminAppInstalled,
    openAppStoreOnDevice as openGarminAppStore,
} from '../services/garminConnect';

const DS = {
    card: '#1C1C2E',
    cyan: '#00D4FF',
    text: '#FFFFFF',
    textSecondary: 'rgba(235,235,245,0.6)',
    success: '#4ADE80',
    danger: '#FF6B6B',
};

export function GarminCard() {
    const { device, isAppInstalledOnWatch, refreshAppInstalled } = useGarmin();
    const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    useEffect(() => {
        checkProviderStatus('garmin').then(setIsRegistered).catch(() => setIsRegistered(false));
    }, [device?.id]);

    const handleConnect = useCallback(async () => {
        setIsBusy(true);
        try {
            const gcmInstalled = await isGarminConnectInstalled();
            if (!gcmInstalled) {
                Alert.alert(
                    'Instale o Garmin Connect',
                    'Você precisa do app Garmin Connect Mobile instalado no celular.',
                    [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Abrir loja', onPress: () => { void openGarminConnectStore(); } },
                    ],
                );
                return;
            }

            await initGarmin();
            const detected = await getConnectedDevice();
            if (!detected) {
                Alert.alert(
                    'Nenhum Garmin encontrado',
                    'Pareie seu relógio via Garmin Connect Mobile e tente novamente.',
                );
                return;
            }

            const appInstalled = await isGarminAppInstalled(detected.id);
            if (!appInstalled) {
                Alert.alert(
                    'Instale o RunEasy no relógio',
                    'O app RunEasy precisa estar instalado no seu Garmin via Connect IQ Store.',
                    [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Abrir Connect IQ Store', onPress: () => { void openGarminAppStore(detected.id); } },
                    ],
                );
                return;
            }

            await connectDeviceManual('garmin', detected.name);
            setIsRegistered(true);
            await refreshAppInstalled();
        } catch (e) {
            Alert.alert(
                'Erro ao conectar',
                e instanceof Error ? e.message : 'Tente novamente.',
            );
        } finally {
            setIsBusy(false);
        }
    }, [refreshAppInstalled]);

    const handleDisconnect = useCallback(() => {
        Alert.alert(
            'Desconectar Garmin?',
            'O RunEasy deixará de receber corridas do seu relógio Garmin via Connect IQ.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Desconectar',
                    style: 'destructive',
                    onPress: async () => {
                        setIsBusy(true);
                        try {
                            await disconnectDevice('garmin');
                            setIsRegistered(false);
                        } catch (e) {
                            Alert.alert(
                                'Erro ao desconectar',
                                e instanceof Error ? e.message : 'Tente novamente.',
                            );
                        } finally {
                            setIsBusy(false);
                        }
                    },
                },
            ],
        );
    }, []);

    if (Platform.OS === 'web') return null;

    const isConnected = isRegistered === true && device?.status === 'connected';
    const deviceLabel = device?.name ?? 'Garmin';

    return (
        <View
            style={styles.card}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={
                isConnected
                    ? `Garmin ${deviceLabel} conectado`
                    : 'Garmin não conectado'
            }
        >
            <View style={styles.row}>
                <View style={styles.iconContainer}>
                    <MaterialCommunityIcons name="watch-variant" size={24} color={DS.cyan} />
                </View>

                <View style={styles.info}>
                    <Text style={styles.title} numberOfLines={1}>
                        {isConnected ? deviceLabel : 'Garmin Connect IQ'}
                    </Text>
                    <View style={styles.statusRow}>
                        {isConnected ? (
                            <>
                                <Ionicons name="checkmark-circle" size={14} color={DS.success} />
                                <Text style={styles.statusText}>
                                    Conectado{isAppInstalledOnWatch === false ? ' · app não instalado no relógio' : ''}
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
                        isBusy && styles.buttonDisabled,
                    ]}
                    onPress={isConnected ? handleDisconnect : handleConnect}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={isConnected ? 'Desconectar Garmin' : 'Conectar Garmin'}
                    activeOpacity={0.7}
                >
                    {isBusy ? (
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

export default GarminCard;
