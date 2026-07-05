import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fonts } from '../../theme';
import {
    referralService,
    ReferralApiError,
    ReferralError,
} from '../../services/referralService';

// Design tokens — exact values from the onboarding Figma frame (node 1307:1485)
const DS = {
    bg: '#0F0F1E',
    pill: '#1C1C2E',
    pillBorder: 'rgba(235, 235, 245, 0.08)',
    pillBorderActive: '#00D4FF',
    pillBorderSuccess: '#10B981',
    pillBorderError: '#EF4444',
    cyan: '#00D4FF',
    cyanMuted: 'rgba(0, 212, 255, 0.35)',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    textMuted: 'rgba(235, 235, 245, 0.4)',
    success: '#10B981',
    successBg: 'rgba(16, 185, 129, 0.12)',
    error: '#EF4444',
    errorBg: 'rgba(239, 68, 68, 0.12)',
};

type Status = 'idle' | 'validating' | 'success' | 'error';

interface ReferralCodeScreenProps {
    referralCode?: string | null;
    referralInfluencerId?: string | null;
    onChange?: (data: {
        referralCode: string | null;
        referralInfluencerId: string | null;
    }) => void;
}

export function ReferralCodeScreen({
    referralCode,
    referralInfluencerId,
    onChange,
}: ReferralCodeScreenProps) {
    const [input, setInput] = useState(referralCode ?? '');
    const [status, setStatus] = useState<Status>(
        referralCode && referralInfluencerId ? 'success' : 'idle',
    );
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [influencerName, setInfluencerName] = useState<string>('');

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        // Rehydrate UI if the parent already has a saved code (e.g. user comes back).
        if (referralCode && referralInfluencerId && status === 'idle') {
            setInput(referralCode);
            setStatus('success');
            setStatusMessage('Código aplicado!');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const canSubmit = input.trim().length >= 2 && status !== 'validating' && status !== 'success';

    const handleSubmit = useCallback(async () => {
        const code = input.trim();
        if (code.length < 2) return;

        setStatus('validating');
        setStatusMessage('');

        try {
            const validation = await referralService.validate(code);
            if (!validation.valid) {
                setStatus('error');
                setStatusMessage(validation.message ?? 'Código não encontrado');
                return;
            }

            const result = await referralService.apply(code);

            setStatus('success');
            setInfluencerName(validation.influencer_name ?? '');
            setStatusMessage(
                validation.influencer_name
                    ? `Código aplicado! Indicado por ${validation.influencer_name}`
                    : 'Código aplicado!',
            );
            onChangeRef.current?.({
                referralCode: code.toUpperCase(),
                referralInfluencerId: result.influencer_id,
            });
        } catch (err) {
            setStatus('error');
            if (err instanceof ReferralApiError) {
                if (err.code === ReferralError.ALREADY_APPLIED) {
                    setStatusMessage('Você já usou um código de indicação');
                } else if (err.code === ReferralError.RATE_LIMITED) {
                    setStatusMessage('Muitas tentativas. Tente novamente mais tarde.');
                } else if (err.code === ReferralError.NETWORK) {
                    setStatusMessage('Sem conexão. Tente novamente.');
                } else {
                    setStatusMessage(err.message || 'Código não encontrado');
                }
            } else {
                setStatusMessage('Não foi possível validar agora');
            }
        }
    }, [input]);

    const handleInputChange = (text: string) => {
        // Auto-uppercase, allow alphanumerics + dash/underscore matching backend regex.
        const cleaned = text.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
        setInput(cleaned);
        if (status !== 'idle') {
            setStatus('idle');
            setStatusMessage('');
            // Clearing the previously applied code in the parent so the user can
            // re-submit a different code if they want to.
            if (referralInfluencerId) {
                onChangeRef.current?.({
                    referralCode: null,
                    referralInfluencerId: null,
                });
            }
        }
    };

    const pillBorderColor =
        status === 'success'
            ? DS.pillBorderSuccess
            : status === 'error'
            ? DS.pillBorderError
            : input.length > 0
            ? DS.pillBorderActive
            : DS.pillBorder;

    return (
        <View style={styles.container}>
            <View style={styles.titleContainer}>
                <Text style={styles.title}>Tem um código de{'\n'}indicação?</Text>
                <Text style={styles.subtitle}>
                    Veio pela indicação de um criador? Insira o código dele aqui.
                </Text>
            </View>

            <View style={styles.giftIconContainer}>
                <View style={styles.giftIconCircle}>
                    <MaterialCommunityIcons name="account-heart-outline" size={36} color={DS.cyan} />
                </View>
            </View>

            <View style={[styles.pill, { borderColor: pillBorderColor }]}>
                <TextInput
                    style={styles.input}
                    placeholder="Código de referência"
                    placeholderTextColor={DS.textMuted}
                    value={input}
                    onChangeText={handleInputChange}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={30}
                    editable={status !== 'validating' && status !== 'success'}
                    accessibilityLabel="Código de referência"
                    accessibilityHint="Digite o código do seu indicador, em letras e números"
                />
                <TouchableOpacity
                    style={[
                        styles.sendButton,
                        !canSubmit && styles.sendButtonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={!canSubmit}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Enviar código"
                    accessibilityState={{ disabled: !canSubmit, busy: status === 'validating' }}
                >
                    {status === 'validating' ? (
                        <ActivityIndicator size="small" color={DS.text} />
                    ) : (
                        <Text
                            style={[
                                styles.sendButtonText,
                                !canSubmit && styles.sendButtonTextDisabled,
                            ]}
                        >
                            Enviar
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            {status === 'success' && (
                <View style={[styles.badge, styles.badgeSuccess]}>
                    <MaterialCommunityIcons name="check-circle" size={18} color={DS.success} />
                    <Text style={[styles.badgeText, { color: DS.success }]}>
                        {statusMessage}
                    </Text>
                </View>
            )}

            {status === 'error' && (
                <View style={[styles.badge, styles.badgeError]}>
                    <MaterialCommunityIcons name="alert-circle" size={18} color={DS.error} />
                    <Text style={[styles.badgeText, { color: DS.error }]}>
                        {statusMessage}
                    </Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        gap: 24,
    },
    titleContainer: {
        gap: 12,
        marginTop: 12,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 32,
        lineHeight: 38,
        color: DS.text,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 16,
        lineHeight: 22,
        color: DS.textSecondary,
    },
    giftIconContainer: {
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 4,
    },
    giftIconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(0, 212, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DS.pill,
        borderRadius: 32,
        borderWidth: 1,
        paddingLeft: 20,
        paddingRight: 6,
        height: 60,
    },
    input: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: 16,
        color: DS.text,
        letterSpacing: 1,
        ...Platform.select({
            android: { paddingVertical: 0 },
        }),
    },
    sendButton: {
        height: 48,
        paddingHorizontal: 20,
        borderRadius: 24,
        backgroundColor: DS.cyan,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 96,
    },
    sendButtonDisabled: {
        backgroundColor: 'rgba(28, 28, 46, 0.8)',
    },
    sendButtonText: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        color: '#0F0F1E',
    },
    sendButtonTextDisabled: {
        color: DS.textMuted,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
    },
    badgeSuccess: {
        backgroundColor: DS.successBg,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.35)',
    },
    badgeError: {
        backgroundColor: DS.errorBg,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.35)',
    },
    badgeText: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: 13,
    },
});
