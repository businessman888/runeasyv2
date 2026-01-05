import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    Platform,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../theme';
import { useGamificationStore } from '../stores';

// Icon components using @expo/vector-icons
function BackIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="chevron-back" size={size} color={color} />;
}

function BoltIcon({ size = 20, color = '#00FF88' }: { size?: number; color?: string }) {
    return <Ionicons name="flash" size={size} color={color} />;
}

function FireIcon({ size = 20, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="fire" size={size} color={color} />;
}

function TrophyIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="trophy" size={size} color={color} />;
}

// Badge Icon using MaterialCommunityIcons
function BadgeIcon({ icon, size = 65, color = '#00D4FF' }: { icon: string; size?: number; color?: string }) {
    const iconMap: Record<string, string> = {
        'medal': 'medal',
        'speedometer': 'speedometer',
        'sun': 'weather-sunny',
        'flame': 'fire',
    };
    const iconName = iconMap[icon] || 'medal';
    return (
        <View style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: '#0E0E1F',
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 2,
            borderColor: color,
        }}>
            <MaterialCommunityIcons name={iconName as any} size={size * 0.5} color={color} />
        </View>
    );
}

function LockIcon({ size = 24, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="lock-closed" size={size} color={color} />;
}


// renderBadgeIcon using MaterialCommunityIcons
const renderBadgeIcon = (iconName: string, earned: boolean, color: string = '#00D4FF') => {
    const size = 65;
    const iconMap: Record<string, string> = {
        'medal': 'medal',
        'speedometer': 'speedometer',
        'sun': 'weather-sunny',
        'flame': 'fire',
    };
    const mappedIcon = iconMap[iconName] || 'medal';
    return (
        <View style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: '#0E0E1F',
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 2,
            borderColor: earned ? color : 'rgba(235,235,245,0.3)',
            opacity: earned ? 1 : 0.5,
        }}>
            <MaterialCommunityIcons
                name={mappedIcon as any}
                size={size * 0.5}
                color={earned ? color : 'rgba(235,235,245,0.3)'}
            />
        </View>
    );
};

export function BadgesScreen({ navigation }: any) {
    const { badges, stats, fetchBadges, fetchStats, isLoading } = useGamificationStore();

    React.useEffect(() => {
        fetchBadges();
        fetchStats();
    }, []);

    // Map badge names to display info (using REAL names from database)
    const getBadgeDisplayInfo = (badge: any) => {
        const nameMap: Record<string, { name: string, stat: string, statColor: string, icon: string }> = {
            // Milestone badges
            'Primeiro Passo': {
                name: 'PRIMEIRO PASSO',
                stat: '1° TREINO',
                statColor: '#FFD700',
                icon: 'medal'
            },
            'Maratonista': {
                name: 'MARATONISTA',
                stat: '> 21KM',
                statColor: '#FFD700',
                icon: 'medal'
            },

            // Performance badges
            'Velocista I': {
                name: 'VELOCISTA I',
                stat: 'PACE < 5:30"',
                statColor: '#00D4FF',
                icon: 'speedometer'
            },
            'Velocista II': {
                name: 'VELOCISTA II',
                stat: 'PACE < 5:00"',
                statColor: '#00D4FF',
                icon: 'speedometer'
            },
            'Superação': {
                name: 'SUPERAÇÃO',
                stat: '+5% MELHORA',
                statColor: '#9747FF',
                icon: 'flame'
            },

            // Consistency badges
            'Consistente': {
                name: 'CONSISTENTE',
                stat: '12 TREINOS/30D',
                statColor: '#32CD32',
                icon: 'sun'
            },
            'Semana Completa': {
                name: 'SEMANA COMPLETA',
                stat: 'TODOS TREINOS',
                statColor: '#32CD32',
                icon: 'sun'
            },

            // Streak badges
            'Chama Eterna': {
                name: 'CHAMA ETERNA',
                stat: '30 DIAS SEGUIDOS',
                statColor: '#9747FF',
                icon: 'flame'
            },

            // Exploration badges
            'Na Chuva e no Sol': {
                name: 'NA CHUVA E NO SOL',
                stat: '5 CONDIÇÕES',
                statColor: '#32CD32',
                icon: 'sun'
            },

            // Adherence badges
            'Fiel ao Plano': {
                name: 'FIEL AO PLANO',
                stat: '80% ADERÊNCIA',
                statColor: '#00D4FF',
                icon: 'medal'
            },
        };

        return nameMap[badge.name] || {
            name: badge.name?.toUpperCase() || 'BADGE',
            stat: badge.description || 'Conquista',
            statColor: '#00D4FF',
            icon: 'medal'
        };
    };

    // Real user progression data
    const currentLevel = stats?.current_level || 1;
    const totalXP = stats?.total_points || 0;
    const currentStreak = stats?.current_streak || 0;
    const xpToNext = stats?.points_to_next_level || 250;
    const progressPercentage = totalXP > 0 ? ((totalXP / (totalXP + xpToNext)) * 100) : 0;

    // Level name based on level
    const getLevelName = (level: number) => {
        if (level === 1) return 'Iniciante';
        if (level <= 3) return 'Corredor Amador';
        if (level <= 5) return 'Corredor Nato';
        if (level <= 10) return 'Atleta';
        return 'Campeão';
    };

    // Get earned and locked badges
    const earnedBadges = badges.filter(b => b.earned);
    const lockedBadges = badges.filter(b => !b.earned).slice(0, 3); // Show first 3 locked



    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation?.goBack()}
                    >
                        <BackIcon size={24} color="#00D4FF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Minhas Conquistas</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {/* Level Card */}
                <View style={styles.levelCard}>
                    {/* Top Row: Level Badge and XP Card */}
                    <View style={styles.topRowContainer}>
                        {/* Level Badge - Top Left */}
                        <View style={styles.levelBadge}>
                            <Text style={styles.levelBadgeText}>Nível Atual</Text>
                        </View>

                        {/* XP Card - Top Right */}
                        <View style={styles.xpCard}>
                            <BoltIcon size={20} color="#FFD700" />
                            <View style={styles.xpTextContainer}>
                                <Text style={styles.xpValue}>{totalXP.toLocaleString()}</Text>
                                <Text style={styles.xpLabel}>xp acumulado</Text>
                            </View>
                        </View>
                    </View>

                    {/* Level Info */}
                    <Text style={styles.levelName}>{getLevelName(currentLevel)}</Text>
                    <Text style={styles.levelNumber}>{currentLevel}</Text>

                    <View style={styles.comboRow}>
                        <FireIcon size={18} color="#32CD32" />
                        <Text style={styles.comboText}>Combo: {currentStreak} dias</Text>
                    </View>

                    {/* Progress Section */}
                    <View style={styles.progressSection}>
                        <View style={styles.progressLabelsRow}>
                            <Text style={styles.progressLabelWhite}>Nível {currentLevel}</Text>
                            <Text style={styles.progressLabelWhite}>Próximo</Text>
                            <Text style={styles.xpRemaining}>{xpToNext} XP Restantes</Text>
                        </View>
                        <View style={styles.progressBar}>
                            <View style={[styles.progressFill, { width: `${progressPercentage}%` }]} />
                        </View>
                    </View>
                </View>

                {/* Conquistas Section */}
                <View style={styles.conquistasHeader}>
                    <View style={styles.conquistasTitleRow}>
                        <TrophyIcon size={20} color="#00D4FF" />
                        <Text style={styles.conquistasTitle}>Conquistas</Text>
                    </View>
                    <View style={styles.conquistasCount}>
                        <Text style={styles.conquistasCountNumber}>{earnedBadges.length}</Text>
                        <Text style={styles.conquistasCountText}>/50 DESBLOQUEADOS</Text>
                    </View>
                </View>

                {/* Badges Grid */}
                <View style={styles.badgesGrid}>
                    {earnedBadges.map((badge) => {
                        const displayInfo = getBadgeDisplayInfo(badge);
                        return (
                            <View key={badge.id} style={styles.badgeCard}>
                                <View style={styles.badgeIconContainer}>
                                    {renderBadgeIcon(displayInfo.icon, badge.earned, displayInfo.statColor)}
                                </View>
                                <Text style={styles.badgeName}>{displayInfo.name}</Text>
                                <View style={[styles.badgeStat, { backgroundColor: `${displayInfo.statColor}20` }]}>
                                    <Text style={[styles.badgeStatText, { color: displayInfo.statColor }]}>{displayInfo.stat}</Text>
                                </View>
                            </View>
                        );
                    })}
                </View>

                {/* Próximos Desafios */}
                <View style={styles.lockedSection}>
                    <View style={styles.lockedHeader}>
                        <LockIcon size={24} color="rgba(235,235,245,0.6)" />
                        <Text style={styles.lockedTitle}>Próximos Desafios</Text>
                    </View>
                    <View style={styles.lockedGrid}>
                        {lockedBadges.map((badge) => {
                            const displayInfo = getBadgeDisplayInfo(badge);
                            return (
                                <View key={badge.id} style={styles.lockedCard}>
                                    <View style={styles.lockedIconContainer}>
                                        <View style={{ opacity: 0.3 }}>
                                            {renderBadgeIcon(displayInfo.icon, false)}
                                        </View>
                                        <View style={styles.lockOverlay}>
                                            <LockIcon size={16} color="rgba(235,235,245,0.6)" />
                                        </View>
                                    </View>
                                    <Text style={styles.lockedName}>{displayInfo.name}</Text>
                                    <Text style={styles.lockedSubtitle}>{displayInfo.stat}</Text>
                                </View>
                            );
                        })}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A18',
    },
    scrollView: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#FFFFFF',
    },
    headerSpacer: {
        width: 40,
    },
    levelCard: {
        backgroundColor: '#1C1C2E',
        marginHorizontal: spacing.lg,
        marginBottom: spacing.xl,
        borderRadius: 24,
        padding: spacing.lg,
        position: 'relative',
    },
    levelCardLeft: {
        flex: 1,
    },
    topRowContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.lg,
    },
    levelBadge: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '#00D4FF',
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        borderRadius: 20,
    },
    levelBadgeText: {
        fontSize: 13,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#00D4FF',
    },
    levelName: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    levelNumber: {
        fontSize: 56,
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
        lineHeight: 64,
        marginBottom: spacing.sm,
    },
    comboRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: spacing.xl,
    },
    comboText: {
        fontSize: typography.fontSizes.base,
        color: '#32CD32',
        fontWeight: typography.fontWeights.semibold as any,
    },
    levelProgressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    levelProgressLabel: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235,235,245,0.6)',
    },
    xpRemaining: {
        fontSize: typography.fontSizes.sm,
        color: '#00D4FF',
        fontWeight: typography.fontWeights.semibold as any,
    },
    xpCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '#FFD700',
        borderRadius: 16,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    xpTextContainer: {
        alignItems: 'flex-end',
    },
    xpValue: {
        fontSize: 22,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFD700',
        lineHeight: 26,
    },
    xpLabel: {
        fontSize: 11,
        color: '#FFD700',
    },
    progressSection: {
        width: '100%',
    },
    progressLabelsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        marginBottom: spacing.sm,
    },
    progressLabelWhite: {
        fontSize: typography.fontSizes.sm,
        color: '#FFFFFF',
        fontWeight: typography.fontWeights.semibold as any,
    },
    progressBar: {
        width: '100%',
        height: 10,
        backgroundColor: 'rgba(0, 212, 255, 0.2)',
        borderRadius: 5,
        overflow: 'hidden',
    },
    progressFill: {
        width: '70%',
        height: '100%',
        backgroundColor: '#00D4FF',
        borderRadius: 5,
    },
    conquistasHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.lg,
    },
    conquistasTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    conquistasTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#FFFFFF',
    },
    conquistasCount: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C2E',
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: 16,
    },
    conquistasCountNumber: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
    },
    conquistasCountText: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235,235,245,0.6)',
    },
    badgesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: spacing.lg,
        gap: spacing.md,
        marginBottom: spacing.xl,
    },
    badgeCard: {
        width: '47%',
        backgroundColor: '#1C1C2E',
        borderRadius: 20,
        padding: spacing.lg,
        alignItems: 'center',
    },
    badgeIconContainer: {
        width: 65,
        height: 65,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    badgeName: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: spacing.sm,
    },
    badgeStat: {
        backgroundColor: 'rgba(0,212,255,0.2)',
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeStatText: {
        fontSize: 10,
        color: '#00D4FF',
        fontWeight: typography.fontWeights.medium as any,
    },
    lockedSection: {
        paddingHorizontal: spacing.lg,
        paddingBottom: 120,
    },
    lockedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    lockedTitle: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235,235,245,0.6)',
    },
    lockedGrid: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    lockedCard: {
        flex: 1,
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        padding: spacing.md,
        alignItems: 'center',
    },
    lockedIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.sm,
        position: 'relative',
    },
    lockOverlay: {
        position: 'absolute',
        bottom: -4,
        right: -4,
        backgroundColor: '#1C1C2E',
        borderRadius: 10,
        padding: 2,
    },
    lockedName: {
        fontSize: 11,
        color: 'rgba(235,235,245,0.6)',
        textAlign: 'center',
    },
    lockedSubtitle: {
        fontSize: 11,
        color: 'rgba(235,235,245,0.6)',
        textAlign: 'center',
    },
});
