/**
 * Normalized wearable connection state + actions for a single provider.
 *
 * This is the single home for the connect/disconnect logic that used to live
 * (duplicated) inside the per-device Settings cards AND the onboarding modal.
 * It is consumed by:
 *   - `DeviceRow`          → reads status to render a list row
 *   - `DeviceConnectBody`  → drives the primary button (connect/disconnect)
 *
 * `connect()` resolves to a boolean success flag so callers (e.g. onboarding)
 * can advance on success without reading the post-await `isConnected` (stale).
 *
 * Provider notes:
 *   - `apple`       → Apple Health / HealthKit (Profile).
 *   - `appleWatch`  → Apple Watch companion app via WatchConnectivity (onboarding).
 *   - `healthConnect` / `garmin` / `polar` / `fitbit` → shared everywhere.
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
    performHandshake,
} from '../services/garminConnect';
import {
    isWatchPaired as appleWatchIsPaired,
    isWatchAppInstalled as appleWatchIsInstalled,
} from '../services/appleWatch';
import * as Storage from '../utils/storage';
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
    /** Runs the connect flow; resolves true on success. */
    connect: () => Promise<boolean>;
    disconnect: () => void;
}

/** Backend provider string for a config provider (used by devices service). */
function backendProvider(provider: WearableProvider): string {
    return provider === 'appleWatch' ? 'apple_watch' : provider;
}

/** Providers whose connection state comes from `connected_devices` (backend). */
function isBackendProvider(provider: WearableProvider): boolean {
    return (
        provider === 'garmin' ||
        provider === 'polar' ||
        provider === 'fitbit' ||
        provider === 'appleWatch'
    );
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

    // Backend status for garmin/polar/fitbit/appleWatch (mirrors the old fetch).
    useEffect(() => {
        if (!isApplicable) return;
        if (isBackendProvider(provider)) {
            checkProviderStatus(backendProvider(provider))
                .then(setBackendConnected)
                .catch(() => setBackendConnected(false));
        }
    }, [provider, isApplicable]);

    // ---- connect handlers (one per integration kind) ----------------------

    const connectApple = useCallback(async (): Promise<boolean> => {
        const result = await hk.connect();
        if (result.success) return true;
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
            return false;
        }
        if (result.error) {
            Alert.alert('Não foi possível conectar', result.error);
        }
        return false;
    }, [hk]);

    const connectAppleWatch = useCallback(async (): Promise<boolean> => {
        if (Platform.OS !== 'ios') {
            Alert.alert(
                'Apple Watch indisponível',
                'Apple Watch só funciona em iPhones com iOS.',
            );
            return false;
        }
        setIsBusyLocal(true);
        try {
            const [paired, installed] = await Promise.all([
                appleWatchIsPaired(),
                appleWatchIsInstalled(),
            ]);
            if (!paired) {
                Alert.alert(
                    'Apple Watch não pareado',
                    'Pareie seu Apple Watch com o iPhone (app Watch da Apple) e tente novamente.',
                );
                return false;
            }
            if (!installed) {
                Alert.alert(
                    'App não instalado no Watch',
                    'Abra o app Watch no seu iPhone e instale o RunEasy. Depois volte aqui pra concluir.',
                );
                return false;
            }
            await connectDeviceManual('apple_watch', 'Apple Watch');
            setBackendConnected(true);
            return true;
        } catch (e) {
            Alert.alert(
                'Erro ao conectar',
                e instanceof Error ? e.message : 'Tente novamente.',
            );
            return false;
        } finally {
            setIsBusyLocal(false);
        }
    }, []);

    const connectHealthConnect = useCallback(async (): Promise<boolean> => {
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
            return false;
        }

        const result = await hc.connect();
        if (result.success) return true;

        if (result.needsInstall) {
            Alert.alert(
                'Health Connect necessário',
                'Instale o Health Connect pela Play Store e tente novamente.',
                [
                    { text: 'Agora não', style: 'cancel' },
                    { text: 'Instalar', onPress: () => hc.openPlayStore() },
                ],
            );
            return false;
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
            return false;
        }

        if (result.error) {
            Alert.alert('Não foi possível conectar', result.error);
        }
        return false;
    }, [hc]);

    const connectGarmin = useCallback(async (): Promise<boolean> => {
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
                return false;
            }

            await initGarmin();
            const detected = await getConnectedDevice();
            if (!detected) {
                Alert.alert(
                    'Nenhum Garmin encontrado',
                    'Pareie seu relógio via Garmin Connect Mobile e tente novamente.',
                );
                return false;
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
                return false;
            }

            // Handshake — envia token, aguarda HANDSHAKE_ACK (best-effort, 5s).
            const token = (await Storage.getItemAsync('access_token')) || '';
            await performHandshake(detected, token, 5000);

            await connectDeviceManual('garmin', detected.name);
            setBackendConnected(true);
            return true;
        } catch (e) {
            Alert.alert(
                'Erro ao conectar',
                e instanceof Error ? e.message : 'Tente novamente.',
            );
            return false;
        } finally {
            setIsBusyLocal(false);
        }
    }, []);

    const connectOAuth = useCallback(async (p: 'polar' | 'fitbit'): Promise<boolean> => {
        setIsBusyLocal(true);
        try {
            const result = await connectWearable(p);
            if (result.success) {
                setBackendConnected(true);
                return true;
            }
            if (result.error && result.error !== 'Authorization cancelled') {
                Alert.alert(
                    'Erro na conexão',
                    result.error || 'Não foi possível conectar. Tente novamente.',
                );
            }
            return false;
        } catch (e) {
            Alert.alert(
                'Erro ao conectar',
                e instanceof Error ? e.message : 'Tente novamente.',
            );
            return false;
        } finally {
            setIsBusyLocal(false);
        }
    }, []);

    // ---- disconnect handlers ---------------------------------------------

    const disconnectBackend = useCallback(
        (p: string, title: string, message: string) => {
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
            case 'appleWatch':
                disconnectBackend(
                    'apple_watch',
                    'Desconectar Apple Watch?',
                    'O RunEasy deixará de receber corridas do seu Apple Watch.',
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

    const connect = useCallback((): Promise<boolean> => {
        switch (provider) {
            case 'apple':
                return connectApple();
            case 'appleWatch':
                return connectAppleWatch();
            case 'healthConnect':
                return connectHealthConnect();
            case 'garmin':
                return connectGarmin();
            case 'polar':
                return connectOAuth('polar');
            case 'fitbit':
                return connectOAuth('fitbit');
            default:
                return Promise.resolve(false);
        }
    }, [
        provider,
        connectApple,
        connectAppleWatch,
        connectHealthConnect,
        connectGarmin,
        connectOAuth,
    ]);

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
            // appleWatch / garmin / polar / fitbit — backend registration.
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
