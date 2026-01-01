import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    Image,
    Switch,
    Platform,
} from 'react-native';
import { colors, typography, spacing } from '../theme';
import { useAuthStore } from '../stores';

// SVG Icons for Web
function PersonIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>👤</Text>;
}

function PaymentIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M20 4H4C2.89 4 2.01 4.89 2.01 6L2 18C2 19.11 2.89 20 4 20H20C21.11 20 22 19.11 22 18V6C22 4.89 21.11 4 20 4ZM20 18H4V12H20V18ZM20 8H4V6H20V8Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>💳</Text>;
}

function HistoryIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M13 3C8.03 3 4 7.03 4 12H1L4.89 15.89L4.96 16.03L9 12H6C6 8.13 9.13 5 13 5C16.87 5 20 8.13 20 12C20 15.87 16.87 19 13 19C11.07 19 9.32 18.21 8.06 16.94L6.64 18.36C8.27 19.99 10.51 21 13 21C17.97 21 22 16.97 22 12C22 7.03 17.97 3 13 3ZM12 8V13L16.28 15.54L17 14.33L13.5 12.25V8H12Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>🕐</Text>;
}

function StravaIcon({ size = 24 }: { size?: number }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="#FC4C02" />
                <path d="M15.5 18L13.5 14H11L15.5 6L20 14H17.5L15.5 18Z" fill="white" />
                <path d="M13.5 14L15.5 18L17.5 14H13.5Z" fill="#FFEEE6" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🏃</Text>;
}

function NotificationIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>🔔</Text>;
}

function HelpIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 19H11V17H13V19ZM15.07 11.25L14.17 12.17C13.45 12.9 13 13.5 13 15H11V14.5C11 13.4 11.45 12.4 12.17 11.67L13.41 10.41C13.78 10.05 14 9.55 14 9C14 7.9 13.1 7 12 7C10.9 7 10 7.9 10 9H8C8 6.79 9.79 5 12 5C14.21 5 16 6.79 16 9C16 9.88 15.64 10.68 15.07 11.25Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>❓</Text>;
}

function LogoutIcon({ size = 24, color = '#FF6B6B' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M17 7L15.59 8.41L18.17 11H8V13H18.17L15.59 15.58L17 17L22 12L17 7ZM4 5H12V3H4C2.9 3 2 3.9 2 5V19C2 20.1 2.9 21 4 21H12V19H4V5Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>🚪</Text>;
}


function ChevronIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M10 6L8.59 7.41L13.17 12L8.59 16.59L10 18L16 12L10 6Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>›</Text>;
}

function EditIcon({ size = 16, color = '#0A0A18' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M3 17.25V21H6.75L17.81 9.94L14.06 6.19L3 17.25ZM20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C17.98 2.9 17.35 2.9 16.96 3.29L15.13 5.12L18.88 8.87L20.71 7.04Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>✏️</Text>;
}

export function SettingsScreen({ navigation }: any) {
    const { user, logout } = useAuthStore();
    // Use real Strava connection status from user data
    const isStravaConnected = Boolean(user?.strava_athlete_id);

    const handleLogout = async () => {
        await logout();
        navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
        });
    };

    const userName = user?.profile?.firstname
        ? `${user.profile.firstname} ${user.profile.lastname || ''}`
        : 'Alex Runner';

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Configurações da Conta</Text>
                </View>

                {/* Profile Section */}
                <View style={styles.profileSection}>
                    <View style={styles.avatarWrapper}>
                        <View style={styles.avatarContainer}>
                            {user?.profile?.profile_pic && user.profile.profile_pic.startsWith('http') ? (
                                <Image
                                    source={{ uri: user.profile.profile_pic }}
                                    style={styles.avatar}
                                />
                            ) : (
                                <View style={styles.avatarInitials}>
                                    <Text style={styles.initialsText}>
                                        {userName.split(' ').length > 1
                                            ? (userName.split(' ')[0][0] + userName.split(' ')[userName.split(' ').length - 1][0]).toUpperCase()
                                            : userName[0].toUpperCase()}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <TouchableOpacity
                            style={styles.editAvatarButton}
                            onPress={() => navigation.navigate('PersonalInfo')}
                        >
                            <EditIcon size={14} color="#0A0A18" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.userName}>{userName}</Text>
                    <View style={styles.memberBadge}>
                        <Text style={styles.memberBadgeText}>MEMBRO PRO</Text>
                    </View>
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
                                    <PersonIcon size={22} color="#00D4FF" />
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
                                    <HistoryIcon size={22} color="#00D4FF" />
                                </View>
                                <Text style={styles.menuItemText}>Histórico de Treinos</Text>
                            </View>
                            <ChevronIcon size={20} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* INTEGRAÇÕES Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Integrações</Text>
                    <View style={styles.menuCard}>
                        <View style={styles.menuItem}>
                            <View style={styles.menuItemLeft}>
                                <View style={styles.stravaIconContainer}>
                                    <StravaIcon size={36} />
                                </View>
                                <View style={styles.stravaTextContainer}>
                                    <Text style={styles.menuItemText}>Strava</Text>
                                    <Text style={styles.stravaConnectedText}>
                                        {isStravaConnected ? `Conectado como ${userName}` : 'Não conectado'}
                                    </Text>
                                </View>
                            </View>
                            <Switch
                                value={isStravaConnected}
                                onValueChange={() => { }}
                                disabled={true}
                                trackColor={{ false: '#39393D', true: '#00D4FF' }}
                                thumbColor="#FFFFFF"
                            />
                        </View>
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
                                    <NotificationIcon size={22} color="#FFFFFF" />
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
                                    <HelpIcon size={22} color="#FFFFFF" />
                                </View>
                                <Text style={styles.menuItemText}>Ajuda / FAQ</Text>
                            </View>
                            <ChevronIcon size={20} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Logout Button */}
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <LogoutIcon size={20} color="#FF6B6B" />
                    <Text style={styles.logoutText}>Sair da Conta</Text>
                </TouchableOpacity>

                {/* Version */}
                <Text style={styles.versionText}>Versão 2.4.0 (Build 192)</Text>

                <View style={styles.spacer} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0E0E1F',
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
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
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
        borderWidth: 3,
        borderColor: '#00D4FF',
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
        fontSize: 36,
        fontWeight: '600',
        color: '#00D4FF',
        textTransform: 'uppercase',
    },
    editAvatarButton: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#00D4FF',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#0E0E1F',
    },
    userName: {
        fontSize: 22,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: spacing.sm,
    },
    memberBadge: {
        backgroundColor: '#32CD32',
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: 16,
    },
    memberBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    section: {
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.lg,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '500',
        color: 'rgba(235,235,245,0.6)',
        marginBottom: spacing.sm,
        marginLeft: spacing.sm,
    },
    menuCard: {
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
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
        borderRadius: 18,
        backgroundColor: 'rgba(0,212,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    menuItemText: {
        fontSize: 15,
        fontWeight: '500',
        color: '#FFFFFF',
    },
    menuDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginLeft: 60,
    },
    stravaIconContainer: {
        width: 40,
        height: 40,
        marginRight: spacing.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stravaTextContainer: {
        flex: 1,
    },
    stravaConnectedText: {
        fontSize: 12,
        color: '#00D4FF',
        marginTop: 2,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,107,107,0.15)',
        marginHorizontal: spacing.lg,
        paddingVertical: 14,
        borderRadius: 12,
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    logoutText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#FF6B6B',
    },
    versionText: {
        fontSize: 12,
        color: 'rgba(235,235,245,0.4)',
        textAlign: 'center',
        marginTop: spacing.lg,
    },
    spacer: {
        height: 100,
    },
});
