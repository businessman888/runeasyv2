/**
 * DeviceConnectBody — reusable wearable pre-connection screen body.
 *
 * Renders the hero illustration + title + step bullets + primary action for a
 * given provider, wired to the shared `useWearableConnection` hook. Used in two
 * places:
 *   - Profile (manage mode): `DeviceConnectScreen` route. Connected → the button
 *     becomes "Desconectar".
 *   - Onboarding mode (`onConnected` provided): connecting advances the flow.
 *     Connected → "Continuar".
 *
 * Visual reference: Figma node 1335-1532 (dark sheet, hero, bold title,
 * bulleted steps, light pill CTA).
 */

import React from 'react';
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenContainer } from '../ScreenContainer';
import { colors, fonts, spacing } from '../../theme';
import { WEARABLES, type WearableProvider } from '../../config/wearables.config';
import {
    useWearableConnection,
    formatLastSynced,
} from '../../hooks/useWearableConnection';

const STATUS_CONNECTED = '#4ADE80';
const DANGER = '#FF6B6B';

export interface DeviceConnectBodyProps {
    provider: WearableProvider;
    /** Dismiss the screen (route goBack / close the onboarding overlay). */
    onClose: () => void;
    /**
     * When provided, the screen runs in "onboarding" mode: a successful
     * connection (or tapping "Continuar" when already connected) calls this to
     * advance the flow, instead of exposing a disconnect action.
     */
    onConnected?: () => void;
}

export function DeviceConnectBody({ provider, onClose, onConnected }: DeviceConnectBodyProps) {
    const config = WEARABLES[provider];
    const { status, isConnected, lastSyncedAt, isBusy, connect, disconnect } =
        useWearableConnection(provider);

    const onboardingMode = !!onConnected;

    // Disconnect is only offered in manage mode (Profile).
    const showDisconnect = !onboardingMode && isConnected;

    const buttonLabel = showDisconnect
        ? 'Desconectar'
        : onboardingMode && isConnected
        ? 'Continuar'
        : config.connectLabel;

    const handlePress = async () => {
        if (showDisconnect) {
            disconnect();
            return;
        }
        if (onboardingMode && isConnected) {
            onConnected!();
            return;
        }
        const ok = await connect();
        if (ok && onConnected) onConnected();
    };

    return (
        <ScreenContainer>
            {/* Close (X) */}
            <View style={styles.topBar}>
                <TouchableOpacity
                    style={styles.closeButton}
                    onPress={onClose}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Fechar"
                >
                    <Ionicons name="close" size={26} color={colors.text} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero illustration */}
                <View style={styles.heroWrapper}>
                    <Image source={config.hero} style={styles.hero} resizeMode="contain" />
                </View>

                {/* Title */}
                <Text style={styles.title}>{config.title}</Text>

                {/* Step bullets */}
                <View style={styles.bullets}>
                    {config.bullets.map((bullet, i) => (
                        <View key={i} style={styles.bulletRow}>
                            <View style={styles.bulletDot} />
                            <Text style={styles.bulletText}>{bullet}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.spacer} />

                {/* Connected status (mostrado acima do botão quando já conectado) */}
                {isConnected && (
                    <View style={styles.connectedRow}>
                        <Ionicons name="checkmark-circle" size={16} color={STATUS_CONNECTED} />
                        <Text style={styles.connectedText}>
                            Conectado
                            {lastSyncedAt ? ` · ${formatLastSynced(lastSyncedAt)}` : ''}
                        </Text>
                    </View>
                )}

                {/* Primary action */}
                <TouchableOpacity
                    style={[
                        styles.button,
                        showDisconnect ? styles.buttonDisconnect : styles.buttonConnect,
                        isBusy && styles.buttonDisabled,
                    ]}
                    onPress={handlePress}
                    disabled={isBusy || status === 'unknown'}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`${buttonLabel} ${config.rowLabel}`}
                    accessibilityState={{ busy: isBusy }}
                >
                    {isBusy ? (
                        <ActivityIndicator
                            size="small"
                            color={showDisconnect ? DANGER : colors.background}
                        />
                    ) : (
                        <Text
                            style={[
                                styles.buttonText,
                                showDisconnect ? styles.buttonTextDisconnect : styles.buttonTextConnect,
                            ]}
                        >
                            {buttonLabel}
                        </Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    topBar: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
    },
    closeButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flexGrow: 1,
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.xl,
    },
    heroWrapper: {
        alignItems: 'center',
        marginTop: spacing.sm,
        marginBottom: spacing['2xl'],
    },
    hero: {
        width: 220,
        height: 220,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 26,
        lineHeight: 32,
        color: colors.text,
        textAlign: 'center',
        marginBottom: spacing.xl,
    },
    bullets: {
        gap: spacing.base,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    bulletDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.textSecondary,
        marginTop: 8,
    },
    bulletText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 15,
        lineHeight: 22,
        color: colors.textSecondary,
    },
    spacer: {
        flex: 1,
        minHeight: spacing['2xl'],
    },
    connectedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginBottom: spacing.md,
    },
    connectedText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: colors.textLight,
    },
    button: {
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.sm,
    },
    buttonConnect: {
        backgroundColor: '#F2F2F7',
    },
    buttonDisconnect: {
        backgroundColor: 'rgba(255,107,107,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255,107,107,0.35)',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        fontFamily: fonts.bold,
        fontSize: 16,
    },
    buttonTextConnect: {
        color: '#0A0A18',
    },
    buttonTextDisconnect: {
        color: DANGER,
    },
});

export default DeviceConnectBody;
