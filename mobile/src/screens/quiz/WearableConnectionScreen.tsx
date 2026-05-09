import React, { useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { WearableSelectionModal } from './WearableSelectionModal';

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
    /** Internal: opens the modal — wired from OnboardingScreen via ref/imperative? */
    openModal?: boolean;
    onModalClose?: () => void;
}

export function WearableConnectionScreen({
    value,
    onChange,
    onConnect,
    openModal,
    onModalClose,
}: WearableConnectionScreenProps) {
    const [modalVisible, setModalVisible] = useState(false);

    // Keep modal in sync with parent-driven prop (OnboardingScreen sends `openModal`
    // when user taps the "Sim" footer button).
    React.useEffect(() => {
        if (openModal) setModalVisible(true);
    }, [openModal]);

    const handleDeviceSelected = (provider: string) => {
        if (onChange) onChange(provider);
        setModalVisible(false);
        if (onModalClose) onModalClose();
        if (onConnect) onConnect();
    };

    const handleModalClose = () => {
        setModalVisible(false);
        if (onModalClose) onModalClose();
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

            <WearableSelectionModal
                visible={modalVisible}
                onClose={handleModalClose}
                onSelect={handleDeviceSelected}
                selectedProvider={value || null}
            />
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
