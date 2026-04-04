import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
} from 'react-native';
import { WearableSelectionModal } from './WearableSelectionModal';

// Design System Colors (Figma node 867-645 + 867-648)
const DS = {
    bg: '#0F0F1E',
    card: '#15152A',
    cardSecondary: '#1C1C2E',
    cyan: '#00D4FF',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
};

interface WearableConnectionScreenProps {
    value?: string | null;
    onChange?: (value: string | null) => void;
    onConnect?: () => void;
    onSkip?: () => void;
}

export function WearableConnectionScreen({
    value,
    onChange,
    onConnect,
    onSkip,
}: WearableConnectionScreenProps) {
    const [modalVisible, setModalVisible] = useState(false);

    const handleContinue = () => {
        setModalVisible(true);
    };

    const handleSkip = () => {
        if (onChange) onChange(null);
        if (onSkip) onSkip();
    };

    const handleDeviceSelected = (provider: string) => {
        if (onChange) onChange(provider);
        setModalVisible(false);
        if (onConnect) onConnect();
    };

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Conectar seu dispositivo{'\n'}
                    <Text style={styles.titleHighlight}>de corrida</Text>.
                </Text>
                <Text style={styles.subtitle}>
                    Sincronize seu dispositivo Garmin, Polar,{'\n'}
                    Fitbit, Apple Watch para melhorarmos{'\n'}
                    ainda mais a sua experiência.
                </Text>
            </View>

            {/* Wearable Illustration */}
            <View style={styles.illustrationContainer}>
                <Image
                    source={require('../../assets/images/wearable_screen_full.png')}
                    style={styles.illustration}
                    resizeMode="contain"
                />
            </View>

            {/* Action Buttons (Figma node 867-648, Variant4 of bottonFixed) */}
            <View style={styles.buttonsContainer}>
                {/* "Continuar" - Opens device selection modal */}
                <TouchableOpacity
                    style={styles.continueButton}
                    onPress={handleContinue}
                    activeOpacity={0.7}
                >
                    <Text style={styles.continueText}>Continuar</Text>
                </TouchableOpacity>

                {/* "Nao obrigado" - Skips this step */}
                <TouchableOpacity
                    style={styles.skipButton}
                    onPress={handleSkip}
                    activeOpacity={0.7}
                >
                    <Text style={styles.skipText}>Não obrigado</Text>
                </TouchableOpacity>
            </View>

            {/* Device Selection Modal */}
            <WearableSelectionModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                onSelect={handleDeviceSelected}
                selectedProvider={value || null}
            />
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: DS.text,
        lineHeight: 36,
        marginBottom: 12,
    },
    titleHighlight: {
        color: DS.cyan,
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '400',
        color: DS.textSecondary,
        lineHeight: 22.5,
    },
    illustrationContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    illustration: {
        width: 300,
        height: 310,
    },
    buttonsContainer: {
        alignItems: 'center',
        gap: 9,
        paddingHorizontal: 0,
    },
    continueButton: {
        width: 333,
        height: 55,
        backgroundColor: DS.card,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        // Shadow (Figma: 2px 2px 4px rgba(0,0,0,0.25))
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    continueText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 18,
        fontWeight: '500',
        color: DS.cyan,
    },
    skipButton: {
        width: 333,
        height: 55,
        backgroundColor: DS.cardSecondary,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    skipText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 18,
        fontWeight: '500',
        color: DS.textSecondary,
    },
});

export default WearableConnectionScreen;
