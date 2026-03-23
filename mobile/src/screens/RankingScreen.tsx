import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../theme';
import { useGamificationStore, RankingUser } from '../stores/gamificationStore';
import { ScreenContainer } from '../components/ScreenContainer';

const MONTH_NAMES_PT = [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function getUserDisplayName(profile: RankingUser['profile']): string {
    if (profile?.firstname && profile?.lastname) {
        return `${profile.firstname} ${profile.lastname}`;
    }
    if (profile?.firstname) return profile.firstname;
    return 'Corredor';
}

function getUserInitials(profile: RankingUser['profile']): string {
    const first = profile?.firstname?.[0] || '';
    const last = profile?.lastname?.[0] || '';
    return (first + last).toUpperCase() || '?';
}

function formatXP(xp: number): string {
    if (xp >= 1000) {
        return xp.toLocaleString('pt-BR');
    }
    return String(xp);
}

// ─── Avatar Component ──────────────────────────────────────────

function Avatar({ profile, size = 48, borderColor }: {
    profile: RankingUser['profile'];
    size?: number;
    borderColor?: string;
}) {
    const hasImage = !!profile?.profile_pic;
    return (
        <View style={[
            styles.avatarContainer,
            {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderColor: borderColor || colors.border,
                borderWidth: borderColor ? 2 : 1,
            },
        ]}>
            {hasImage ? (
                <Image
                    source={{ uri: profile.profile_pic }}
                    style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }}
                />
            ) : (
                <Text style={[styles.avatarText, { fontSize: size * 0.35 }]}>
                    {getUserInitials(profile)}
                </Text>
            )}
        </View>
    );
}

// ─── Podium Component ──────────────────────────────────────────

function PodiumSection({ rankings }: { rankings: RankingUser[] }) {
    const first = rankings[0];
    const second = rankings[1];
    const third = rankings[2];

    if (!first) return null;

    return (
        <View style={styles.podiumContainer}>
            {/* 2nd Place - Left */}
            {second ? (
                <View style={styles.podiumSide}>
                    <View style={styles.podiumAvatarWrapper}>
                        <Avatar profile={second.profile} size={64} borderColor={colors.textSecondary} />
                        <View style={[styles.podiumBadge, { backgroundColor: colors.textSecondary }]}>
                            <Text style={styles.podiumBadgeText}>#2</Text>
                        </View>
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{getUserDisplayName(second.profile)}</Text>
                    <Text style={styles.podiumXP}>{formatXP(second.total_xp)} PTS</Text>
                </View>
            ) : <View style={styles.podiumSide} />}

            {/* 1st Place - Center (elevated) */}
            <View style={[styles.podiumCenter]}>
                <View style={[styles.podiumFirstWrapper]}>
                    <Avatar profile={first.profile} size={80} borderColor={colors.primary} />
                    <View style={[styles.podiumBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.podiumBadgeText}>#1</Text>
                    </View>
                </View>
                <Text style={[styles.podiumName, { fontWeight: typography.fontWeights.bold }]} numberOfLines={1}>
                    {getUserDisplayName(first.profile)}
                </Text>
                <Text style={[styles.podiumXP, { color: colors.primary }]}>{formatXP(first.total_xp)} PTS</Text>
            </View>

            {/* 3rd Place - Right */}
            {third ? (
                <View style={styles.podiumSide}>
                    <View style={styles.podiumAvatarWrapper}>
                        <Avatar profile={third.profile} size={64} borderColor='#CD7F32' />
                        <View style={[styles.podiumBadge, { backgroundColor: '#CD7F32' }]}>
                            <Text style={styles.podiumBadgeText}>#3</Text>
                        </View>
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{getUserDisplayName(third.profile)}</Text>
                    <Text style={styles.podiumXP}>{formatXP(third.total_xp)} PTS</Text>
                </View>
            ) : <View style={styles.podiumSide} />}
        </View>
    );
}

// ─── Ranking Row Component ─────────────────────────────────────

function RankingRow({ user }: { user: RankingUser }) {
    return (
        <View style={styles.rankRow}>
            <Text style={styles.rankNumber}>{String(user.rank).padStart(2, '0')}</Text>
            <Avatar profile={user.profile} size={44} />
            <View style={styles.rankInfo}>
                <Text style={styles.rankName} numberOfLines={1}>{getUserDisplayName(user.profile)}</Text>
                <View style={styles.streakRow}>
                    <MaterialCommunityIcons name="fire" size={14} color={colors.primary} />
                    <Text style={styles.streakText}>
                        {user.current_streak > 0 ? `${String(user.current_streak).padStart(2, '0')} dias de sequência` : '0 dias de sequência'}
                    </Text>
                </View>
            </View>
            <View style={styles.rankXPContainer}>
                <Text style={styles.rankXPValue}>{formatXP(user.total_xp)}</Text>
                <Text style={styles.rankXPLabel}>PTS total</Text>
            </View>
        </View>
    );
}

// ─── User Position Card ────────────────────────────────────────

function UserPositionCard({ rank, totalXP, streak, profile }: {
    rank: number;
    totalXP: number;
    streak: number;
    profile: RankingUser['profile'];
}) {
    return (
        <View style={styles.userPositionCard}>
            <Text style={styles.rankNumber}>{String(rank).padStart(2, '0')}</Text>
            <Avatar profile={profile} size={44} borderColor={colors.primary} />
            <View style={styles.rankInfo}>
                <Text style={[styles.rankName, { color: colors.text }]}>Você</Text>
                <View style={styles.streakRow}>
                    <MaterialCommunityIcons name="fire" size={14} color={colors.primary} />
                    <Text style={styles.streakText}>
                        {streak > 0 ? `${String(streak).padStart(2, '0')} dias de sequência` : '0 dias de sequência'}
                    </Text>
                </View>
            </View>
            <View style={styles.rankXPContainer}>
                <Text style={[styles.rankXPValue, { color: colors.primary }]}>{formatXP(totalXP)}</Text>
                <Text style={styles.rankXPLabel}>PTS total</Text>
            </View>
        </View>
    );
}

// ─── Achievements Section ──────────────────────────────────────

function AchievementsSection({ earned, total, navigation }: {
    earned: number;
    total: number;
    navigation: any;
}) {
    const progress = total > 0 ? earned / total : 0;

    return (
        <View style={styles.achievementsSection}>
            <View style={styles.achievementsHeader}>
                <Text style={styles.sectionTitle}>Suas conquistas</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Badges')}>
                    <Text style={styles.seeAllText}>Ver tudo</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.achievementsCard}>
                <View style={styles.achievementsBadgeRow}>
                    <View style={styles.badgeIconsRow}>
                        {[...Array(Math.min(4, earned))].map((_, i) => (
                            <View key={i} style={[styles.miniBadge, { marginLeft: i > 0 ? -8 : 0 }]}>
                                <Ionicons name="trophy" size={16} color={colors.primary} />
                            </View>
                        ))}
                        {earned > 4 && (
                            <View style={[styles.miniBadge, { marginLeft: -8, backgroundColor: colors.card }]}>
                                <Text style={styles.miniBadgeText}>+{earned - 4}</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.achievementsCountContainer}>
                        <Text style={styles.achievementsLabel}>Desbloqueados</Text>
                        <Text style={styles.achievementsCount}>{earned}/{total}</Text>
                    </View>
                </View>
                <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
                </View>
            </View>
        </View>
    );
}

// ─── Main Screen ───────────────────────────────────────────────

export function RankingScreen({ navigation }: any) {
    const {
        rankingTab,
        setRankingTab,
        globalRanking,
        cohortRanking,
        isRankingLoading,
        fetchGlobalRanking,
        fetchCohortRanking,
        badges,
        earnedBadges,
        fetchBadges,
        fetchStats,
    } = useGamificationStore();

    const [showAll, setShowAll] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = useCallback(async () => {
        const promises = [fetchBadges(), fetchStats()];
        if (rankingTab === 'cohort') {
            promises.push(fetchCohortRanking());
        } else {
            promises.push(fetchGlobalRanking());
        }
        await Promise.all(promises);
    }, [rankingTab, fetchBadges, fetchStats, fetchCohortRanking, fetchGlobalRanking]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, [loadData]);

    const handleTabChange = (tab: 'cohort' | 'global') => {
        setRankingTab(tab);
        setShowAll(false);
    };

    const currentRanking = rankingTab === 'cohort' ? cohortRanking : globalRanking;
    const rankings = currentRanking?.rankings || [];
    const topThree = rankings.slice(0, 3);
    const restRankings = rankings.slice(3);
    const visibleRest = showAll ? restRankings : restRankings.slice(0, 4);

    const periodText = rankingTab === 'cohort' && currentRanking?.cohortInfo
        ? `${MONTH_NAMES_PT[currentRanking.cohortInfo.month]} ${currentRanking.cohortInfo.year} - ${currentRanking.cohortInfo.totalCompetitors} competidores`
        : `${currentRanking?.totalParticipants || 0} competidores`;

    return (
        <ScreenContainer>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                    />
                }
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Ranking</Text>
                    <TouchableOpacity style={styles.headerButton}>
                        <Ionicons name="share-social-outline" size={22} color={colors.text} />
                    </TouchableOpacity>
                </View>

                {/* Tab Selector */}
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tab, rankingTab === 'cohort' && styles.tabActive]}
                        onPress={() => handleTabChange('cohort')}
                    >
                        <Text style={[styles.tabText, rankingTab === 'cohort' && styles.tabTextActive]}>
                            Meu cohort
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, rankingTab === 'global' && styles.tabActive]}
                        onPress={() => handleTabChange('global')}
                    >
                        <Text style={[styles.tabText, rankingTab === 'global' && styles.tabTextActive]}>
                            Global
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Period Info */}
                <Text style={styles.periodText}>{periodText}</Text>

                {isRankingLoading && rankings.length === 0 ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : rankings.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="trophy-outline" size={64} color={colors.textMuted} />
                        <Text style={styles.emptyText}>Nenhum competidor ainda</Text>
                        <Text style={styles.emptySubtext}>Complete treinos para aparecer no ranking!</Text>
                    </View>
                ) : (
                    <>
                        {/* Podium */}
                        <PodiumSection rankings={topThree} />

                        {/* Rest of Rankings */}
                        {visibleRest.map((user) => (
                            <RankingRow key={user.id} user={user} />
                        ))}

                        {/* Ver mais button */}
                        {restRankings.length > 4 && !showAll && (
                            <TouchableOpacity
                                style={styles.seeMoreButton}
                                onPress={() => setShowAll(true)}
                            >
                                <Text style={styles.seeMoreText}>Ver mais</Text>
                                <Ionicons name="chevron-down" size={18} color={colors.primary} />
                            </TouchableOpacity>
                        )}

                        {/* Divider */}
                        <View style={styles.divider} />

                        {/* User Position */}
                        <Text style={styles.sectionTitle}>Sua Posição</Text>
                        {currentRanking?.userPosition && (
                            <UserPositionCard
                                rank={currentRanking.userPosition.rank}
                                totalXP={currentRanking.userPosition.total_xp}
                                streak={currentRanking.userPosition.current_streak}
                                profile={currentRanking.userPosition.profile as RankingUser['profile']}
                            />
                        )}
                    </>
                )}

                {/* Achievements */}
                <AchievementsSection
                    earned={earnedBadges.length}
                    total={badges.length}
                    navigation={navigation}
                />

                {/* Bottom padding for tab bar */}
                <View style={{ height: 100 }} />
            </ScrollView>
        </ScreenContainer>
    );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scrollContent: {
        paddingHorizontal: spacing.base,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.md,
    },
    headerButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },

    // Tabs
    tabContainer: {
        flexDirection: 'row',
        marginTop: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    tab: {
        flex: 1,
        paddingVertical: spacing.md,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: colors.primary,
    },
    tabText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.medium,
        color: colors.textMuted,
    },
    tabTextActive: {
        color: colors.primary,
        fontWeight: typography.fontWeights.semibold,
    },

    // Period
    periodText: {
        textAlign: 'center',
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        marginTop: spacing.md,
        marginBottom: spacing.lg,
    },

    // Podium
    podiumContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingVertical: spacing.xl,
        marginBottom: spacing.lg,
    },
    podiumSide: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 24,
    },
    podiumCenter: {
        flex: 1,
        alignItems: 'center',
    },
    podiumAvatarWrapper: {
        position: 'relative',
        marginBottom: spacing.sm,
    },
    podiumFirstWrapper: {
        position: 'relative',
        marginBottom: spacing.sm,
        borderRadius: 50,
        padding: 3,
        borderWidth: 2,
        borderColor: colors.primary,
    },
    podiumBadge: {
        position: 'absolute',
        bottom: -4,
        alignSelf: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: borderRadius.sm,
    },
    podiumBadgeText: {
        fontSize: 10,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    podiumName: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.medium,
        color: colors.text,
        marginTop: spacing.xs,
        maxWidth: 100,
        textAlign: 'center',
    },
    podiumXP: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
        marginTop: 2,
    },

    // Ranking Row
    rankRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    rankNumber: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
        width: 32,
        textAlign: 'center',
    },
    rankInfo: {
        flex: 1,
        marginLeft: spacing.md,
    },
    rankName: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        color: colors.text,
    },
    streakRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    streakText: {
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
        marginLeft: 4,
    },
    rankXPContainer: {
        alignItems: 'flex-end',
    },
    rankXPValue: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
    },
    rankXPLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },

    // User Position Card
    userPositionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginTop: spacing.sm,
        borderWidth: 1.5,
        borderColor: colors.primary,
    },

    // Achievements
    achievementsSection: {
        marginTop: spacing.xl,
    },
    achievementsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    sectionTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        textAlign: 'center',
    },
    seeAllText: {
        fontSize: typography.fontSizes.md,
        color: colors.primary,
        fontWeight: typography.fontWeights.medium,
    },
    achievementsCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.base,
        borderWidth: 1,
        borderColor: colors.border,
    },
    achievementsBadgeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    badgeIconsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    miniBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.highlight,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    miniBadgeText: {
        fontSize: 10,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
    },
    achievementsCountContainer: {
        alignItems: 'flex-end',
    },
    achievementsLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    achievementsCount: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    progressBarBg: {
        height: 6,
        backgroundColor: colors.highlight,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: 3,
    },

    // See More
    seeMoreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.md,
    },
    seeMoreText: {
        fontSize: typography.fontSizes.md,
        color: colors.primary,
        fontWeight: typography.fontWeights.medium,
        marginRight: 4,
    },

    // Divider
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: spacing.lg,
    },

    // Loading & Empty
    loadingContainer: {
        paddingVertical: 80,
        alignItems: 'center',
    },
    emptyContainer: {
        paddingVertical: 60,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
        marginTop: spacing.base,
    },
    emptySubtext: {
        fontSize: typography.fontSizes.md,
        color: colors.textMuted,
        marginTop: spacing.xs,
    },

    // Avatar
    avatarContainer: {
        backgroundColor: colors.highlight,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    avatarText: {
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
    },
});

export default RankingScreen;
