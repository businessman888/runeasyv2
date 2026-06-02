import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Modal } from 'react-native';

import { WearableSelectionModal } from './WearableSelectionModal';
import { DeviceConnectBody } from '../../components/devices/DeviceConnectBody';
import {
    toPreferredWearable,
    type WearableProvider,
} from '../../config/wearables.config';

const DS = {
    bg: '#0F0F1E',
    cyan: '#00D4FF',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
};

interface WearableConnectionScreenProps {
    value?: string | null;
    onChange?: (value: string | null) => void;
    onConnect?: () => void;
    onSkip?: () => void;
    /** Parent-driven: OnboardingScreen sets this when the user taps "Sim". */
    openModal?: boolean;
    onModalClose?: () => void;
}

export function WearableConnectionScreen({
    onChange,
    onConnect,
    openModal,
    onModalClose,
}: WearableConnectionScreenProps) {
    const [pickerVisible, setPickerVisible] = useState(false);
    const [connectProvider, setConnectProvider] = useState<WearableProvider | null>(null);

    // Keep the picker in sync with the parent-driven prop (the "Sim" footer button).
    React.useEffect(() => {
        if (openModal) setPickerVisible(true);
    }, [openModal]);

    const closePicker = () => {
        setPickerVisible(false);
        onModalClose?.();
    };

    // Tapping a device row opens the reusable config screen over the picker.
    const handlePick = (provider: WearableProvider) => {
        setConnectProvider(provider);
    };

    // Connection succeeded on the config screen → persist the choice, close
    // everything and advance the onboarding flow (handled by `onConnect`).
    const handleConnected = () => {
        if (connectProvider) onChange?.(toPreferredWearable(connectProvider));
        setConnectProvider(null);
        setPickerVisible(false);
        onModalClose?.();
        onConnect?.();
    };

    return (
        <>
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Conectar seu dispositivo{'\n'}de corrida.
                </Text>
                <Text style={styles.subtitle}>
                    Sincronize seu dispositivo Garmin, Polar,{'\n'}
                    Fitbit, Apple Watch para melhorarmos{'\n'}
                    ainda mais a sua experiência.
                </Text>
            </View>

            <View style={styles.illustrationContainer}>
                <Image
                    source={require('../../assets/images/mockupsWatchIphone.png')}
                    style={styles.illustration}
                    resizeMode="contain"
                />
            </View>

            {/* Device picker (bottom-sheet) */}
            <WearableSelectionModal
                visible={pickerVisible}
                onClose={closePicker}
                onPick={handlePick}
            />

            {/* Per-device configuration screen (reused from the Profile). The X
                returns to the picker; a successful connect advances the flow. */}
            <Modal
                visible={!!connectProvider}
                animationType="slide"
                onRequestClose={() => setConnectProvider(null)}
                statusBarTranslucent
            >
                {connectProvider && (
                    <DeviceConnectBody
                        provider={connectProvider}
                        onClose={() => setConnectProvider(null)}
                        onConnected={handleConnected}
                    />
                )}
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 16,
    },
    title: {
        fontFamily: 'Poppins-Bold',
        fontSize: 24,
        fontWeight: '700',
        color: DS.text,
        lineHeight: 36,
        marginBottom: 12,
    },
    subtitle: {
        fontFamily: 'Poppins-Regular',
        fontSize: 15,
        fontWeight: '400',
        color: DS.textSecondary,
        lineHeight: 22.5,
    },
    illustrationContainer: {
        alignItems: 'center',
        marginTop: 12,
    },
    illustration: {
        width: 242,
        height: 371,
    },
});

export default WearableConnectionScreen;
