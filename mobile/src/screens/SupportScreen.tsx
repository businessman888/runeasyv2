import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../theme';
import { ScreenContainer } from '../components/ScreenContainer';

const SUPPORT_EMAIL = 'contato@oyto.com.br';

export function SupportScreen({ navigation }: any) {
    const handleEmailPress = () => {
        Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
    };

    return (
        <ScreenContainer>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                    accessibilityRole="button"
                    accessibilityLabel="Voltar"
                >
                    <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Falar com Suporte</Text>
                <View style={styles.headerSpacer} />
            </View>

            <View style={styles.content}>
                {/* Icon */}
                <View style={styles.iconContainer}>
                    <Ionicons name="headset-outline" size={56} color="#00D4FF" />
                </View>

                {/* Title */}
                <Text style={styles.title}>Estamos aqui para ajudar</Text>
                <Text style={styles.description}>
                    Nosso suporte é realizado via e-mail. Envie sua dúvida ou problema e nossa equipe retornará o mais breve possível.
                </Text>

                {/* Email Card */}
                <View style={styles.emailCard}>
                    <View style={styles.emailIconWrapper}>
                        <Ionicons name="mail-outline" size={24} color="#00D4FF" />
                    </View>
                    <View style={styles.emailInfo}>
                        <Text style={styles.emailLabel}>E-mail de suporte</Text>
                        <Text style={styles.emailAddress}>{SUPPORT_EMAIL}</Text>
                    </View>
                </View>

                {/* CTA Button */}
                <TouchableOpacity
                    style={styles.emailButton}
                    onPress={handleEmailPress}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Enviar e-mail para ${SUPPORT_EMAIL}`}
                >
                    <Ionicons name="send-outline" size={18} color="#0A0A18" />
                    <Text style={styles.emailButtonText}>Enviar E-mail</Text>
                </TouchableOpacity>

                <Text style={styles.hint}>
                    Ao tocar em "Enviar E-mail", seu aplicativo de e-mail será aberto automaticamente.
                </Text>
            </View>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    headerSpacer: {
        width: 40,
    },
    content: {
        flex: 1,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
        alignItems: 'center',
    },
    iconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(0,212,255,0.12)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.xl,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    description: {
        fontSize: 14,
        fontWeight: '400',
        color: 'rgba(235,235,245,0.6)',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: spacing.xl,
        paddingHorizontal: spacing.md,
    },
    emailCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,212,255,0.2)',
        padding: spacing.lg,
        width: '100%',
        marginBottom: spacing.xl,
        gap: spacing.md,
    },
    emailIconWrapper: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,212,255,0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    emailInfo: {
        flex: 1,
    },
    emailLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(235,235,245,0.5)',
        marginBottom: 2,
    },
    emailAddress: {
        fontSize: 15,
        fontWeight: '600',
        color: '#00D4FF',
    },
    emailButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#00D4FF',
        borderRadius: 16,
        paddingVertical: 14,
        width: '100%',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    emailButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0A0A18',
    },
    hint: {
        fontSize: 12,
        color: 'rgba(235,235,245,0.35)',
        textAlign: 'center',
        lineHeight: 18,
        paddingHorizontal: spacing.md,
    },
});
