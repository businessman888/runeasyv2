/**
 * Polar OAuth connection card for the Settings screen.
 *
 * Mostra status de conexão com Polar (via OAuth 2.0 + Polar AccessLink) e oferece
 * botões para conectar/desconectar. Funciona em iOS e Android — o fluxo OAuth
 * abre um browser in-app e retorna via deep link `runeasy://wearable-connected`.
 *
 * Conexão inicial também pode ser feita pelo WearableSelectionModal no onboarding.
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

import {
    checkProviderStatus,
    disconnectDevice,
} from '../services/devices';
import { connectWearable } from '../services/wearable-auth';

const DS = {
    card: '#1C1C2E',
    cyan: '#00D4FF',
    text: '#FFFFFF',
    textSecondary: 'rgba(235,235,245,0.6)',
    success: '#4ADE80',
    danger: '#FF6B6B',
};

export function PolarCard() {
    const [isConnected, setIsConnected] = useState<boolean | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    useEffect(() => {
        checkProviderStatus('polar')
            .then(setIsConnected)
            .catch(() => setIsConnected(false));
    }, []);

    const handleConnect = useCallback(async () => {
        setIsBusy(true);
        try {
            const result = await connectWearable('polar');
            if (result.success) {
                setIsConnected(true);
            } else if (result.error === 'Authorization cancelled') {
                // Usuário cancelou no browser — silencioso
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
            setIsBusy(false);
        }
    }, []);

    const handleDisconnect = useCallback(() => {
        Alert.alert(
            'Desconectar Polar?',
            'O RunEasy deixará de receber atividades do seu Polar.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Desconectar',
                    style: 'destructive',
                    onPress: async () => {
                        setIsBusy(true);
                        try {
                            await disconnectDevice('polar');
                            setIsConnected(false);
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

    const connected = isConnected === true;

    return (
        <View
            style={styles.card}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={connected ? 'Polar conectado' : 'Polar não conectado'}
        >
            <View style={styles.row}>
                <View style={styles.iconContainer}>
                    <MaterialCommunityIcons name="watch" size={24} color={DS.cyan} />
                </View>

                <View style={styles.info}>
                    <Text style={styles.title} numberOfLines={1}>
                        Polar
                    </Text>
                    <View style={styles.statusRow}>
                        {connected ? (
                            <>
                                <Ionicons name="checkmark-circle" size={14} color={DS.success} />
                                <Text style={styles.statusText}>Conectado</Text>
                            </>
                        ) : (
                            <Text style={styles.statusText}>Não conectado</Text>
                        )}
                    </View>
                </View>

                <TouchableOpacity
                    style={[
                        styles.button,
                        connected ? styles.buttonDisconnect : styles.buttonConnect,
                        isBusy && styles.buttonDisabled,
                    ]}
                    onPress={connected ? handleDisconnect : handleConnect}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={connected ? 'Desconectar Polar' : 'Conectar Polar'}
                    activeOpacity={0.7}
                >
                    {isBusy ? (
                        <ActivityIndicator
                            size="small"
                            color={connected ? DS.danger : DS.cyan}
                        />
                    ) : (
                        <Text
                            style={[
                                styles.buttonText,
                                connected ? styles.buttonTextDisconnect : styles.buttonTextConnect,
                            ]}
                        >
                            {connected ? 'Desconectar' : 'Conectar'}
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

export default PolarCard;
