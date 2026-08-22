import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    RefreshControl,
} from 'react-native';
import { colors, typography, spacing, borderRadius, fonts } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { useGamificationStore, RankingUser } from '../stores/gamificationStore';
import { ScreenContainer } from '../components/ScreenContainer';
import { RankingSkeleton } from '../components/skeletons/ScreenSkeletons';
import { AppIcon } from '../components/ui/AppIcon';
import { AppPressable } from '../components/ui/AppPressable';
import { IconButton } from '../components/ui/IconButton';
import { useResponsiveTheme } from '../theme/responsive';
import { Patent } from '../components/patents/Patent';
import { getCurrentPatent } from '../utils/patents';

const MONTH_NAMES_PT = [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function getUserDisplayName(profile: RankingUser['profile']): string {
    if (profile?.full_name) return profile.full_name;
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
    const imageUrl = profile?.avatar_url || profile?.profile_pic || '';
    const hasImage = imageUrl.startsWith('http');
    return (
        <View style={[
            styles.avatarContainer,
            {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderColor: borderColor || semanticColors.borderSubtle,
                borderWidth: borderColor ? 2 : 1,
            },
        ]}>
            {hasImage ? (
                <Image
                    source={{ uri: imageUrl }}
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
                        <Avatar profile={second.profile} size={64} borderColor={semanticColors.textSecondary} />
                        <View style={[styles.podiumBadge, { backgroundColor: semanticColors.textSecondary }]}>
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
                <Text style={[styles.podiumName, { fontFamily: fonts.bold }]} numberOfLines={1}>
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
                <View style={styles.rankNameRow}>
                    <Text style={styles.rankName} numberOfLines={1}>{getUserDisplayName(user.profile)}</Text>
                    <Patent patent={getCurrentPatent(user.current_level || 1)} size={22} glow={false} />
                </View>
                <View style={styles.streakRow}>
                    <AppIcon name="flame" size={16} tone="accent" variant="filled" />
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

function UserPositionCard({ rank, totalXP, streak, profile, currentLevel }: {
    rank: number;
    totalXP: number;
    streak: number;
    profile: RankingUser['profile'];
    currentLevel: number;
}) {
    return (
        <View style={styles.userPositionCard}>
            <Text style={styles.rankNumber}>{String(rank).padStart(2, '0')}</Text>
            <Avatar profile={profile} size={44} borderColor={colors.primary} />
            <View style={styles.rankInfo}>
                <View style={styles.rankNameRow}>
                    <Text style={[styles.rankName, { color: semanticColors.textPrimary }]}>Você</Text>
                    <Patent patent={getCurrentPatent(currentLevel)} size={22} glow={false} />
                </View>
                <View style={styles.streakRow}>
                    <AppIcon name="flame" size={16} tone="accent" variant="filled" />
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
                <AppPressable onPress={() => navigation.navigate('Badges')}>
                    <Text style={styles.seeAllText}>Ver tudo</Text>
                </AppPressable>
            </View>
            <View style={styles.achievementsCard}>
                <View style={styles.achievementsBadgeRow}>
                    <View style={styles.badgeIconsRow}>
                        {[...Array(Math.min(4, earned))].map((_, i) => (
                            <View key={i} style={[styles.miniBadge, { marginLeft: i > 0 ? -8 : 0 }]}>
                                <AppIcon name="trophy" size={16} tone="accent" variant="filled" />
                            </View>
                        ))}
                        {earned > 4 && (
                            <View style={[styles.miniBadge, { marginLeft: -8, backgroundColor: semanticColors.surface3 }]}>
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

    // Responsividade: phone idêntico. Tablet centraliza a coluna; leaderboard 2-col.
    const r = useResponsiveTheme();

    return (
        <ScreenContainer style={styles.screen}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, r.isTablet && styles.tabletScrollContent]}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                    />
                }
            >
                <View style={r.isTablet ? styles.tabletInner : undefined}>
                {/* Header */}
                <View style={styles.header}>
                    <IconButton
                        icon="chevronBack"
                        accessibilityLabel="Voltar"
                        onPress={() => navigation.goBack()}
                    />
                    <Text style={styles.headerTitle}>Ranking</Text>
                    <View style={styles.headerButton} />
                </View>

                {/* Tab Selector */}
                <View style={styles.tabContainer}>
                    <AppPressable
                        style={[styles.tab, rankingTab === 'cohort' && styles.tabActive]}
                        onPress={() => handleTabChange('cohort')}
                    >
                        <Text style={[styles.tabText, rankingTab === 'cohort' && styles.tabTextActive]}>
                            Meu cohort
                        </Text>
                    </AppPressable>
                    <AppPressable
                        style={[styles.tab, rankingTab === 'global' && styles.tabActive]}
                        onPress={() => handleTabChange('global')}
                    >
                        <Text style={[styles.tabText, rankingTab === 'global' && styles.tabTextActive]}>
                            Global
                        </Text>
                    </AppPressable>
                </View>

                {/* Period Info */}
                <Text style={styles.periodText}>{periodText}</Text>

                {isRankingLoading && rankings.length === 0 ? (
                    <RankingSkeleton />
                ) : rankings.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <AppIcon name="trophy" size={48} tone="tertiary" />
                        <Text style={styles.emptyText}>Nenhum competidor ainda</Text>
                        <Text style={styles.emptySubtext}>Complete treinos para aparecer no ranking!</Text>
                    </View>
                ) : (
                    <>
                        {/* Podium */}
                        <PodiumSection rankings={topThree} />

                        {/* Rest of Rankings — 2 colunas em tablet, lista em phone */}
                        {r.isTablet ? (
                            <View style={styles.rowsGrid}>
                                {visibleRest.map((user) => (
                                    <View key={user.id} style={styles.rowsGridItem}>
                                        <RankingRow user={user} />
                                    </View>
                                ))}
                            </View>
                        ) : (
                            visibleRest.map((user) => (
                                <RankingRow key={user.id} user={user} />
                            ))
                        )}

                        {/* Ver mais button */}
                        {restRankings.length > 4 && !showAll && (
                            <AppPressable
                                style={styles.seeMoreButton}
                                interactionScale="button"
                                onPress={() => setShowAll(true)}
                            >
                                <Text style={styles.seeMoreText}>Ver mais</Text>
                                <AppIcon name="chevronDown" size={16} tone="accent" />
                            </AppPressable>
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
                                currentLevel={currentRanking.userPosition.current_level || 1}
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
                </View>{/* fim tabletInner */}
            </ScrollView>
        </ScreenContainer>
    );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
    screen: {
        backgroundColor: semanticColors.canvas,
    },
    scrollContent: {
        paddingHorizontal: spacing.base,
    },
    // ── Tablet (aditivo; phone nunca usa) ──────────────────────────────────────
    tabletScrollContent: {
        alignItems: 'center',
    },
    tabletInner: {
        width: '100%',
        maxWidth: 820,
    },
    rowsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        columnGap: spacing.base,
    },
    rowsGridItem: {
        width: '48.5%',
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
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
    },

    // Tabs
    tabContainer: {
        flexDirection: 'row',
        marginTop: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: semanticColors.borderSubtle,
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
        fontFamily: fonts.medium,
        color: semanticColors.textTertiary,
    },
    tabTextActive: {
        color: colors.primary,
        fontFamily: fonts.semibold,
    },

    // Period
    periodText: {
        fontFamily: fonts.regular,
        textAlign: 'center',
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
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
        borderColor: semanticColors.borderStrong,
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
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
    },
    podiumName: {
        fontSize: typography.fontSizes.sm,
        fontFamily: fonts.medium,
        color: semanticColors.textPrimary,
        marginTop: spacing.xs,
        maxWidth: 100,
        textAlign: 'center',
    },
    podiumXP: {
        fontSize: typography.fontSizes.sm,
        fontFamily: fonts.semibold,
        color: semanticColors.textSecondary,
        marginTop: 2,
    },

    // Ranking Row
    rankRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    rankNumber: {
        fontSize: typography.fontSizes.lg,
        fontFamily: fonts.semibold,
        color: semanticColors.textSecondary,
        width: 32,
        textAlign: 'center',
    },
    rankInfo: {
        flex: 1,
        marginLeft: spacing.md,
    },
    rankNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    rankName: {
        fontSize: typography.fontSizes.md,
        fontFamily: fonts.semibold,
        color: semanticColors.textPrimary,
        flexShrink: 1,
    },
    streakRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    streakText: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
        marginLeft: 4,
    },
    rankXPContainer: {
        alignItems: 'flex-end',
    },
    rankXPValue: {
        fontSize: typography.fontSizes.lg,
        fontFamily: fonts.bold,
        color: colors.primary,
    },
    rankXPLabel: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
    },

    // User Position Card
    userPositionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginTop: spacing.sm,
        borderWidth: 1.5,
        borderColor: semanticColors.borderStrong,
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
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
        textAlign: 'center',
    },
    seeAllText: {
        fontSize: typography.fontSizes.md,
        color: colors.primary,
        fontFamily: fonts.medium,
    },
    achievementsCard: {
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius.lg,
        padding: spacing.base,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
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
        backgroundColor: semanticColors.surface3,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    miniBadgeText: {
        fontSize: 10,
        fontFamily: fonts.semibold,
        color: semanticColors.textSecondary,
    },
    achievementsCountContainer: {
        alignItems: 'flex-end',
    },
    achievementsLabel: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
    },
    achievementsCount: {
        fontSize: typography.fontSizes.xl,
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
    },
    progressBarBg: {
        height: 6,
        backgroundColor: semanticColors.surface3,
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
        fontFamily: fonts.medium,
        marginRight: 4,
    },

    // Divider
    divider: {
        height: 1,
        backgroundColor: semanticColors.borderSubtle,
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
        fontFamily: fonts.semibold,
        color: semanticColors.textSecondary,
        marginTop: spacing.base,
    },
    emptySubtext: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textTertiary,
        marginTop: spacing.xs,
    },

    // Avatar
    avatarContainer: {
        backgroundColor: semanticColors.surface3,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    avatarText: {
        fontFamily: fonts.bold,
        color: colors.primary,
    },
});

export default RankingScreen;
