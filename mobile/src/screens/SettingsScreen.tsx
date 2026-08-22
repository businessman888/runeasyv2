import React, { useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    Pressable,
    Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fonts, borderRadius } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { useAuthStore, useTrialModalStore, getDisplayName, getAvatarUrl } from '../stores';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { useCoachStore } from '../stores/coachStore';
import { useProFeature } from '../hooks/useProFeature';
import { ScreenContainer } from '../components/ScreenContainer';
import { AppIcon } from '../components/ui/AppIcon';
import { AppPressable } from '../components/ui/AppPressable';
import { Skeleton } from '../components/Skeleton';
import { DeviceRow } from '../components/devices/DeviceRow';
import { WEARABLE_ORDER } from '../config/wearables.config';

// Initials from the user's real name — shown inside the avatar circle when the
// user has no profile photo (Apple/Google login without a picture), until they
// set one in "editar perfil". Crash-safe (never indexes undefined), but it does
// NOT invent placeholder data: returns '' when there's genuinely no name, so the
// circle simply stays empty rather than showing mock text like '?'.
function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '';
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function SettingsScreen({ navigation }: any) {
    const { user, logout } = useAuthStore();
    const coachEnabled = useCoachStore((s) => s.enabled);

    // One-time (per app open) "Iniciar Teste Grátis" promo — Free only, and only
    // once the subscription has resolved (avoids flashing it to a Pro user).
    const { isProUser, openUpgrade } = useProFeature();
    const trialIsLoading = useSubscriptionStore((s) => s.isLoading);
    useFocusEffect(
        useCallback(() => {
            if (!isProUser && !trialIsLoading) useTrialModalStore.getState().show();
        }, [isProUser, trialIsLoading])
    );

    // Secret gesture: 5 taps on the header opens DevMenu (dev/preview only).
    // Ships as no-op in production via __DEV__ guard at navigation registration.
    const tapCountRef = useRef(0);
    const lastTapAtRef = useRef(0);
    const handleHeaderTap = () => {
        if (!__DEV__) return;
        const now = Date.now();
        if (now - lastTapAtRef.current > 2000) {
            tapCountRef.current = 0;
        }
        lastTapAtRef.current = now;
        tapCountRef.current += 1;
        if (tapCountRef.current >= 5) {
            tapCountRef.current = 0;
            navigation.navigate('DevMenu');
        }
    };

    const handleLogout = async () => {
        await logout();
        navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
        });
    };

    const userName = getDisplayName(user);
    const initials = getInitials(userName);

    return (
        <ScreenContainer centered style={styles.screen}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <Pressable onPress={handleHeaderTap} style={styles.header} hitSlop={4}>
                    <Text style={styles.headerTitle}>Conta</Text>
                </Pressable>

                {/* Profile Section */}
                <View style={styles.profileSection}>
                    <View style={styles.avatarWrapper}>
                        <View style={styles.avatarContainer}>
                            {getAvatarUrl(user) ? (
                                <Image
                                    source={{ uri: getAvatarUrl(user)! }}
                                    style={styles.avatar}
                                />
                            ) : (
                                <View style={styles.avatarInitials}>
                                    <Text style={styles.initialsText}>{initials}</Text>
                                </View>
                            )}
                        </View>
                        <AppPressable
                            style={styles.editAvatarButton}
                            interactionScale="icon"
                            onPress={() => navigation.navigate('PersonalInfo')}
                            accessibilityRole="button"
                            accessibilityLabel="Editar perfil"
                        >
                            <AppIcon name="edit" size={16} tone="primary" variant="filled" />
                        </AppPressable>
                    </View>
                    <Text style={styles.userName}>{userName}</Text>

                    {/* Pro/Free tag — lógica real via subscriptionStore (useProFeature).
                        Skeleton enquanto a assinatura resolve, evitando o flash Free→Pro. */}
                    {trialIsLoading ? (
                        <Skeleton width={120} height={26} borderRadius={13} style={{ marginTop: spacing.sm }} />
                    ) : isProUser ? (
                        <View style={styles.badgePro}>
                            <AppIcon name="shieldCheck" size={16} tone="accent" variant="filled" />
                            <Text style={styles.badgeProText}>MEMBRO PRO</Text>
                        </View>
                    ) : (
                        <AppPressable
                            style={styles.badgeFree}
                            interactionScale="button"
                            onPress={openUpgrade}
                            accessibilityRole="button"
                            accessibilityLabel="Plano grátis, tocar para fazer upgrade"
                        >
                            <Text style={styles.badgeFreeText}>PLANO GRÁTIS</Text>
                            <AppIcon name="chevronForward" size={16} tone="secondary" />
                        </AppPressable>
                    )}
                </View>

                {/* CONTA Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>CONTA</Text>
                    <View style={styles.menuCard}>
                        <AppPressable
                            style={styles.menuItem}
                            interactionScale="card"
                            onPress={() => navigation.navigate('PersonalInfo')}
                        >
                            <View style={styles.menuItemLeft}>
                                <View style={styles.menuIconContainer}>
                                    <AppIcon name="profile" size={20} tone="primary" />
                                </View>
                                <Text style={styles.menuItemText}>Informações Pessoais</Text>
                            </View>
                            <AppIcon name="chevronForward" size={20} tone="secondary" />
                        </AppPressable>

                        <View style={styles.menuDivider} />

                        <AppPressable
                            style={styles.menuItem}
                            interactionScale="card"
                            onPress={() => navigation.navigate('TrainingHistory')}
                        >
                            <View style={styles.menuItemLeft}>
                                <View style={styles.menuIconContainer}>
                                    <AppIcon name="history" size={20} tone="primary" />
                                </View>
                                <Text style={styles.menuItemText}>Histórico de Treinos</Text>
                            </View>
                            <AppIcon name="chevronForward" size={20} tone="secondary" />
                        </AppPressable>
                    </View>
                </View>

                {/* DISPOSITIVOS Section
                    DeviceRow trata o gating de plataforma internamente (Apple só iOS,
                    Galaxy/Health Connect só Android), então listamos todos os providers
                    e cada um se esconde onde não se aplica. */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>DISPOSITIVOS</Text>
                    <View style={{ gap: 10 }}>
                        {WEARABLE_ORDER.map((provider) => (
                            <DeviceRow key={provider} provider={provider} />
                        ))}
                    </View>
                </View>

                {/* PREFERÊNCIAS Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>PREFERÊNCIAS</Text>
                    <View style={styles.menuCard}>
                        {/* Coach de áudio — mesmo padrão de linha (replicado, não há
                            componente compartilhado). Mostra o estado atual à direita. */}
                        <AppPressable
                            style={styles.menuItem}
                            interactionScale="card"
                            onPress={() => navigation.navigate('CoachAudioSettings')}
                            accessibilityRole="button"
                            accessibilityLabel={`Coach de áudio, ${coachEnabled ? 'ligado' : 'desligado'}`}
                        >
                            <View style={styles.menuItemLeft}>
                                <View style={styles.menuIconContainer}>
                                    <AppIcon name="headset" size={20} tone="primary" />
                                </View>
                                <Text style={styles.menuItemText}>Coach de Áudio</Text>
                            </View>
                            <View style={styles.menuItemRight}>
                                <Text style={[styles.stateLabel, coachEnabled && styles.stateLabelOn]}>
                                    {coachEnabled ? 'Ligado' : 'Desligado'}
                                </Text>
                                <AppIcon name="chevronForward" size={20} tone="secondary" />
                            </View>
                        </AppPressable>

                        <View style={styles.menuDivider} />

                        <AppPressable
                            style={styles.menuItem}
                            interactionScale="card"
                            onPress={() => navigation.navigate('NotificationSettings')}
                        >
                            <View style={styles.menuItemLeft}>
                                <View style={styles.menuIconContainer}>
                                    <AppIcon name="notification" size={20} tone="primary" />
                                </View>
                                <Text style={styles.menuItemText}>Notificações</Text>
                            </View>
                            <AppIcon name="chevronForward" size={20} tone="secondary" />
                        </AppPressable>

                        <View style={styles.menuDivider} />

                        <AppPressable
                            style={styles.menuItem}
                            interactionScale="card"
                            onPress={() => navigation.navigate('Help')}
                        >
                            <View style={styles.menuItemLeft}>
                                <View style={styles.menuIconContainer}>
                                    <AppIcon name="help" size={20} tone="primary" />
                                </View>
                                <Text style={styles.menuItemText}>Ajuda / FAQ</Text>
                            </View>
                            <AppIcon name="chevronForward" size={20} tone="secondary" />
                        </AppPressable>
                    </View>
                </View>

                {/* Excluir Conta — card isolado (requisito de loja), antes do logout */}
                <View style={styles.section}>
                    <View style={styles.menuCard}>
                        <AppPressable
                            style={styles.menuItem}
                            interactionScale="card"
                            onPress={() => Linking.openURL('https://runeasy.com.br/excluir-conta')}
                            accessibilityRole="button"
                            accessibilityLabel="Excluir conta"
                        >
                            <View style={styles.menuItemLeft}>
                                <View style={styles.menuIconContainer}>
                                    <AppIcon name="delete" size={20} tone="danger" />
                                </View>
                                <Text style={[styles.menuItemText, { color: colors.error }]}>Excluir Conta</Text>
                            </View>
                            <AppIcon name="chevronForward" size={20} tone="secondary" />
                        </AppPressable>
                    </View>
                </View>

                {/* Logout Button */}
                <AppPressable style={styles.logoutButton} onPress={handleLogout}>
                    <AppIcon name="logout" size={20} tone="danger" />
                    <Text style={styles.logoutText}>Sair da Conta</Text>
                </AppPressable>

                {/* Version */}
                <Text style={styles.versionText}>Versão 2.4.0 (Build 192)</Text>

                <View style={styles.spacer} />
            </ScrollView>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    screen: {
        backgroundColor: semanticColors.canvas,
    },
    scrollView: {
        flex: 1,
    },
    header: {
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
    },
    headerTitle: {
        fontFamily: fonts.semibold,
        fontSize: 18,
        color: semanticColors.textPrimary,
    },
    profileSection: {
        alignItems: 'center',
        paddingVertical: spacing.lg,
    },
    avatarWrapper: {
        position: 'relative',
        width: 100,
        height: 100,
        marginBottom: spacing.md,
    },
    avatarContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 2,
        borderColor: semanticColors.borderStrong,
        overflow: 'hidden',
        marginBottom: spacing.md,
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    avatarInitials: {
        width: '100%',
        height: '100%',
        backgroundColor: semanticColors.surface3,
        justifyContent: 'center',
        alignItems: 'center',
    },
    initialsText: {
        fontFamily: fonts.semibold,
        fontSize: 36,
        color: semanticColors.textPrimary,
        textTransform: 'uppercase',
    },
    editAvatarButton: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: semanticColors.surface3,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: semanticColors.canvas,
    },
    userName: {
        fontFamily: fonts.bold,
        fontSize: 22,
        color: semanticColors.textPrimary,
        marginBottom: spacing.sm,
    },
    badgePro: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(0,212,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(0,212,255,0.30)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
    },
    badgeProText: {
        fontFamily: fonts.bold,
        fontSize: 11,
        color: colors.primary,
        letterSpacing: 0.5,
    },
    badgeFree: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: semanticColors.glass,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
    },
    badgeFreeText: {
        fontFamily: fonts.semibold,
        fontSize: 11,
        color: semanticColors.textSecondary,
        letterSpacing: 0.5,
    },
    section: {
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.lg,
    },
    sectionTitle: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: semanticColors.textSecondary,
        letterSpacing: 0.6,
        marginBottom: spacing.sm,
        marginLeft: spacing.sm,
    },
    menuCard: {
        backgroundColor: semanticColors.surface2,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: spacing.md,
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    menuIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: semanticColors.surface3,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    menuItemText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: semanticColors.textPrimary,
    },
    menuItemRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    stateLabel: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: semanticColors.textSecondary,
    },
    stateLabelOn: {
        color: colors.primary,
    },
    menuDivider: {
        height: 1,
        backgroundColor: semanticColors.borderSubtle,
        marginLeft: 60,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.dangerSubtle,
        marginHorizontal: spacing.lg,
        paddingVertical: 14,
        borderRadius: 12,
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    logoutText: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        color: colors.error,
    },
    versionText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: semanticColors.textTertiary,
        textAlign: 'center',
        marginTop: spacing.lg,
    },
    spacer: {
        height: 100,
    },
});
