import React, { useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, spacing, fonts, borderRadius } from '../theme';
import { useAuthStore, useTrialModalStore, getDisplayName, getAvatarUrl } from '../stores';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { useProFeature } from '../hooks/useProFeature';
import { ScreenContainer } from '../components/ScreenContainer';
import { DeviceRow } from '../components/devices/DeviceRow';
import { WEARABLE_ORDER } from '../config/wearables.config';

// Safe initials from a display name. Guards every step: a brand-new user (e.g.
// a freshly-created staging account) has no name yet, so getDisplayName returns
// '' — accessing name[0] then yields undefined and .toUpperCase() crashes the
// whole screen. Returns '?' when there's nothing to derive from.
function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Icon components using @expo/vector-icons. Nav icons are neutral (não-CTA):
// o cyan fica reservado para ações primárias (botão de editar avatar, badge Pro).
function PersonIcon({ size = 22, color = colors.textLight }: { size?: number; color?: string }) {
    return <Ionicons name="person" size={size} color={color} />;
}

function HistoryIcon({ size = 22, color = colors.textLight }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="history" size={size} color={color} />;
}

function NotificationIcon({ size = 22, color = colors.textLight }: { size?: number; color?: string }) {
    return <Ionicons name="notifications" size={size} color={color} />;
}

function HelpIcon({ size = 22, color = colors.textLight }: { size?: number; color?: string }) {
    return <Ionicons name="help-circle" size={size} color={color} />;
}

function ChevronIcon({ size = 20, color = colors.textSecondary }: { size?: number; color?: string }) {
    return <Ionicons name="chevron-forward" size={size} color={color} />;
}

function EditIcon({ size = 14, color = '#0A0A18' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="pencil" size={size} color={color} />;
}

export function SettingsScreen({ navigation }: any) {
    const { user, logout } = useAuthStore();

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

    const userName = getDisplayName(user) || 'Corredor';
    const initials = getInitials(userName);

    return (
        <ScreenContainer>
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
                        <TouchableOpacity
                            style={styles.editAvatarButton}
                            onPress={() => navigation.navigate('PersonalInfo')}
                            accessibilityRole="button"
                            accessibilityLabel="Editar perfil"
                        >
                            <EditIcon size={14} color="#0A0A18" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.userName}>{userName}</Text>

                    {/* Pro/Free tag — lógica real via subscriptionStore (useProFeature) */}
                    {isProUser ? (
                        <View style={styles.badgePro}>
                            <Ionicons name="shield-checkmark" size={13} color={colors.primary} />
                            <Text style={styles.badgeProText}>MEMBRO PRO</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={styles.badgeFree}
                            onPress={openUpgrade}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="Plano grátis, tocar para fazer upgrade"
                        >
                            <Text style={styles.badgeFreeText}>PLANO GRÁTIS</Text>
                            <Ionicons name="chevron-forward" size={13} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* CONTA Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>CONTA</Text>
                    <View style={styles.menuCard}>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => navigation.navigate('PersonalInfo')}
                        >
                            <View style={styles.menuItemLeft}>
                                <View style={styles.menuIconContainer}>
                                    <PersonIcon size={20} />
                                </View>
                                <Text style={styles.menuItemText}>Informações Pessoais</Text>
                            </View>
                            <ChevronIcon size={20} />
                        </TouchableOpacity>

                        <View style={styles.menuDivider} />

                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => navigation.navigate('TrainingHistory')}
                        >
                            <View style={styles.menuItemLeft}>
                                <View style={styles.menuIconContainer}>
                                    <HistoryIcon size={20} />
                                </View>
                                <Text style={styles.menuItemText}>Histórico de Treinos</Text>
                            </View>
                            <ChevronIcon size={20} />
                        </TouchableOpacity>
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
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => navigation.navigate('NotificationSettings')}
                        >
                            <View style={styles.menuItemLeft}>
                                <View style={styles.menuIconContainer}>
                                    <NotificationIcon size={20} />
                                </View>
                                <Text style={styles.menuItemText}>Notificações</Text>
                            </View>
                            <ChevronIcon size={20} />
                        </TouchableOpacity>

                        <View style={styles.menuDivider} />

                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => navigation.navigate('Help')}
                        >
                            <View style={styles.menuItemLeft}>
                                <View style={styles.menuIconContainer}>
                                    <HelpIcon size={20} />
                                </View>
                                <Text style={styles.menuItemText}>Ajuda / FAQ</Text>
                            </View>
                            <ChevronIcon size={20} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Logout Button */}
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={20} color={colors.error} />
                    <Text style={styles.logoutText}>Sair da Conta</Text>
                </TouchableOpacity>

                {/* Version */}
                <Text style={styles.versionText}>Versão 2.4.0 (Build 192)</Text>

                <View style={styles.spacer} />
            </ScrollView>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
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
        color: colors.text,
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
        borderColor: 'rgba(255,255,255,0.12)',
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
        backgroundColor: '#1C1C2E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    initialsText: {
        fontFamily: fonts.semibold,
        fontSize: 36,
        color: colors.textLight,
        textTransform: 'uppercase',
    },
    editAvatarButton: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#0A0A18',
    },
    userName: {
        fontFamily: fonts.bold,
        fontSize: 22,
        color: colors.text,
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
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
    },
    badgeFreeText: {
        fontFamily: fonts.semibold,
        fontSize: 11,
        color: colors.textSecondary,
        letterSpacing: 0.5,
    },
    section: {
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.lg,
    },
    sectionTitle: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: colors.textSecondary,
        letterSpacing: 0.6,
        marginBottom: spacing.sm,
        marginLeft: spacing.sm,
    },
    menuCard: {
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
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
        backgroundColor: 'rgba(255,255,255,0.06)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    menuItemText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: colors.text,
    },
    menuDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginLeft: 60,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(239,68,68,0.10)',
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
        color: 'rgba(235,235,245,0.4)',
        textAlign: 'center',
        marginTop: spacing.lg,
    },
    spacer: {
        height: 100,
    },
});
