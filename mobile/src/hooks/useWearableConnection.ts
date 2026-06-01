/**
 * Normalized wearable connection state + actions for a single provider.
 *
 * This is the single home for the connect/disconnect logic that used to live
 * (duplicated) inside the per-device Settings cards. It is consumed by:
 *   - `DeviceRow`            → reads status to render the Profile list row
 *   - `DeviceConnectScreen`  → drives the primary button (connect/disconnect)
 *
 * The three platform store hooks are always called (they are cheap zustand
 * selectors); side-effects (`initialize`, backend status fetch) are guarded by
 * `provider` so 5 mounted rows don't trigger redundant work. The connect /
 * disconnect handlers preserve the exact Alert flows of the original cards.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';

import { useHealthKit } from './useHealthKit';
import { useHealthConnect } from './useHealthConnect';
import {
    checkProviderStatus,
    connectDeviceManual,
    disconnectDevice,
} from '../services/devices';
import { connectWearable } from '../services/wearable-auth';
import {
    initGarmin,
    isGarminConnectInstalled,
    openGarminConnectStore,
    getConnectedDevice,
    isAppInstalledOnDevice as isGarminAppInstalled,
    openAppStoreOnDevice as openGarminAppStore,
} from '../services/garminConnect';
import { WEARABLES, type WearableProvider } from '../config/wearables.config';

export type WearableConnectionStatus =
    | 'connected'
    | 'disconnected'
    | 'needsInstall'
    | 'unknown';

export interface WearableConnectionState {
    /** False when the integration isn't offered on the current platform. */
    isApplicable: boolean;
    status: WearableConnectionStatus;
    isConnected: boolean;
    /** Health Connect only — system app missing. */
    needsInstall: boolean;
    /** Apple Health / Health Connect — ISO timestamp of last passive sync. */
    lastSyncedAt: string | null;
    isBusy: boolean;
    connect: () => Promise<void> | void;
    disconnect: () => void;
}

export function useWearableConnection(
    provider: WearableProvider,
): WearableConnectionState {
    const config = WEARABLES[provider];
    const isApplicable =
        Platform.OS !== 'web' &&
        config.platforms.includes(Platform.OS as 'ios' | 'android');

    // Platform store hooks — always called (cheap selectors, no side-effects).
    const hk = useHealthKit();
    const hc = useHealthConnect();

    // Backend-derived connection for OAuth / manually-registered providers.
    const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
    const [isBusyLocal, setIsBusyLocal] = useState(false);

    // Initialize the relevant native store once, only for its own row.
    useEffect(() => {
        if (!isApplicable) return;
        if (provider === 'apple') hk.initialize();
        else if (provider === 'healthConnect') hc.initialize();
    }, [provider, isApplicable, hk.initialize, hc.initialize]);

    // Backend status for garmin/polar/fitbit (mirrors the old per-card fetch).
    useEffect(() => {
        if (!isApplicable) return;
        if (provider === 'garmin' || provider === 'polar' || provider === 'fitbit') {
            checkProviderStatus(provider)
                .then(setBackendConnected)
                .catch(() => setBackendConnected(false));
        }
    }, [provider, isApplicable]);

    // ---- connect handlers (one per integration kind) ----------------------

    const connectApple = useCallback(async () => {
        const result = await hk.connect();
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
    }, [hk]);

    const connectHealthConnect = useCallback(async () => {
        // Pre-check: if HC isn't installed, send the user to Play Store instead
        // of running the SDK and getting an opaque error.
        if (hc.needsInstall) {
            Alert.alert(
                'Health Connect necessário',
                'Para sincronizar com seu Galaxy Watch (e outros relógios Android), instale o app Health Connect pela Play Store.',
                [
                    { text: 'Agora não', style: 'cancel' },
                    { text: 'Instalar', onPress: () => hc.openPlayStore() },
                ],
            );
            return;
        }

        const result = await hc.connect();
        if (result.success) return;

        if (result.needsInstall) {
            Alert.alert(
                'Health Connect necessário',
                'Instale o Health Connect pela Play Store e tente novamente.',
                [
                    { text: 'Agora não', style: 'cancel' },
                    { text: 'Instalar', onPress: () => hc.openPlayStore() },
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
                        onPress: () => hc.openHealthConnectSettings(),
                    },
                ],
            );
            return;
        }

        if (result.error) {
            Alert.alert('Não foi possível conectar', result.error);
        }
    }, [hc]);

    const connectGarmin = useCallback(async () => {
        setIsBusyLocal(true);
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
            setBackendConnected(true);
        } catch (e) {
            Alert.alert(
                'Erro ao conectar',
                e instanceof Error ? e.message : 'Tente novamente.',
            );
        } finally {
            setIsBusyLocal(false);
        }
    }, []);

    const connectOAuth = useCallback(async (p: 'polar' | 'fitbit') => {
        setIsBusyLocal(true);
        try {
            const result = await connectWearable(p);
            if (result.success) {
                setBackendConnected(true);
            } else if (result.error === 'Authorization cancelled') {
                // Usuário cancelou no browser — silencioso.
            } else if (result.error) {
                Alert.alert(
                    'Erro na conexão',
                    result.error || 'Não foi possível conectar. Tente novamente.',
                );
            }
        } catch (e) {
            Alert.alert(
                'Erro ao conectar',
                e instanceof Error ? e.message : 'Tente novamente.',
            );
        } finally {
            setIsBusyLocal(false);
        }
    }, []);

    // ---- disconnect handlers ---------------------------------------------

    const disconnectBackend = useCallback(
        (p: WearableProvider, title: string, message: string) => {
            Alert.alert(title, message, [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Desconectar',
                    style: 'destructive',
                    onPress: async () => {
                        setIsBusyLocal(true);
                        try {
                            await disconnectDevice(p);
                            setBackendConnected(false);
                        } catch (e) {
                            Alert.alert(
                                'Erro ao desconectar',
                                e instanceof Error ? e.message : 'Tente novamente.',
                            );
                        } finally {
                            setIsBusyLocal(false);
                        }
                    },
                },
            ]);
        },
        [],
    );

    const disconnect = useCallback(() => {
        switch (provider) {
            case 'apple':
                Alert.alert(
                    'Desconectar Apple Health?',
                    'O RunEasy deixará de sincronizar automaticamente novos treinos do Apple Watch.',
                    [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Desconectar', style: 'destructive', onPress: () => hk.disconnect() },
                    ],
                );
                return;
            case 'healthConnect':
                Alert.alert(
                    'Desconectar Health Connect?',
                    'O RunEasy deixará de sincronizar automaticamente as corridas do seu Galaxy Watch (ou outros relógios Android).',
                    [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Desconectar', style: 'destructive', onPress: () => hc.disconnect() },
                    ],
                );
                return;
            case 'garmin':
                disconnectBackend(
                    'garmin',
                    'Desconectar Garmin?',
                    'O RunEasy deixará de receber corridas do seu relógio Garmin via Connect IQ.',
                );
                return;
            case 'polar':
                disconnectBackend(
                    'polar',
                    'Desconectar Polar?',
                    'O RunEasy deixará de receber atividades do seu Polar.',
                );
                return;
            case 'fitbit':
                disconnectBackend(
                    'fitbit',
                    'Desconectar Fitbit?',
                    'O RunEasy deixará de receber atividades do seu Fitbit.',
                );
                return;
        }
    }, [provider, hk, hc, disconnectBackend]);

    const connect = useCallback((): Promise<void> | void => {
        switch (provider) {
            case 'apple':
                return connectApple();
            case 'healthConnect':
                return connectHealthConnect();
            case 'garmin':
                return connectGarmin();
            case 'polar':
                return connectOAuth('polar');
            case 'fitbit':
                return connectOAuth('fitbit');
        }
    }, [provider, connectApple, connectHealthConnect, connectGarmin, connectOAuth]);

    // ---- derive normalized state -----------------------------------------

    let status: WearableConnectionStatus = 'unknown';
    let isConnected = false;
    let needsInstall = false;
    let lastSyncedAt: string | null = null;
    let isBusy = isBusyLocal;

    switch (provider) {
        case 'apple':
            isConnected = hk.isConnected;
            lastSyncedAt = hk.lastSyncedAt;
            isBusy = hk.isConnecting || hk.isSyncing;
            status = isConnected ? 'connected' : 'disconnected';
            break;
        case 'healthConnect':
            needsInstall = hc.needsInstall;
            isConnected = hc.isConnected;
            lastSyncedAt = hc.lastSyncedAt;
            isBusy = hc.isConnecting || hc.isSyncing;
            status = needsInstall
                ? 'needsInstall'
                : isConnected
                ? 'connected'
                : 'disconnected';
            break;
        default:
            // garmin / polar / fitbit — backend registration is the signal.
            isConnected = backendConnected === true;
            status =
                backendConnected === null
                    ? 'unknown'
                    : isConnected
                    ? 'connected'
                    : 'disconnected';
            break;
    }

    return {
        isApplicable,
        status,
        isConnected,
        needsInstall,
        lastSyncedAt,
        isBusy,
        connect,
        disconnect,
    };
}

/** Human "last synced" label (e.g. "Há 5 min"). Shared by the row + screen. */
export function formatLastSynced(iso: string | null): string {
    if (!iso) return 'Nunca sincronizado';
    try {
        const date = new Date(iso);
        const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
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
