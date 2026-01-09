import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Switch,
    Platform,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../theme';
import { useAuthStore } from '../stores';
import { ScreenContainer } from '../components/ScreenContainer';

// Icon components using @expo/vector-icons
function PersonIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="person" size={size} color={color} />;
}

function PaymentIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="card" size={size} color={color} />;
}

function HistoryIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="history" size={size} color={color} />;
}

// Official Strava icon image
const STRAVA_ICON = require('../assets/images/strava/bi_strava.png');

function StravaIconImage({ size = 36 }: { size?: number }) {
    return (
        <Image
            source={STRAVA_ICON}
            style={{ width: size, height: size }}
            resizeMode="contain"
        />
    );
}

function NotificationIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
    return <Ionicons name="notifications" size={size} color={color} />;
}

function HelpIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
    return <Ionicons name="help-circle" size={size} color={color} />;
}

function LogoutIcon({ size = 24, color = '#FF6B6B' }: { size?: number; color?: string }) {
    return <Ionicons name="log-out" size={size} color={color} />;
}

function ChevronIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="chevron-forward" size={size} color={color} />;
}

function EditIcon({ size = 16, color = '#0A0A18' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="pencil" size={size} color={color} />;
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
        <ScreenContainer>
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

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Integrações</Text>
                    <View style={styles.menuCard}>
                        <View style={[styles.menuItem, { paddingVertical: 16 }]}>
                            <View style={styles.menuItemLeft}>
                                <View style={styles.stravaIconContainer}>
                                    <StravaIconImage size={36} />
                                </View>
                                <View style={styles.stravaTextContainer}>
                                    <Text style={styles.menuItemText}>Strava</Text>
                                    <Text style={styles.stravaConnectedText}>
                                        {isStravaConnected ? `Conectado como ${userName}` : 'Não conectado'}
                                    </Text>
                                </View>
                            </View>
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
        </ScreenContainer>
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
