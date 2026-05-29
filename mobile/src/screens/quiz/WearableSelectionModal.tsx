import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Dimensions,
    ActivityIndicator,
    Alert,
    Platform,
} from 'react-native';
import Svg, { Path, Rect, Circle, G } from 'react-native-svg';
import { connectWearable, WearableProvider } from '../../services/wearable-auth';
import {
    isWatchPaired as appleWatchIsPaired,
    isWatchAppInstalled as appleWatchIsInstalled,
} from '../../services/appleWatch';
import { connectDeviceManual } from '../../services/devices';
import { HealthConnectManager } from '../../services/healthConnect';
import {
    initGarmin,
    isGarminConnectInstalled,
    openGarminConnectStore,
    getConnectedDevice,
    isAppInstalledOnDevice as isGarminAppInstalled,
    openAppStoreOnDevice as openGarminAppStore,
    performHandshake,
} from '../../services/garminConnect';
import * as Storage from '../../utils/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Design System Colors
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cardSelected: 'rgba(0, 212, 255, 0.1)',
    cyan: '#00D4FF',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    overlay: 'rgba(0, 0, 0, 0.7)',
    border: '#2A2A3E',
};

// ============================================
// PROVIDER ICONS (SVG)
// ============================================

const GarminIcon = () => (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={10} stroke={DS.cyan} strokeWidth={1.5} />
        <Path d="M12 6v6l4 2" stroke={DS.cyan} strokeWidth={1.5} strokeLinecap="round" />
        <Path d="M8 2h8" stroke={DS.cyan} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
);

const PolarIcon = () => (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={6} width={18} height={12} rx={3} stroke={DS.cyan} strokeWidth={1.5} />
        <Path d="M7 12h2l1-3 2 6 2-4 1 1h2" stroke={DS.cyan} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

const FitbitIcon = () => (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
        <G>
            <Circle cx={12} cy={4} r={1.5} fill={DS.cyan} />
            <Circle cx={12} cy={8} r={1.5} fill={DS.cyan} />
            <Circle cx={12} cy={12} r={1.5} fill={DS.cyan} />
            <Circle cx={12} cy={16} r={1.5} fill={DS.cyan} />
            <Circle cx={12} cy={20} r={1.5} fill={DS.cyan} />
            <Circle cx={8} cy={6} r={1.3} fill={DS.cyan} opacity={0.7} />
            <Circle cx={8} cy={10} r={1.3} fill={DS.cyan} opacity={0.7} />
            <Circle cx={8} cy={14} r={1.3} fill={DS.cyan} opacity={0.7} />
            <Circle cx={8} cy={18} r={1.3} fill={DS.cyan} opacity={0.7} />
            <Circle cx={16} cy={6} r={1.3} fill={DS.cyan} opacity={0.7} />
            <Circle cx={16} cy={10} r={1.3} fill={DS.cyan} opacity={0.7} />
            <Circle cx={16} cy={14} r={1.3} fill={DS.cyan} opacity={0.7} />
            <Circle cx={16} cy={18} r={1.3} fill={DS.cyan} opacity={0.7} />
        </G>
    </Svg>
);

const AppleWatchIcon = () => (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
        <Rect x={6} y={3} width={12} height={18} rx={4} stroke={DS.cyan} strokeWidth={1.5} />
        <Rect x={8} y={6} width={8} height={12} rx={2} stroke={DS.cyan} strokeWidth={1} opacity={0.5} />
        <Path d="M10 2V3M14 2V3M10 21v1M14 21v1" stroke={DS.cyan} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
);

// Health Connect icon — generic Galaxy-Watch-style smartwatch with a heart
// pulse glyph to convey "fitness data from any Android wearable".
const HealthConnectIcon = () => (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
        <Rect x={5} y={4} width={14} height={16} rx={4} stroke={DS.cyan} strokeWidth={1.5} />
        <Path d="M9 3v1M15 3v1M9 20v1M15 20v1" stroke={DS.cyan} strokeWidth={1.5} strokeLinecap="round" />
        <Path
            d="M8 13c0-1 .8-2 2-2 1 0 1.5.7 2 1.3.5-.6 1-1.3 2-1.3 1.2 0 2 1 2 2 0 1.7-4 4-4 4s-4-2.3-4-4z"
            stroke={DS.cyan}
            strokeWidth={1.5}
            strokeLinejoin="round"
        />
    </Svg>
);

// ============================================
// PROVIDERS DATA
// ============================================

interface Provider {
    id: string;
    name: string;
    Icon: React.FC;
}

// Cross-platform providers (shown on both iOS and Android via OAuth):
//   Garmin, Polar, Fitbit
// Platform-exclusive providers:
//   - apple_watch    iOS only (WatchConnectivity + HealthKit on the watch)
//   - health_connect Android only (Galaxy Watch via Samsung Health → HC)
// We filter at render time so the modal stays one component for both
// platforms instead of branching into two parallel implementations.
const ALL_PROVIDERS: Array<Provider & { platform?: 'ios' | 'android' }> = [
    { id: 'garmin', name: 'Garmin', Icon: GarminIcon },
    { id: 'polar', name: 'Polar', Icon: PolarIcon },
    { id: 'fitbit', name: 'Fitbit', Icon: FitbitIcon },
    { id: 'apple_watch', name: 'Apple Watch', Icon: AppleWatchIcon, platform: 'ios' },
    {
        id: 'health_connect',
        name: 'Galaxy Watch (Health Connect)',
        Icon: HealthConnectIcon,
        platform: 'android',
    },
];

const PROVIDERS: Provider[] = ALL_PROVIDERS.filter(
    (p) => !p.platform || p.platform === Platform.OS,
);

// ============================================
// CIRCULAR RADIO
// ============================================

const CircularRadio = ({ selected }: { selected: boolean }) => (
    <View style={[radioStyles.outer, selected && radioStyles.outerSelected]}>
        {selected && <View style={radioStyles.inner} />}
    </View>
);

const radioStyles = StyleSheet.create({
    outer: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: DS.textSecondary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    outerSelected: {
        borderColor: DS.cyan,
    },
    inner: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: DS.cyan,
    },
});

// ============================================
// MODAL COMPONENT
// ============================================

interface WearableSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (provider: string) => void;
    selectedProvider: string | null;
}

export function WearableSelectionModal({
    visible,
    onClose,
    onSelect,
    selectedProvider,
}: WearableSelectionModalProps) {
    const [localSelection, setLocalSelection] = useState<string | null>(selectedProvider);
    const [isConnecting, setIsConnecting] = useState(false);

    const handleConfirm = async () => {
        if (!localSelection) return;

        // Health Connect — Android only, sem OAuth. Verifica se o app
        // system está instalado, pede permissões de leitura (ExerciseSession,
        // HeartRate, Distance, TotalCaloriesBurned) e registra em
        // connected_devices. O foreground sync na HomeScreen cuida do resto.
        if (localSelection === 'health_connect') {
            if (Platform.OS !== 'android') {
                Alert.alert(
                    'Health Connect indisponível',
                    'Health Connect só funciona no Android.',
                );
                return;
            }
            setIsConnecting(true);
            try {
                const available = await HealthConnectManager.isAvailable();
                if (!available) {
                    Alert.alert(
                        'Health Connect necessário',
                        'Instale o app Health Connect pela Play Store para sincronizar seu Galaxy Watch (e outros relógios Android).',
                        [
                            { text: 'Cancelar', style: 'cancel' },
                            {
                                text: 'Abrir Play Store',
                                onPress: () => {
                                    HealthConnectManager.openPlayStoreForHealthConnect();
                                },
                            },
                        ],
                    );
                    setIsConnecting(false);
                    return;
                }

                const initialized = await HealthConnectManager.initialize();
                if (!initialized) {
                    Alert.alert(
                        'Erro ao inicializar',
                        'Não foi possível inicializar o Health Connect. Tente novamente.',
                    );
                    setIsConnecting(false);
                    return;
                }

                const { granted } = await HealthConnectManager.requestPermissions();
                if (!granted) {
                    Alert.alert(
                        'Permissão necessária',
                        'Abra o Health Connect e habilite a leitura de Exercício para o RunEasy.',
                        [
                            { text: 'Continuar sem', style: 'cancel' },
                            {
                                text: 'Abrir Health Connect',
                                onPress: () => {
                                    HealthConnectManager.openHealthConnectSettings();
                                },
                            },
                        ],
                    );
                    setIsConnecting(false);
                    return;
                }

                // Persiste em connected_devices (sem token — HC é permissão local).
                await connectDeviceManual('health_connect', 'Health Connect');
                onSelect(localSelection);
            } catch (e) {
                Alert.alert(
                    'Erro ao conectar',
                    e instanceof Error ? e.message : 'Tente novamente.',
                );
                setIsConnecting(false);
                return;
            }
            setIsConnecting(false);
            return;
        }

        // Apple Watch — sem OAuth. Detecta pareamento + instala via WatchConnectivity
        // e registra em connected_devices. Permissões HealthKit já são solicitadas
        // pelo app companion no relógio na primeira corrida.
        if (localSelection === 'apple_watch') {
            if (Platform.OS !== 'ios') {
                Alert.alert(
                    'Apple Watch indisponível',
                    'Apple Watch só funciona em iPhones com iOS.',
                );
                return;
            }
            setIsConnecting(true);
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
                    setIsConnecting(false);
                    return;
                }

                if (!installed) {
                    Alert.alert(
                        'App não instalado no Watch',
                        'Abra o app Watch no seu iPhone e instale o RunEasy. Depois volte aqui pra concluir.',
                    );
                    setIsConnecting(false);
                    return;
                }

                // Registra em connected_devices (sem token — Apple Watch não tem OAuth)
                await connectDeviceManual('apple_watch', 'Apple Watch');
                onSelect(localSelection);
            } catch (e) {
                Alert.alert(
                    'Erro ao conectar',
                    e instanceof Error ? e.message : 'Tente novamente.',
                );
                setIsConnecting(false);
                return;
            }
            setIsConnecting(false);
            return;
        }

        // For providers with OAuth support, start real flow
        if (localSelection === 'fitbit' || localSelection === 'polar') {
            setIsConnecting(true);
            try {
                const result = await connectWearable(localSelection as WearableProvider);

                if (result.success) {
                    onSelect(localSelection);
                } else if (result.error === 'Authorization cancelled') {
                    // User cancelled — stay on modal
                    setIsConnecting(false);
                    return;
                } else {
                    Alert.alert(
                        'Erro na conexão',
                        result.error || 'Não foi possível conectar. Tente novamente.',
                        [{ text: 'OK' }],
                    );
                    setIsConnecting(false);
                    return;
                }
            } catch {
                Alert.alert('Erro', 'Falha na conexão. Tente novamente.');
                setIsConnecting(false);
                return;
            }
            setIsConnecting(false);
        } else if (localSelection === 'garmin') {
            // Garmin — Connect IQ Mobile SDK (Bluetooth via Garmin Connect Mobile)
            setIsConnecting(true);
            try {
                // 1. Garmin Connect Mobile precisa estar instalado
                const gcmInstalled = await isGarminConnectInstalled();
                if (!gcmInstalled) {
                    Alert.alert(
                        'Instale o Garmin Connect',
                        'Você precisa do app Garmin Connect Mobile instalado no celular e o relógio pareado com ele.',
                        [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Abrir loja', onPress: () => { void openGarminConnectStore(); } },
                        ],
                    );
                    setIsConnecting(false);
                    return;
                }

                // 2. Inicializa SDK + detecta dispositivos pareados
                await initGarmin();
                const device = await getConnectedDevice();
                if (!device) {
                    Alert.alert(
                        'Nenhum Garmin encontrado',
                        'Certifique-se de que seu relógio está pareado via Garmin Connect Mobile e ligado.',
                    );
                    setIsConnecting(false);
                    return;
                }

                // 3. App RunEasy precisa estar instalado no relógio
                const appInstalled = await isGarminAppInstalled(device.id);
                if (!appInstalled) {
                    Alert.alert(
                        'Instale o RunEasy no relógio',
                        'O app RunEasy precisa estar instalado no seu Garmin via Connect IQ Store.',
                        [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Abrir Connect IQ Store', onPress: () => { void openGarminAppStore(device.id); } },
                        ],
                    );
                    setIsConnecting(false);
                    return;
                }

                // 4. Handshake — envia token, aguarda HANDSHAKE_ACK (best-effort, timeout 5s)
                const token = (await Storage.getItemAsync('access_token')) || '';
                await performHandshake(device, token, 5000);

                // 5. Persiste em connected_devices (mesmo provider que OAuth para reuso de UI)
                await connectDeviceManual('garmin', device.name);

                onSelect(localSelection);
            } catch (e) {
                Alert.alert(
                    'Erro ao conectar',
                    e instanceof Error ? e.message : 'Falha na conexão com o Garmin. Tente novamente.',
                );
                setIsConnecting(false);
                return;
            }
            setIsConnecting(false);
        } else {
            // Fallback (não deveria acontecer com os providers atuais)
            onSelect(localSelection);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.modalContainer}>
                    {/* Header */}
                    <View style={styles.handleBar} />
                    <Text style={styles.modalTitle}>Escolha seu dispositivo</Text>
                    <Text style={styles.modalSubtitle}>
                        Selecione o dispositivo que você usa para correr.
                    </Text>

                    {/* Provider List */}
                    <View style={styles.providerList}>
                        {PROVIDERS.map((provider) => {
                            const isSelected = localSelection === provider.id;
                            return (
                                <TouchableOpacity
                                    key={provider.id}
                                    style={[
                                        styles.providerCard,
                                        isSelected && styles.providerCardSelected,
                                    ]}
                                    onPress={() => setLocalSelection(provider.id)}
                                    activeOpacity={0.7}
                                >
                                    <provider.Icon />
                                    <Text style={[
                                        styles.providerName,
                                        isSelected && styles.providerNameSelected,
                                    ]}>
                                        {provider.name}
                                    </Text>
                                    <CircularRadio selected={isSelected} />
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.modalButtons}>
                        <TouchableOpacity
                            style={[
                                styles.connectButton,
                                (!localSelection || isConnecting) && styles.connectButtonDisabled,
                            ]}
                            onPress={handleConfirm}
                            disabled={!localSelection || isConnecting}
                            activeOpacity={0.7}
                        >
                            {isConnecting ? (
                                <ActivityIndicator color={DS.cyan} size="small" />
                            ) : (
                                <Text style={[
                                    styles.connectText,
                                    !localSelection && styles.connectTextDisabled,
                                ]}>
                                    Conectar
                                </Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={onClose}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.cancelText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: DS.overlay,
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: DS.bg,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 12,
    },
    handleBar: {
        width: 40,
        height: 4,
        backgroundColor: DS.border,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: DS.text,
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        fontWeight: '400',
        color: DS.textSecondary,
        marginBottom: 24,
    },
    providerList: {
        gap: 10,
        marginBottom: 28,
    },
    providerCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DS.card,
        borderRadius: 15,
        padding: 16,
        borderWidth: 1.5,
        borderColor: 'transparent',
        gap: 14,
    },
    providerCardSelected: {
        borderColor: DS.cyan,
        backgroundColor: DS.cardSelected,
    },
    providerName: {
        flex: 1,
        fontSize: 17,
        fontWeight: '600',
        color: DS.text,
    },
    providerNameSelected: {
        color: DS.cyan,
    },
    modalButtons: {
        gap: 9,
        alignItems: 'center',
    },
    connectButton: {
        width: SCREEN_WIDTH - 48,
        height: 55,
        backgroundColor: DS.cyan,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: DS.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 8,
    },
    connectButtonDisabled: {
        backgroundColor: DS.card,
        shadowOpacity: 0,
        elevation: 0,
    },
    connectText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 18,
        fontWeight: '500',
        color: DS.bg,
    },
    connectTextDisabled: {
        color: DS.textSecondary,
    },
    cancelButton: {
        width: SCREEN_WIDTH - 48,
        height: 55,
        backgroundColor: DS.card,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 18,
        fontWeight: '500',
        color: DS.textSecondary,
    },
});

export default WearableSelectionModal;
