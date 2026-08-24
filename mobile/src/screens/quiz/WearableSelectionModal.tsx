/**
 * WearableSelectionModal — device picker bottom-sheet (onboarding).
 *
 * Clean/minimal sheet that lists the supported wearables as brand-logo rows
 * (the same `DeviceRow` used in the Profile). There are no connect/cancel
 * buttons: tapping a row hands the chosen provider back via `onPick`, and the
 * parent (`WearableConnectionScreen`) opens the reusable `DeviceConnectBody`
 * configuration screen. All connection logic now lives in
 * `useWearableConnection` — this component is purely presentational.
 */

import React from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, spacing, borderRadius, createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { DeviceRow } from '../../components/devices/DeviceRow';
import {
    ONBOARDING_WEARABLE_ORDER,
    type WearableProvider,
} from '../../config/wearables.config';

interface WearableSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onPick: (provider: WearableProvider) => void;
}

export function WearableSelectionModal({
    visible,
    onClose,
    onPick,
}: WearableSelectionModalProps) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                {/* Inner pressable absorbs taps so they don't dismiss the sheet. */}
                <Pressable
                    style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm }]}
                    onPress={() => {}}
                >
                    <View style={styles.handleBar} />

                    <View style={styles.header}>
                        <View style={styles.headerText}>
                            <Text style={styles.title}>Escolha seu dispositivo</Text>
                            <Text style={styles.subtitle}>
                                Selecione o dispositivo que você usa para correr.
                            </Text>
                        </View>
                        <Pressable
                            onPress={onClose}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel="Fechar"
                            style={styles.closeButton}
                        >
                            <Ionicons name="close" size={22} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    <ScrollView
                        style={styles.list}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {ONBOARDING_WEARABLE_ORDER.map((provider) => (
                            <DeviceRow
                                key={provider}
                                provider={provider}
                                connectedStatusOnly
                                onPress={() => onPick(provider)}
                            />
                        ))}
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = createThemeStyles(() => ({
    overlay: {
        flex: 1,
        backgroundColor: semanticColors.scrim,
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: semanticColors.surface1,
        borderTopLeftRadius: borderRadius['2xl'],
        borderTopRightRadius: borderRadius['2xl'],
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
    },
    handleBar: {
        width: 40,
        height: 4,
        backgroundColor: semanticColors.borderStrong,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: spacing.lg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: spacing.lg,
    },
    headerText: {
        flex: 1,
        paddingRight: spacing.md,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 20,
        color: semanticColors.textPrimary,
        marginBottom: 4,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 13.5,
        color: semanticColors.textSecondary,
        lineHeight: 19,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: semanticColors.glass,
        alignItems: 'center',
        justifyContent: 'center',
    },
    list: {
        maxHeight: 380,
    },
    listContent: {
        gap: 10,
    },
}));

export default WearableSelectionModal;
