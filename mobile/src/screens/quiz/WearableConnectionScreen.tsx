import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { WearableSelectionModal } from './WearableSelectionModal';
import {
    toPreferredWearable,
    type WearableProvider,
} from '../../config/wearables.config';
import type { RootStackParamList } from '../../navigation/navigationRef';
import { fonts, useThemeSubscription, createThemeStyles } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

const getLocalThemePalette1 = () => ({
    bg: semanticColors.canvas,
    cyan: semanticColors.accent,
    text: semanticColors.textPrimary,
    textSecondary: semanticColors.textSecondary,
});

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Time for the picker bottom-sheet to finish its slide-out before we present
// the DeviceConnect native modal. Presenting a native modal while an RN Modal
// is still on screen fails silently on iOS — this was the onboarding bug.
const PICKER_DISMISS_MS = 350;



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
    useThemeSubscription();
    const navigation = useNavigation<Nav>();
    const [pickerVisible, setPickerVisible] = useState(false);
    const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep the picker in sync with the parent-driven prop (the "Sim" footer button).
    React.useEffect(() => {
        if (openModal) setPickerVisible(true);
    }, [openModal]);

    React.useEffect(() => {
        return () => {
            if (pickTimer.current) clearTimeout(pickTimer.current);
        };
    }, []);

    const closePicker = () => {
        setPickerVisible(false);
        onModalClose?.();
    };

    // Connection succeeded on the DeviceConnect route → persist the choice and
    // advance the onboarding flow. The route pops itself afterwards.
    const handleConnected = (provider: WearableProvider) => {
        onChange?.(toPreferredWearable(provider));
        onConnect?.();
    };

    // Tapping a device row dismisses the picker, then (after the sheet animates
    // out) pushes the reusable DeviceConnect route — the same one the Profile
    // uses, which presents reliably on iOS (unlike a Modal over a Modal).
    const handlePick = (provider: WearableProvider) => {
        closePicker();
        if (pickTimer.current) clearTimeout(pickTimer.current);
        pickTimer.current = setTimeout(() => {
            navigation.navigate('DeviceConnect', {
                provider,
                onConnected: () => handleConnected(provider),
            });
        }, PICKER_DISMISS_MS);
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

            {/* Device picker (bottom-sheet) — the single Modal in this flow. */}
            <WearableSelectionModal
                visible={pickerVisible}
                onClose={closePicker}
                onPick={handlePick}
            />
        </>
    );
}

const styles = createThemeStyles(() => ({
    titleContainer: {
        marginBottom: 16,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: getLocalThemePalette1().text,
        lineHeight: 36,
        marginBottom: 12,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: getLocalThemePalette1().textSecondary,
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
}));

export default WearableConnectionScreen;
